import { Router } from 'express';
import fetch from 'node-fetch';
import { ethers } from 'ethers';
import { EncryptionService } from '../services/EncryptionService';
import { PinataStorage } from '../services/PinataStorage';
import { EvmService } from '../services/EvmService';
import { ServerConfig } from '../types';

// TrainingDataManager ABI for on-chain writes
const TRAINING_DATA_MANAGER_ABI = [
    'function assignTrainingData(string modelId, string blobId, uint256 score) external',
    'function getTrainingData(string modelId) view returns (string[])',
    'event TrainingDataAssigned(bytes32 indexed modelIdHash, string modelId, string blobId, uint256 score)',
];

// ModelRegistry ABI for reading model count
const MODEL_REGISTRY_ABI = [
    'function modelCount() view returns (uint256)',
    'function getMetadataHash(string modelId) view returns (string)',
];

function redactPII(text: string): string {
    let redacted = text.replace(
        /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
        '[REDACTED_EMAIL]',
    );
    redacted = redacted.replace(
        /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
        '[REDACTED_PHONE]',
    );
    redacted = redacted.replace(
        /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,7}\b/g,
        '[REDACTED_CARD]',
    );
    redacted = redacted.replace(
        /\b\d{3}-\d{2}-\d{4}\b/g,
        '[REDACTED_ID]',
    );
    return redacted;
}

function deriveAction(score: number): 'ingest' | 'review' | 'skip' {
    if (score >= 70) return 'ingest';
    if (score >= 40) return 'review';
    return 'skip';
}

export function createLocalCRERoutes(
    encryptionService: EncryptionService,
    pinataStorage: PinataStorage,
    evmService: EvmService,
    openaiApiKey: string,
    config: ServerConfig
): Router {
    const router = Router();

    /**
     * POST /api/local/evaluate-session
     *
     * Local simulation of the CRE session-evaluator workflow.
     * Replicates the same flow: fetch from Pinata -> decrypt -> PII redact ->
     * OpenAI summarize -> score against each model -> assign training data on-chain.
     *
     * Body: { cid, encryptionKey?, iv?, authTag?, sessionId }
     */
    router.post('/api/local/evaluate-session', async (req, res) => {
        try {
            const { cid, encryptionKey, iv, authTag, sessionId } = req.body;

            if (!cid || !sessionId) {
                return res.status(400).json({ error: 'cid and sessionId are required' });
            }

            if (!openaiApiKey) {
                return res.status(503).json({ error: 'OPENAI_API_KEY not configured' });
            }

            console.log(`[Local CRE] Evaluating session ${sessionId}, CID: ${cid}`);

            // Step 1: Fetch from Pinata IPFS (with retry on different gateways)
            const gateways = [
                config.pinataGatewayUrl,
                'https://gateway.pinata.cloud',
                'https://cloudflare-ipfs.com',
                'https://dweb.link',
            ];

            let ipfsData: any = null;
            for (const gw of gateways) {
                const ipfsUrl = `${gw}/ipfs/${cid}`;
                console.log(`[Local CRE] Fetching from ${ipfsUrl}`);
                try {
                    const ipfsResponse = await fetch(ipfsUrl, {
                        headers: { 'Accept': 'application/json' },
                    });
                    if (ipfsResponse.ok) {
                        ipfsData = await ipfsResponse.json();
                        break;
                    }
                    console.warn(`[Local CRE] Gateway ${gw} returned ${ipfsResponse.status}, trying next...`);
                } catch (err: any) {
                    console.warn(`[Local CRE] Gateway ${gw} failed: ${err.message}, trying next...`);
                }
            }

            if (!ipfsData) {
                throw new Error(`IPFS fetch failed for CID ${cid} from all gateways`);
            }

            // Step 2: Decrypt session data (or parse plain JSON)
            let sessionData: any;
            if (encryptionKey && ipfsData.encryptedData) {
                const decryptedJson = encryptionService.decrypt(
                    ipfsData.encryptedData,
                    ipfsData.encryptionKey || encryptionKey,
                    ipfsData.iv || iv,
                    ipfsData.authTag || authTag
                );
                sessionData = JSON.parse(decryptedJson);
            } else {
                // Unencrypted session or already parsed
                sessionData = ipfsData;
            }

            console.log(`[Local CRE] Session has ${sessionData.messages?.length || 0} messages`);

            // Step 3: Build transcript and redact PII
            const messages = sessionData.messages || [];
            const transcript = messages
                .filter((m: any) => m.type === 'message' || m.role)
                .map((m: any) => {
                    const speaker = m.role || (m.direction === 'incoming' ? 'user' : 'assistant');
                    return `${speaker}: ${m.content || m.text}`;
                })
                .join('\n');

            const redactedTranscript = redactPII(transcript);
            console.log(`[Local CRE] Transcript: ${redactedTranscript.length} chars (PII redacted)`);

            if (!redactedTranscript.trim()) {
                return res.json({
                    sessionId, cid, summary: 'Empty session', models: [], assignments: []
                });
            }

            // Step 4: Summarize via OpenAI
            console.log(`[Local CRE] Summarizing via OpenAI...`);
            const summarizeResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an AI training data evaluator. Summarize the following chat session transcript concisely. Focus on the topics discussed, the quality of the conversation, and the types of knowledge demonstrated. Output only the summary text.',
                        },
                        { role: 'user', content: redactedTranscript },
                    ],
                    max_tokens: 500,
                    temperature: 0.3,
                }),
            });

            if (!summarizeResponse.ok) {
                const errorText = await summarizeResponse.text();
                throw new Error(`OpenAI summarization failed (${summarizeResponse.status}): ${errorText}`);
            }

            const summarizeBody = await summarizeResponse.json() as any;
            const summary = summarizeBody.choices?.[0]?.message?.content?.trim();

            if (!summary) {
                throw new Error('OpenAI returned empty summary');
            }

            console.log(`[Local CRE] Summary: ${summary.substring(0, 100)}...`);

            // Step 5: Read model count from on-chain ModelRegistry
            const provider = new ethers.JsonRpcProvider(config.evmRpcUrl);
            const modelRegistry = new ethers.Contract(
                config.registryAddress,
                MODEL_REGISTRY_ABI,
                provider
            );

            let modelCount: bigint;
            try {
                modelCount = await modelRegistry.modelCount();
            } catch (error) {
                console.warn(`[Local CRE] Failed to read modelCount:`, error);
                modelCount = 0n;
            }

            console.log(`[Local CRE] ModelRegistry reports ${modelCount.toString()} models`);

            if (modelCount === 0n) {
                return res.json({ sessionId, cid, summary, models: [], assignments: [] });
            }

            // Step 6: Score summary against each registered model
            const modelScores: Array<{ modelId: string; score: number; action: string }> = [];
            const assignments: string[] = [];
            const scoreThreshold = 70;

            for (let i = 0n; i < modelCount; i++) {
                const modelId = `model-${i.toString()}`;

                let metadataHash = '';
                try {
                    metadataHash = await modelRegistry.getMetadataHash(modelId);
                } catch {
                    console.warn(`[Local CRE] Failed to read metadata for ${modelId}`);
                }

                console.log(`[Local CRE] Scoring against ${modelId} (metadata: ${metadataHash || 'N/A'})`);

                const scoreResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openaiApiKey}`,
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            {
                                role: 'system',
                                content: 'You are an AI training data relevance evaluator. Given a chat session summary and a target AI model description, score the relevance of this session data for training the model. Output ONLY a single integer between 0 and 100, where 0 means completely irrelevant and 100 means perfectly relevant. Output nothing else.',
                            },
                            {
                                role: 'user',
                                content: `Session summary:\n${summary}\n\nTarget model ID: ${modelId}\nModel metadata hash: ${metadataHash}\n\nRelevance score (0-100):`,
                            },
                        ],
                        max_tokens: 10,
                        temperature: 0.1,
                    }),
                });

                if (!scoreResponse.ok) {
                    console.warn(`[Local CRE] Scoring failed for ${modelId}: ${scoreResponse.status}`);
                    continue;
                }

                const scoreBody = await scoreResponse.json() as any;
                const rawScoreText = scoreBody.choices?.[0]?.message?.content?.trim();
                const parsedScore = parseInt(rawScoreText, 10);

                if (isNaN(parsedScore)) {
                    console.warn(`[Local CRE] Non-numeric score for ${modelId}: ${rawScoreText}`);
                    continue;
                }

                const score = Math.max(0, Math.min(100, parsedScore));
                const action = deriveAction(score);

                modelScores.push({ modelId, score, action });
                console.log(`[Local CRE] ${modelId}: score=${score}, action=${action}`);

                // Step 7: Assign training data on-chain if score >= threshold
                if (score >= scoreThreshold) {
                    try {
                        const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
                        if (!deployerKey) {
                            console.warn(`[Local CRE] No DEPLOYER_PRIVATE_KEY, skipping on-chain write`);
                            continue;
                        }

                        const trainingDataManagerAddress = process.env.TRAINING_DATA_MANAGER_ADDRESS;
                        if (!trainingDataManagerAddress) {
                            console.warn(`[Local CRE] No TRAINING_DATA_MANAGER_ADDRESS, skipping on-chain write`);
                            continue;
                        }

                        const signer = new ethers.Wallet(deployerKey, provider);
                        const trainingDataManager = new ethers.Contract(
                            trainingDataManagerAddress,
                            TRAINING_DATA_MANAGER_ABI,
                            signer
                        );

                        console.log(`[Local CRE] Assigning CID ${cid} to ${modelId} (score: ${score})...`);
                        const tx = await trainingDataManager.assignTrainingData(modelId, cid, score);
                        const receipt = await tx.wait();
                        const txHash = receipt.hash;

                        assignments.push(txHash);
                        console.log(`[Local CRE] Training data assigned: tx ${txHash}`);
                    } catch (error) {
                        console.error(`[Local CRE] On-chain write failed for ${modelId}:`, error);
                    }
                }
            }

            const result = {
                sessionId,
                cid,
                summary,
                models: modelScores,
                assignments,
            };

            console.log(`[Local CRE] Evaluation complete: ${modelScores.length} models scored, ${assignments.length} assignments`);
            res.json(result);

        } catch (error) {
            console.error('[Local CRE] Error:', error);
            res.status(500).json({
                error: `Local CRE evaluation failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    });

    /**
     * POST /api/local/generate-proof
     *
     * Local simulation of the CRE proof-generator workflow.
     * Verifies model on-chain, computes proof hash, stores proof via direct tx.
     *
     * Body: { modelId, sessionHashes, timestampMs }
     */
    router.post('/api/local/generate-proof', async (req, res) => {
        try {
            const { modelId, sessionHashes, timestampMs } = req.body;

            if (!modelId || !sessionHashes || !Array.isArray(sessionHashes) || !timestampMs) {
                return res.status(400).json({ error: 'modelId, sessionHashes (array), and timestampMs are required' });
            }

            // Validate each session hash is exactly 32 bytes (0x + 64 hex chars)
            for (const hash of sessionHashes) {
                if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
                    return res.status(400).json({
                        error: `Invalid session hash: "${hash}". Must be 0x-prefixed, exactly 32 bytes (64 hex chars).`
                    });
                }
            }

            const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
            if (!deployerKey) {
                return res.status(503).json({ error: 'DEPLOYER_PRIVATE_KEY not configured' });
            }

            const finetuneProofRegistryAddress = config.finetuneProofRegistryAddress;
            if (!finetuneProofRegistryAddress || finetuneProofRegistryAddress === ethers.ZeroAddress) {
                return res.status(503).json({ error: 'FINETUNE_PROOF_REGISTRY_ADDRESS not configured' });
            }

            console.log(`[Local CRE] Proof requested for model "${modelId}" with ${sessionHashes.length} session(s)`);

            const provider = new ethers.JsonRpcProvider(config.evmRpcUrl);
            const signer = new ethers.Wallet(deployerKey, provider);

            // Step 1: Verify model exists on-chain
            const modelRegistry = new ethers.Contract(
                config.registryAddress,
                ['function getModel(string modelId) view returns (tuple(string modelId, address owner, string metadataHash, string dockerfileHash, uint256 createdAt, uint256 updatedAt, address[] serverAllowlist))'],
                provider
            );

            try {
                const model = await modelRegistry.getModel(modelId);
                if (!model || model.owner === ethers.ZeroAddress) {
                    return res.status(404).json({ error: `Model "${modelId}" not registered` });
                }
                console.log(`[Local CRE] Model "${modelId}" verified — owner ${model.owner}`);
            } catch (error) {
                console.warn(`[Local CRE] Could not verify model on-chain (may not be registered):`, error);
            }

            // Step 2: Compute proof hash
            const abiCoder = new ethers.AbiCoder();
            const encoded = abiCoder.encode(
                ['string', 'uint256', 'bytes32[]'],
                [modelId, timestampMs, sessionHashes]
            );
            const proofHash = ethers.keccak256(encoded);
            console.log(`[Local CRE] Proof hash: ${proofHash}`);

            // Step 3: Sign the proof hash
            const signature = await signer.signMessage(ethers.getBytes(proofHash));
            console.log(`[Local CRE] Proof signed by ${signer.address}`);

            // Step 4: Store proof on-chain
            const PROOF_REGISTRY_ABI = [
                'function storeProof(string modelId, uint256 timestampMs, bytes32[] sessionHashes, bytes signature) external returns (uint256)',
                'event ProofStored(uint256 indexed proofId, bytes32 indexed modelIdHash, string modelId, uint256 timestampMs)',
            ];

            const proofRegistry = new ethers.Contract(
                finetuneProofRegistryAddress,
                PROOF_REGISTRY_ABI,
                signer
            );

            console.log(`[Local CRE] Storing proof on-chain...`);
            const tx = await proofRegistry.storeProof(
                modelId,
                timestampMs,
                sessionHashes,
                signature
            );
            const receipt = await tx.wait();
            const txHash = receipt.hash;

            // Try to extract proofId from event
            let proofId = txHash;
            for (const log of receipt.logs) {
                try {
                    const parsed = proofRegistry.interface.parseLog({
                        topics: [...log.topics],
                        data: log.data,
                    });
                    if (parsed && parsed.name === 'ProofStored') {
                        proofId = parsed.args.proofId.toString();
                    }
                } catch {
                    // not our event
                }
            }

            console.log(`[Local CRE] Proof stored: proofId=${proofId}, tx=${txHash}`);

            res.json({
                proofId,
                txHash,
                modelId,
                proofHash,
                signer: signer.address,
            });

        } catch (error) {
            console.error('[Local CRE] Proof generation error:', error);
            res.status(500).json({
                error: `Local proof generation failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    });

    return router;
}

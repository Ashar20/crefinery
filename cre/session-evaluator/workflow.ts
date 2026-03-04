import {
	bytesToHex,
	ConsensusAggregationByFields,
	cre,
	encodeCallMsg,
	getNetwork,
	type HTTPPayload,
	type HTTPSendRequester,
	LAST_FINALIZED_BLOCK_NUMBER,
	identical,
	median,
	prepareReportRequest,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import { type Address, decodeFunctionResult, encodeFunctionData, zeroAddress } from 'viem'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Config Schema
// ---------------------------------------------------------------------------

export const configSchema = z.object({
	pinataGatewayUrl: z.string(),
	openaiModel: z.string().default('gpt-4o-mini'),
	scoreThreshold: z.number().default(70),
	chainSelectorName: z.string(),
	trainingDataManagerAddress: z.string(),
	modelRegistryAddress: z.string(),
	gasLimit: z.string(),
})

type Config = z.infer<typeof configSchema>

// ---------------------------------------------------------------------------
// ABIs (inline, following existing repo convention)
// ---------------------------------------------------------------------------

export const ModelRegistryABI = [
	{
		inputs: [],
		name: 'modelCount',
		outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{ internalType: 'string', name: 'modelId', type: 'string' }],
		name: 'getMetadataHash',
		outputs: [{ internalType: 'string', name: '', type: 'string' }],
		stateMutability: 'view',
		type: 'function',
	},
	{
		anonymous: false,
		inputs: [
			{ indexed: true, internalType: 'bytes32', name: 'modelIdHash', type: 'bytes32' },
			{ indexed: false, internalType: 'string', name: 'modelId', type: 'string' },
			{ indexed: true, internalType: 'address', name: 'owner', type: 'address' },
			{ indexed: false, internalType: 'string', name: 'metadataHash', type: 'string' },
			{ indexed: false, internalType: 'string', name: 'dockerfileHash', type: 'string' },
		],
		name: 'ModelRegistered',
		type: 'event',
	},
] as const

export const TrainingDataManagerABI = [
	{
		inputs: [
			{ internalType: 'string', name: 'modelId', type: 'string' },
			{ internalType: 'string', name: 'blobId', type: 'string' },
			{ internalType: 'uint256', name: 'score', type: 'uint256' },
		],
		name: 'assignTrainingData',
		outputs: [],
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		inputs: [{ internalType: 'string', name: 'modelId', type: 'string' }],
		name: 'getTrainingData',
		outputs: [{ internalType: 'string[]', name: '', type: 'string[]' }],
		stateMutability: 'view',
		type: 'function',
	},
	{
		anonymous: false,
		inputs: [
			{ indexed: true, internalType: 'bytes32', name: 'modelIdHash', type: 'bytes32' },
			{ indexed: false, internalType: 'string', name: 'modelId', type: 'string' },
			{ indexed: false, internalType: 'string', name: 'blobId', type: 'string' },
			{ indexed: false, internalType: 'uint256', name: 'score', type: 'uint256' },
		],
		name: 'TrainingDataAssigned',
		type: 'event',
	},
] as const

// ---------------------------------------------------------------------------
// HTTP trigger payload shape (parsed from trigger input bytes)
// ---------------------------------------------------------------------------

interface SessionClosedPayload {
	cid: string
	encryptionKey: string
	iv: string
	authTag: string
	sessionId: string
}

// ---------------------------------------------------------------------------
// Session message types
// ---------------------------------------------------------------------------

interface SessionMessage {
	role: string
	content: string
	timestamp?: string
}

interface SessionData {
	sessionId: string
	messages: SessionMessage[]
	metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Model scoring result
// ---------------------------------------------------------------------------

interface ModelScore {
	modelId: string
	score: number
	action: 'ingest' | 'review' | 'skip'
}

// ---------------------------------------------------------------------------
// PII Redaction
// ---------------------------------------------------------------------------

function redactPII(text: string): string {
	// Email addresses
	let redacted = text.replace(
		/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
		'[REDACTED_EMAIL]',
	)

	// Phone numbers (international and US formats)
	redacted = redacted.replace(
		/(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
		'[REDACTED_PHONE]',
	)

	// Credit/debit card numbers (13-19 digits, possibly separated by spaces or dashes)
	redacted = redacted.replace(
		/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,7}\b/g,
		'[REDACTED_CARD]',
	)

	// SSN / National IDs (xxx-xx-xxxx pattern)
	redacted = redacted.replace(
		/\b\d{3}-\d{2}-\d{4}\b/g,
		'[REDACTED_ID]',
	)

	return redacted
}

// ---------------------------------------------------------------------------
// AES-256-GCM Decryption
// ---------------------------------------------------------------------------

function decryptSession(
	encryptedData: Uint8Array,
	keyHex: string,
	ivHex: string,
	authTagHex: string,
): SessionData {
	const keyBytes = hexToBytes(keyHex)
	const ivBytes = hexToBytes(ivHex)
	const authTagBytes = hexToBytes(authTagHex)

	const nodeCrypto = require('crypto')
	const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', keyBytes, ivBytes)
	decipher.setAuthTag(authTagBytes)

	const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()])
	const plaintext = decrypted.toString('utf-8')

	return JSON.parse(plaintext) as SessionData
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith('0x') ? hex.slice(2) : hex
	const bytes = new Uint8Array(clean.length / 2)
	for (let i = 0; i < clean.length; i += 2) {
		bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16)
	}
	return bytes
}

// ---------------------------------------------------------------------------
// Build transcript from session messages
// ---------------------------------------------------------------------------

function buildTranscript(messages: SessionMessage[]): string {
	return messages
		.map((msg) => `${msg.role}: ${msg.content}`)
		.join('\n')
}

// ---------------------------------------------------------------------------
// Pinata IPFS fetch worker (runs inside HTTPClient.sendRequest consensus)
// ---------------------------------------------------------------------------

interface IpfsFetchResult {
	data: number[]
	statusCode: number
}

function fetchFromPinata(
	sendRequester: HTTPSendRequester,
	gatewayUrl: string,
	cid: string,
): IpfsFetchResult {
	const url = `${gatewayUrl}/ipfs/${cid}`
	const response = sendRequester.sendRequest({ method: 'GET', url }).result()

	if (response.statusCode !== 200) {
		throw new Error(`Pinata fetch failed with status ${response.statusCode} for CID ${cid}`)
	}

	return {
		data: Array.from(response.body),
		statusCode: response.statusCode,
	}
}

// ---------------------------------------------------------------------------
// Derive action from score
// ---------------------------------------------------------------------------

function deriveAction(score: number): 'ingest' | 'review' | 'skip' {
	if (score >= 70) return 'ingest'
	if (score >= 40) return 'review'
	return 'skip'
}

// ---------------------------------------------------------------------------
// EVM helpers
// ---------------------------------------------------------------------------

function readModelCount(runtime: Runtime<Config>): bigint {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.chainSelectorName,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(`Network not found for chain: ${runtime.config.chainSelectorName}`)
	}

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const callData = encodeFunctionData({
		abi: ModelRegistryABI,
		functionName: 'modelCount',
	})

	const result = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: runtime.config.modelRegistryAddress as Address,
				data: callData,
			}),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()

	const hexData = bytesToHex(result.data)
	runtime.log(`modelCount raw response: ${hexData} (${result.data.length} bytes)`)

	if (!hexData || hexData === '0x' || result.data.length === 0) {
		runtime.log('ModelRegistry returned empty data — assuming 0 models (contract may not be deployed)')
		return 0n
	}

	return decodeFunctionResult({
		abi: ModelRegistryABI,
		functionName: 'modelCount',
		data: hexData,
	}) as bigint
}

function readMetadataHash(runtime: Runtime<Config>, modelId: string): string {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.chainSelectorName,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(`Network not found for chain: ${runtime.config.chainSelectorName}`)
	}

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const callData = encodeFunctionData({
		abi: ModelRegistryABI,
		functionName: 'getMetadataHash',
		args: [modelId],
	})

	const result = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: runtime.config.modelRegistryAddress as Address,
				data: callData,
			}),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()

	const hexData = bytesToHex(result.data)
	if (!hexData || hexData === '0x' || result.data.length === 0) {
		runtime.log(`getMetadataHash returned empty for model ${modelId}`)
		return ''
	}

	return decodeFunctionResult({
		abi: ModelRegistryABI,
		functionName: 'getMetadataHash',
		data: hexData,
	}) as string
}

function assignTrainingData(
	runtime: Runtime<Config>,
	modelId: string,
	blobId: string,
	score: bigint,
): string {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.chainSelectorName,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(`Network not found for chain: ${runtime.config.chainSelectorName}`)
	}

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const callData = encodeFunctionData({
		abi: TrainingDataManagerABI,
		functionName: 'assignTrainingData',
		args: [modelId, blobId, score],
	})

	const reportResponse = runtime.report(prepareReportRequest(callData)).result()

	const writeResult = evmClient
		.writeReport(runtime, {
			receiver: runtime.config.trainingDataManagerAddress as Address,
			report: reportResponse,
			gasConfig: { gasLimit: runtime.config.gasLimit },
		})
		.result()

	if (writeResult.txStatus !== TxStatus.SUCCESS) {
		throw new Error(
			`Failed to assign training data for model ${modelId}: ${writeResult.errorMessage || writeResult.txStatus}`,
		)
	}

	const txHash = writeResult.txHash || new Uint8Array(32)
	return bytesToHex(txHash)
}

// ---------------------------------------------------------------------------
// Main handler: onSessionClosed
// ---------------------------------------------------------------------------

export function onSessionClosed(runtime: Runtime<Config>, payload: HTTPPayload): string {
	// Step 1: Parse the trigger payload
	const inputText = Buffer.from(payload.input).toString('utf-8')
	const sessionPayload: SessionClosedPayload = JSON.parse(inputText)
	const { cid, encryptionKey, iv, authTag, sessionId } = sessionPayload

	runtime.log(`Session evaluator triggered for session ${sessionId}, CID ${cid}`)

	// Step 2: Fetch encrypted session from Pinata IPFS via HTTP consensus
	const httpCapability = new cre.capabilities.HTTPClient()
	const ipfsFetchResult = httpCapability
		.sendRequest(
			runtime,
			fetchFromPinata,
			ConsensusAggregationByFields<IpfsFetchResult>({
				data: identical,
				statusCode: median,
			}),
		)(runtime.config.pinataGatewayUrl, cid)
		.result()

	runtime.log(`Fetched session from Pinata (${ipfsFetchResult.data.length} bytes)`)

	// Step 3: Decrypt the session data (skip if no encryption key provided)
	let sessionData: SessionData
	if (encryptionKey) {
		const encryptedBytes = new Uint8Array(ipfsFetchResult.data)
		sessionData = decryptSession(encryptedBytes, encryptionKey, iv, authTag)
	} else {
		const plaintext = Buffer.from(ipfsFetchResult.data).toString('utf-8')
		sessionData = JSON.parse(plaintext) as SessionData
	}

	runtime.log(
		`Decrypted session ${sessionData.sessionId} with ${sessionData.messages.length} messages`,
	)

	// Step 4: Build transcript and redact PII
	const rawTranscript = buildTranscript(sessionData.messages)
	const transcript = redactPII(rawTranscript)

	runtime.log(`Transcript built and PII redacted (${transcript.length} chars)`)

	// Step 5: Summarize via OpenAI (using ConfidentialHTTPClient for secret access)
	const confidentialHttp = new cre.capabilities.ConfidentialHTTPClient()
	const apiKeySecret = runtime.getSecret({ id: 'OPENAI_API_KEY', namespace: '' }).result()
	const apiKey = apiKeySecret.value

	const summarizeResponse = confidentialHttp
		.sendRequest(runtime, {
			request: {
				method: 'POST',
				url: 'https://api.openai.com/v1/chat/completions',
				multiHeaders: {
					'Content-Type': { values: ['application/json'] },
					'Authorization': { values: [`Bearer ${apiKey}`] },
				},
				bodyString: JSON.stringify({
					model: runtime.config.openaiModel,
					messages: [
						{
							role: 'system',
							content:
								'You are an AI training data evaluator. Summarize the following chat session transcript concisely. Focus on the topics discussed, the quality of the conversation, and the types of knowledge demonstrated. Output only the summary text.',
						},
						{ role: 'user', content: transcript },
					],
					max_tokens: 500,
					temperature: 0.3,
				}),
			},
		})
		.result()

	if (summarizeResponse.statusCode !== 200) {
		const errorText = Buffer.from(summarizeResponse.body).toString('utf-8')
		throw new Error(`OpenAI summarization failed (${summarizeResponse.statusCode}): ${errorText}`)
	}

	const summarizeBody = JSON.parse(Buffer.from(summarizeResponse.body).toString('utf-8'))
	const summary = summarizeBody.choices?.[0]?.message?.content?.trim()

	if (!summary) {
		throw new Error('OpenAI returned empty summary')
	}

	runtime.log(`Session summarized: ${summary.substring(0, 100)}...`)

	// Step 6: Extract target model ID from session metadata
	// The session metadata contains the modelId from the session creation
	const targetModelId = (sessionData.metadata as Record<string, unknown>)?.modelId as string | undefined
	if (!targetModelId) {
		runtime.log('No modelId found in session metadata, skipping scoring')
		return JSON.stringify({ sessionId, cid, summary, models: [], assignments: [] })
	}

	runtime.log(`Target model from session: ${targetModelId}`)

	// Step 7: Score summary against the target model
	const modelScores: ModelScore[] = []
	const assignments: string[] = []

	let metadataHash: string
	try {
		metadataHash = readMetadataHash(runtime, targetModelId)
	} catch (err) {
		runtime.log(`Could not read metadata for model ${targetModelId}: ${err}`)
		metadataHash = ''
	}

	runtime.log(`Scoring session against model ${targetModelId} (metadata: ${metadataHash})`)

	// Score via ConfidentialHTTPClient (secrets for API key)
	const scoreResponse = confidentialHttp
		.sendRequest(runtime, {
			request: {
				method: 'POST',
				url: 'https://api.openai.com/v1/chat/completions',
				multiHeaders: {
					'Content-Type': { values: ['application/json'] },
					'Authorization': { values: [`Bearer ${apiKey}`] },
				},
				bodyString: JSON.stringify({
					model: runtime.config.openaiModel,
					messages: [
						{
							role: 'system',
							content:
								'You are an AI training data relevance evaluator. Given a chat session summary and a target AI model description, score the relevance of this session data for training the model. Output ONLY a single integer between 0 and 100, where 0 means completely irrelevant and 100 means perfectly relevant. Output nothing else.',
						},
						{
							role: 'user',
							content: `Session summary:\n${summary}\n\nTarget model ID: ${targetModelId}\nModel metadata hash: ${metadataHash}\n\nRelevance score (0-100):`,
						},
					],
					max_tokens: 10,
					temperature: 0.1,
				}),
			},
		})
		.result()

	if (scoreResponse.statusCode === 200) {
		const scoreBody = JSON.parse(Buffer.from(scoreResponse.body).toString('utf-8'))
		const rawScoreText = scoreBody.choices?.[0]?.message?.content?.trim()
		const parsedScore = parseInt(rawScoreText, 10)

		if (!isNaN(parsedScore)) {
			const score = Math.max(0, Math.min(100, parsedScore))
			const action = deriveAction(score)

			modelScores.push({ modelId: targetModelId, score, action })
			runtime.log(`Model ${targetModelId}: score=${score}, action=${action}`)

			// Step 8: If score >= threshold, assign training data on-chain
			if (score >= runtime.config.scoreThreshold) {
				runtime.log(`Assigning CID ${cid} to model ${targetModelId} with score ${score}`)
				try {
					const txHash = assignTrainingData(runtime, targetModelId, cid, BigInt(score))
					assignments.push(txHash)
					runtime.log(`Training data assigned: tx ${txHash}`)
				} catch (err) {
					runtime.log(`Failed to assign training data for model ${targetModelId}: ${err}`)
				}
			}
		} else {
			runtime.log(`Non-numeric score for model ${targetModelId}: ${rawScoreText}`)
		}
	} else {
		const errorText = Buffer.from(scoreResponse.body).toString('utf-8')
		runtime.log(`Scoring failed for model ${targetModelId}: ${errorText}`)
	}

	const result = {
		sessionId,
		cid,
		summary,
		models: modelScores,
		assignments,
	}

	runtime.log(`Session evaluation complete: ${modelScores.length} models scored, ${assignments.length} assignments made`)

	return JSON.stringify(result)
}

// ---------------------------------------------------------------------------
// Workflow initialization
// ---------------------------------------------------------------------------

export function initWorkflow(config: Config) {
	const httpTrigger = new cre.capabilities.HTTPCapability()

	return [
		cre.handler(
			httpTrigger.trigger({
				authorizedKeys: [],
			}),
			onSessionClosed,
		),
	]
}

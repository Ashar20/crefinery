import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';

import { EncryptionService } from './services/EncryptionService';
import { PinataStorage } from './services/PinataStorage';
import { WalletManager } from './services/WalletManager';
import { SessionManager } from './services/SessionManager';
import { EvmService } from './services/EvmService';
import { ModelService } from './services/ModelService';
import { WebSocketServer } from './ws/WebSocketServer';
import { createModelRoutes } from './routes/models';
import { createTriggerRoutes } from './routes/triggers';
import { createLocalCRERoutes } from './routes/local-cre';
import { BackendWallet, ServerConfig } from './types';

dotenv.config();

async function main() {
    try {
        // --- Configuration ---
        const config: ServerConfig = {
            port: parseInt(process.env.PORT || '3001', 10),
            wsPort: parseInt(process.env.WS_PORT || '8080', 10),
            evmRpcUrl: process.env.SEPOLIA_RPC_URL || 'https://1rpc.io/sepolia',
            registryAddress: process.env.MODEL_REGISTRY_ADDRESS || ethers.ZeroAddress,
            accessControlAddress: process.env.ACCESS_CONTROL_ADDRESS || ethers.ZeroAddress,
            finetuneProofRegistryAddress: process.env.FINETUNE_PROOF_REGISTRY_ADDRESS || ethers.ZeroAddress,
            pinataJwt: process.env.PINATA_JWT || '',
            pinataGatewayUrl: process.env.PINATA_GATEWAY_URL || 'https://ipfs.io',
        };

        const creSessionEvaluatorUrl = process.env.CRE_SESSION_EVALUATOR_URL || '';
        const creProofGeneratorUrl = process.env.CRE_PROOF_GENERATOR_URL || '';

        console.log('Starting PureSapiens unified server...');
        console.log(`REST API port: ${config.port}`);
        console.log(`WebSocket port: ${config.wsPort}`);

        // --- Initialize shared services ---

        const encryptionService = new EncryptionService();
        console.log('Encryption service initialized');

        const walletManager = new WalletManager(path.join(process.cwd(), 'wallets'));
        const userA = await walletManager.getOrCreateWallet('userA');
        const userB = await walletManager.getOrCreateWallet('userB');
        console.log(`User A: ${userA.address}`);
        console.log(`User B: ${userB.address}`);

        // Pinata storage (replaces Walrus)
        if (!config.pinataJwt) {
            console.warn('PINATA_JWT not set — session storage will fail');
        }
        const pinataStorage = new PinataStorage(
            encryptionService,
            config.pinataJwt,
            config.pinataGatewayUrl
        );
        console.log('Pinata IPFS storage initialized');

        // EVM service (Sepolia contracts)
        let evmService: EvmService;
        let backendWallet: BackendWallet;

        const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
        if (deployerKey) {
            const deployerWallet = new ethers.Wallet(deployerKey);
            backendWallet = {
                address: deployerWallet.address,
                privateKey: deployerKey,
                publicKey: deployerWallet.signingKey.compressedPublicKey,
            };
            console.log(`Using deployer wallet: ${backendWallet.address}`);
        } else {
            const walletPath = path.join(process.cwd(), 'wallets', 'backend.json');
            if (fs.existsSync(walletPath)) {
                backendWallet = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
            } else {
                const generated = await walletManager.getOrCreateWallet('backend');
                backendWallet = {
                    address: generated.address,
                    privateKey: generated.privateKey,
                    publicKey: generated.publicKey,
                };
            }
            console.warn('DEPLOYER_PRIVATE_KEY not set — using auto-generated wallet (no Sepolia ETH)');
        }

        const provider = new ethers.JsonRpcProvider(config.evmRpcUrl);
        const signer = new ethers.Wallet(backendWallet.privateKey, provider);

        evmService = new EvmService(
            provider,
            signer,
            config.registryAddress,
            config.accessControlAddress,
            config.finetuneProofRegistryAddress
        );
        console.log('EVM service initialized (Sepolia)');

        // Model service
        const modelService = new ModelService(
            encryptionService,
            pinataStorage,
            evmService,
            backendWallet
        );
        console.log('Model service initialized');

        // Session manager (with CRE trigger)
        const sessionManager = new SessionManager(
            pinataStorage,
            30000,  // heartbeat interval
            300000, // session timeout
            creSessionEvaluatorUrl
        );
        console.log('Session manager initialized');

        // --- Express REST API ---

        const app = express();
        app.use(helmet());
        app.use(cors());
        app.use(express.json({ limit: '50mb' }));
        app.use(express.urlencoded({ extended: true, limit: '50mb' }));

        // Health check
        app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                services: {
                    encryption: encryptionService.isConfigured(),
                    pinata: Boolean(config.pinataJwt),
                    evm: true,
                    websocket: true,
                }
            });
        });

        // Miner endpoint
        app.get('/miner', (req, res) => {
            res.json({
                serverAddress: modelService.getServerAddress(),
                timestamp: new Date().toISOString()
            });
        });

        // Model routes
        app.use(createModelRoutes(modelService, evmService, encryptionService));

        // CRE trigger routes
        app.use(createTriggerRoutes(creSessionEvaluatorUrl, creProofGeneratorUrl));

        // Local CRE simulation routes (for dev/testing before DON deployment)
        const openaiApiKey = process.env.OPENAI_API_KEY || '';
        app.use(createLocalCRERoutes(encryptionService, pinataStorage, evmService, openaiApiKey, config));

        app.listen(config.port, () => {
            console.log(`REST API server running on port ${config.port}`);
        });

        // --- WebSocket server ---

        const wsServer = new WebSocketServer(config.wsPort, sessionManager, walletManager);
        console.log(`WebSocket server started on port ${config.wsPort}`);

        console.log('\n=== PureSapiens Server Ready ===');
        console.log(`REST API:  http://localhost:${config.port}`);
        console.log(`WebSocket: ws://localhost:${config.wsPort}`);
        console.log(`Contracts: Sepolia`);
        console.log(`  ModelRegistry:          ${config.registryAddress}`);
        console.log(`  AccessControl:          ${config.accessControlAddress}`);
        console.log(`  FinetuneProofRegistry:  ${config.finetuneProofRegistryAddress}`);

        // --- Graceful shutdown ---

        const shutdown = async () => {
            console.log('\nShutting down gracefully...');

            const activeSessions = sessionManager.getAllActiveSessions();
            for (const sessionId of activeSessions) {
                await sessionManager.closeSession(sessionId, 'Server shutdown');
            }

            await wsServer.close();
            console.log('Server shut down complete');
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

main();

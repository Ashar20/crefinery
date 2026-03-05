import { WebSocket } from 'ws';
import { SessionData, SessionMessage } from '../types';
import { PinataStorage } from './PinataStorage';
import fetch from 'node-fetch';
import * as fs from 'fs';

export class SessionManager {
    private sessions: Map<string, SessionData>;
    private connections: Map<string, Set<WebSocket>>;
    private connectionToSession: Map<WebSocket, string>;
    private connectionToWallet: Map<WebSocket, string>;
    private pinataStorage: PinataStorage;
    private heartbeatInterval: number;
    private sessionTimeout: number;
    private heartbeatTimers: Map<string, NodeJS.Timeout>;
    private timeoutTimers: Map<string, NodeJS.Timeout>;
    private subprocesses: Map<string, import('child_process').ChildProcess>;
    private creSessionEvaluatorUrl: string;

    constructor(
        pinataStorage: PinataStorage,
        heartbeatInterval: number = 30000,
        sessionTimeout: number = 300000,
        creSessionEvaluatorUrl: string = ''
    ) {
        this.sessions = new Map();
        this.connections = new Map();
        this.connectionToSession = new Map();
        this.connectionToWallet = new Map();
        this.pinataStorage = pinataStorage;
        this.heartbeatInterval = heartbeatInterval;
        this.sessionTimeout = sessionTimeout;
        this.heartbeatTimers = new Map();
        this.timeoutTimers = new Map();
        this.subprocesses = new Map();
        this.creSessionEvaluatorUrl = creSessionEvaluatorUrl;
    }

    generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    private async lookupModelPort(modelId: string): Promise<number | null> {
        try {
            const registryPath = './container-registry.json';
            const data = await fs.promises.readFile(registryPath, 'utf8');
            const containers: { modelId: string; port: number }[] = JSON.parse(data);
            const container = containers.find(c => c.modelId === modelId);
            return container?.port ?? null;
        } catch {
            return null;
        }
    }

    extractModelIdFromSessionId(sessionId: string): string | null {
        if (!sessionId || typeof sessionId !== 'string') {
            return null;
        }

        const parts = sessionId.split('-');
        if (parts.length < 6) {
            return null;
        }

        return parts.slice(5).join('-');
    }

    spawnInferenceHandler(sessionId: string, modelId: string, port: number): void {
        try {
            console.log(`Spawning inference handler for session ${sessionId}, model ${modelId}, port ${port}`);

            const { spawn } = require('child_process');
            const inferenceHandlerPath = require('path').join(__dirname, 'InferenceHandler.ts');

            const wsUrl = process.env.WS_URL || `ws://localhost:${process.env.WS_PORT || '8080'}`;

            const subprocess = spawn('npx', ['ts-node', '--transpile-only', inferenceHandlerPath], {
                env: {
                    ...process.env,
                    SESSION_ID: sessionId,
                    MODEL_ID: modelId,
                    MODEL_PORT: port.toString(),
                    WS_URL: wsUrl,
                },
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.subprocesses.set(sessionId, subprocess);

            subprocess.stdout.on('data', (data: Buffer) => {
                console.log(`[InferenceHandler ${sessionId}] ${data.toString().trim()}`);
            });

            subprocess.stderr.on('data', (data: Buffer) => {
                console.error(`[InferenceHandler ${sessionId} ERROR] ${data.toString().trim()}`);
            });

            subprocess.on('close', (code: number) => {
                console.log(`Inference handler for session ${sessionId} exited with code ${code}`);
                this.subprocesses.delete(sessionId);
            });

            subprocess.on('error', (error: Error) => {
                console.error(`Failed to spawn inference handler for session ${sessionId}:`, error);
                this.subprocesses.delete(sessionId);
            });

            console.log(`Inference handler spawned for session ${sessionId}`);
        } catch (error) {
            console.error(`Failed to spawn inference handler for session ${sessionId}:`, error);
        }
    }

    async createSession(ws: WebSocket, sessionId: string, walletAddress: string, nullifierHash?: string): Promise<string> {
        if (!sessionId) {
            throw new Error('Session ID is required');
        }

        if (!walletAddress) {
            throw new Error('Wallet address is required');
        }

        if (this.sessions.has(sessionId)) {
            throw new Error(`Session ${sessionId} already exists. Use join_session instead.`);
        }

        const sessionData: SessionData = {
            sessionId: sessionId,
            createdAt: new Date().toISOString(),
            status: 'waiting',
            messages: [],
            clientCount: 1,
            metadata: {
                creator: walletAddress,
                nullifierHash: nullifierHash || undefined
            }
        };

        this.sessions.set(sessionId, sessionData);
        this.connections.set(sessionId, new Set([ws]));
        this.connectionToSession.set(ws, sessionId);
        this.connectionToWallet.set(ws, walletAddress);

        const modelId = this.extractModelIdFromSessionId(sessionId);
        if (modelId) {
            console.log(`Extracted modelId: ${modelId} from session: ${sessionId}`);
            sessionData.metadata = {
                ...sessionData.metadata,
                modelId,
            };
        }

        this.setupHeartbeat(sessionId, ws);
        this.setupTimeout(sessionId);

        console.log(`Session created: ${sessionId} by ${walletAddress} (waiting for second client)`);

        // Auto-spawn inference handler if model is deployed
        if (modelId) {
            try {
                const port = await this.lookupModelPort(modelId);
                if (port !== null) {
                    this.spawnInferenceHandler(sessionId, modelId, port);
                } else {
                    console.warn(`Model ${modelId} not deployed — no inference handler spawned`);
                }
            } catch (error) {
                console.error(`Failed to auto-spawn inference handler for model ${modelId}:`, error);
            }
        }

        return sessionId;
    }

    async joinSession(ws: WebSocket, sessionId: string, walletAddress: string): Promise<string> {
        if (!walletAddress) {
            throw new Error('Wallet address is required');
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        if (session.status === 'closed' || session.status === 'error') {
            throw new Error(`Session ${sessionId} is no longer active`);
        }

        const connections = this.connections.get(sessionId);
        if (!connections) {
            throw new Error(`No connections found for session ${sessionId}`);
        }

        if (connections.size >= 2) {
            throw new Error(`Session ${sessionId} is full (2 clients already connected)`);
        }

        connections.add(ws);
        this.connectionToSession.set(ws, sessionId);
        this.connectionToWallet.set(ws, walletAddress);
        session.clientCount = connections.size;

        if (!session.metadata) {
            session.metadata = {};
        }
        session.metadata.participant = walletAddress;

        if (connections.size === 2) {
            session.status = 'active';
            console.log(`Session ${sessionId} is now active with 2 clients`);
        }

        this.setupHeartbeat(sessionId, ws);
        this.resetTimeout(sessionId);

        console.log(`Client (${walletAddress}) joined session: ${sessionId} (${connections.size}/2 clients)`);
        return sessionId;
    }

    async addMessage(sessionId: string, message: SessionMessage): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        session.messages.push(message);
        this.resetTimeout(sessionId);
    }

    async closeSession(sessionId: string, reason?: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        session.status = 'closed';
        session.closedAt = new Date().toISOString();

        if (reason) {
            session.messages.push({
                type: 'system',
                content: `Session closed: ${reason}`,
                timestamp: new Date().toISOString(),
                direction: 'outgoing'
            });
        }

        this.clearTimers(sessionId);

        // Save final session state to Pinata IPFS (encrypted + plaintext for CRE)
        try {
            const encryptedSession = await this.pinataStorage.saveSession(session);
            console.log(`Session ${sessionId} saved to Pinata IPFS with CID: ${encryptedSession.cid}`);

            // Save plaintext copy for CRE (CRE sandbox doesn't support Node.js crypto)
            const plaintextCid = await this.pinataStorage.saveSessionPlaintext(session);
            console.log(`Plaintext session saved for CRE with CID: ${plaintextCid}`);

            // Trigger CRE session evaluator via CLI (async, non-blocking)
            if (plaintextCid) {
                this.triggerCRESessionEvaluator({
                    cid: plaintextCid,
                    encryptionKey: '',
                    iv: '',
                    authTag: '',
                    sessionId: session.sessionId,
                }).catch(error => {
                    console.error(`Failed to trigger CRE evaluation for session ${sessionId}:`, error);
                });
            }
        } catch (error) {
            console.error(`Failed to save session ${sessionId} to Pinata:`, error);
        }

        // Close all WebSocket connections in this session
        const connections = this.connections.get(sessionId);
        if (connections) {
            for (const ws of connections) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close(1000, 'Session closed');
                }
                this.connectionToSession.delete(ws);
                this.connectionToWallet.delete(ws);
            }
        }

        // Kill associated inference handler subprocess
        const subprocess = this.subprocesses.get(sessionId);
        if (subprocess) {
            console.log(`Killing inference handler subprocess for session ${sessionId}`);
            subprocess.kill('SIGTERM');

            setTimeout(() => {
                if (!subprocess.killed) {
                    subprocess.kill('SIGKILL');
                }
            }, 5000);

            this.subprocesses.delete(sessionId);
        }

        this.sessions.delete(sessionId);
        this.connections.delete(sessionId);

        console.log(`Session closed: ${sessionId}`);
    }

    /**
     * Trigger CRE session evaluator workflow via CLI
     */
    private async triggerCRESessionEvaluator(params: {
        cid: string;
        encryptionKey: string;
        iv: string;
        authTag: string;
        sessionId: string;
    }): Promise<void> {
        console.log(`Triggering CRE session evaluator CLI for session ${params.sessionId}`);

        const { spawn } = require('child_process');
        const payload = JSON.stringify({
            cid: params.cid,
            encryptionKey: params.encryptionKey,
            iv: params.iv,
            authTag: params.authTag,
            sessionId: params.sessionId,
        });

        const creDir = require('path').resolve(process.cwd(), '..', 'cre');
        const args = [
            'workflow', 'simulate', 'session-evaluator',
            '-T', 'staging-settings',
            '--non-interactive',
            '--trigger-index', '0',
            '--broadcast',
            '--http-payload', payload,
        ];

        console.log(`[CRE] Running: cre ${args.join(' ')}`);
        console.log(`[CRE] Working dir: ${creDir}`);

        const proc = spawn('cre', args, {
            cwd: creDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
        });

        proc.stdout.on('data', (data: Buffer) => {
            console.log(`[CRE session-evaluator] ${data.toString().trim()}`);
        });

        proc.stderr.on('data', (data: Buffer) => {
            console.error(`[CRE session-evaluator ERROR] ${data.toString().trim()}`);
        });

        proc.on('close', (code: number) => {
            if (code === 0) {
                console.log(`[CRE] Session evaluator completed successfully for ${params.sessionId}`);
            } else {
                console.error(`[CRE] Session evaluator exited with code ${code} for ${params.sessionId}`);
            }
        });

        proc.on('error', (error: Error) => {
            console.error(`[CRE] Failed to start session evaluator:`, error);
        });
    }

    async removeConnection(ws: WebSocket): Promise<void> {
        const sessionId = this.connectionToSession.get(ws);
        if (!sessionId) {
            return;
        }

        const connections = this.connections.get(sessionId);
        if (connections) {
            connections.delete(ws);
            const session = this.sessions.get(sessionId);
            if (session) {
                session.clientCount = connections.size;
            }

            if (connections.size === 0) {
                await this.closeSession(sessionId, 'All clients disconnected');
            }
        }

        this.connectionToSession.delete(ws);
        this.connectionToWallet.delete(ws);
    }

    getSession(sessionId: string): SessionData | undefined {
        return this.sessions.get(sessionId);
    }

    getConnections(sessionId: string): Set<WebSocket> | undefined {
        return this.connections.get(sessionId);
    }

    getSessionForConnection(ws: WebSocket): string | undefined {
        return this.connectionToSession.get(ws);
    }

    async broadcastToSession(sessionId: string, message: SessionMessage, excludeWs?: WebSocket): Promise<void> {
        const connections = this.connections.get(sessionId);
        if (!connections) {
            return;
        }

        for (const ws of connections) {
            if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify({
                        type: message.type,
                        content: message.content,
                        timestamp: message.timestamp,
                        sessionId: sessionId
                    }));
                } catch (error) {
                    console.error(`Failed to send message to client in session ${sessionId}:`, error);
                }
            }
        }
    }

    private setupHeartbeat(sessionId: string, ws: WebSocket): void {
        const timerKey = `${sessionId}_${ws}`;

        const timer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.ping();
                } catch (error) {
                    console.error(`Heartbeat failed for connection in session ${sessionId}:`, error);
                    this.removeConnection(ws);
                }
            } else {
                clearInterval(timer);
                this.heartbeatTimers.delete(timerKey);
            }
        }, this.heartbeatInterval);

        this.heartbeatTimers.set(timerKey, timer);

        ws.on('pong', () => {
            this.resetTimeout(sessionId);
        });
    }

    private setupTimeout(sessionId: string): void {
        this.resetTimeout(sessionId);
    }

    private resetTimeout(sessionId: string): void {
        const existingTimer = this.timeoutTimers.get(sessionId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
            console.log(`Session ${sessionId} timed out`);
            this.closeSession(sessionId, 'Session timeout');
        }, this.sessionTimeout);

        this.timeoutTimers.set(sessionId, timer);
    }

    private clearTimers(sessionId: string): void {
        for (const [key, timer] of this.heartbeatTimers.entries()) {
            if (key.startsWith(sessionId)) {
                clearInterval(timer);
                this.heartbeatTimers.delete(key);
            }
        }

        const timeoutTimer = this.timeoutTimers.get(sessionId);
        if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            this.timeoutTimers.delete(sessionId);
        }
    }

    async handleError(sessionId: string, error: Error): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.status = 'error';
            session.messages.push({
                type: 'error',
                content: error.message,
                timestamp: new Date().toISOString(),
                direction: 'incoming'
            });
        }

        await this.closeSession(sessionId, `Error: ${error.message}`);
    }

    getWalletForConnection(ws: WebSocket): string | undefined {
        return this.connectionToWallet.get(ws);
    }

    getAllActiveSessions(): string[] {
        return Array.from(this.sessions.keys());
    }
}

import { WebSocketServer as WSWebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { SessionManager } from '../services/SessionManager';
import { WebSocketMessage, SessionMessage } from '../types';
import { WalletManager } from '../services/WalletManager';

interface ConnectionAuth {
    walletAddress?: string;
    challenge?: string;
    authenticated: boolean;
    timestamp: number;
}

export class WebSocketServer {
    private server: WSWebSocketServer;
    private sessionManager: SessionManager;
    private walletManager: WalletManager;
    private port: number;
    private connectionAuth: WeakMap<WebSocket, ConnectionAuth>;

    constructor(port: number, sessionManager: SessionManager, walletManager: WalletManager) {
        this.port = port;
        this.sessionManager = sessionManager;
        this.walletManager = walletManager;
        this.connectionAuth = new WeakMap();

        this.server = new WSWebSocketServer({
            port,
            perMessageDeflate: false
        });

        this.setupServer();
    }

    private setupServer(): void {
        this.server.on('connection', (ws: WebSocket, req: IncomingMessage) => {
            this.handleConnection(ws, req);
        });

        this.server.on('error', (error: Error) => {
            console.error('WebSocket server error:', error);
        });

        console.log(`WebSocket server started on port ${this.port}`);
    }

    private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
        let sessionId: string | null = null;

        const origin = req.headers.origin;
        if (origin && !this.isValidOrigin(origin)) {
            ws.close(1008, 'Invalid origin');
            return;
        }

        const challenge = this.walletManager.generateChallenge();
        this.connectionAuth.set(ws, {
            challenge,
            authenticated: false,
            timestamp: Date.now()
        });

        this.sendAuthMessage(ws, {
            type: 'challenge',
            challenge
        });

        ws.on('message', async (data: Buffer) => {
            try {
                const message: WebSocketMessage = JSON.parse(data.toString());
                await this.handleMessage(ws, message, (id) => { sessionId = id; });
            } catch (error) {
                console.error('Error handling message:', error);
                if (sessionId) {
                    await this.sessionManager.handleError(sessionId, error as Error);
                } else {
                    ws.close(1002, 'Invalid message format');
                }
            }
        });

        ws.on('close', async (code: number, reason: Buffer) => {
            if (sessionId) {
                await this.sessionManager.removeConnection(ws);
            }
        });

        ws.on('error', async (error: Error) => {
            console.error('WebSocket error:', error);
            if (sessionId) {
                await this.sessionManager.handleError(sessionId, error);
            }
        });
    }

    private async handleMessage(
        ws: WebSocket,
        message: WebSocketMessage,
        setSessionId: (id: string) => void
    ): Promise<void> {
        if (message.type === 'authenticate') {
            await this.handleAuthentication(ws, message);
            return;
        }

        if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
        }

        const auth = this.connectionAuth.get(ws);
        if (!auth?.authenticated) {
            ws.close(1008, 'Authentication required');
            return;
        }

        switch (message.type) {
            case 'create_session':
                if (!message.sessionId) {
                    ws.close(1002, 'Session ID required for create_session');
                    return;
                }

                try {
                    const walletAddress = auth.walletAddress!;
                    const sessionId = await this.sessionManager.createSession(ws, message.sessionId, walletAddress, message.nullifierHash);
                    setSessionId(sessionId);

                    this.sendMessage(ws, {
                        type: 'system',
                        content: `Session created: ${sessionId}. Waiting for second client...`,
                        timestamp: new Date().toISOString(),
                        direction: 'outgoing'
                    }, sessionId);
                } catch (error) {
                    ws.close(1002, (error as Error).message);
                }
                break;

            case 'join_session':
                if (!message.sessionId) {
                    ws.close(1002, 'Session ID required for join_session');
                    return;
                }

                try {
                    const walletAddress = auth.walletAddress!;
                    const sessionId = await this.sessionManager.joinSession(ws, message.sessionId, walletAddress);
                    setSessionId(sessionId);

                    const session = this.sessionManager.getSession(sessionId);
                    const connections = this.sessionManager.getConnections(sessionId);

                    this.sendMessage(ws, {
                        type: 'system',
                        content: `Joined session: ${sessionId}. ${connections?.size || 0}/2 clients connected.`,
                        timestamp: new Date().toISOString(),
                        direction: 'outgoing'
                    }, sessionId);

                    if (session?.status === 'active' && connections?.size === 2) {
                        await this.sessionManager.broadcastToSession(sessionId, {
                            type: 'system',
                            content: `Session active! Both clients connected. You can now send messages.`,
                            timestamp: new Date().toISOString(),
                            direction: 'outgoing'
                        });
                    }
                } catch (error) {
                    ws.close(1002, (error as Error).message);
                }
                break;

            case 'message':
                const currentSessionId = this.sessionManager.getSessionForConnection(ws) || message.sessionId;
                if (!currentSessionId) {
                    ws.close(1002, 'Session ID required for messages');
                    return;
                }

                const session = this.sessionManager.getSession(currentSessionId);
                if (!session) {
                    ws.close(1002, 'Session not found');
                    return;
                }

                if (session.status !== 'active') {
                    ws.close(1002, 'Session is not active. Both clients must be connected.');
                    return;
                }

                if (!message.content || typeof message.content !== 'string') {
                    ws.close(1002, 'Invalid message content');
                    return;
                }

                const incomingMessage: SessionMessage = {
                    type: 'message',
                    content: message.content,
                    timestamp: message.timestamp || new Date().toISOString(),
                    direction: 'incoming'
                };

                await this.sessionManager.addMessage(currentSessionId, incomingMessage);

                await this.sessionManager.broadcastToSession(currentSessionId, {
                    type: 'message',
                    content: message.content,
                    timestamp: incomingMessage.timestamp,
                    direction: 'outgoing'
                }, ws);
                break;

            case 'close':
                const closeSessionId = this.sessionManager.getSessionForConnection(ws) || message.sessionId;
                if (!closeSessionId) {
                    ws.close(1002, 'Session ID required');
                    return;
                }

                await this.sessionManager.broadcastToSession(closeSessionId, {
                    type: 'system',
                    content: 'Session is being closed...',
                    timestamp: new Date().toISOString(),
                    direction: 'outgoing'
                });

                await this.sessionManager.closeSession(closeSessionId, 'Client requested close');
                break;

            case 'pong':
                break;

            default:
                ws.close(1002, `Unknown message type: ${message.type}`);
        }
    }

    private async handleAuthentication(ws: WebSocket, message: WebSocketMessage): Promise<void> {
        const auth = this.connectionAuth.get(ws);
        if (!auth) {
            ws.close(1002, 'Authentication state not found');
            return;
        }

        if (!message.walletAddress || !message.signature) {
            ws.close(1002, 'Wallet address and signature required');
            return;
        }

        const isValid = await this.walletManager.verifySignature(
            message.walletAddress,
            auth.challenge!,
            message.signature
        );

        if (!isValid) {
            ws.close(1008, 'Invalid signature');
            return;
        }

        auth.authenticated = true;
        auth.walletAddress = message.walletAddress;
        this.connectionAuth.set(ws, auth);

        this.sendAuthMessage(ws, {
            type: 'system',
            content: `Authenticated as ${message.walletAddress}`,
            timestamp: new Date().toISOString()
        });

        console.log(`Client authenticated: ${message.walletAddress}`);
    }

    private sendMessage(ws: WebSocket, message: SessionMessage, sessionId: string): void {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({
                    type: message.type,
                    content: message.content,
                    timestamp: message.timestamp,
                    sessionId: sessionId
                }));
            } catch (error) {
                console.error(`Failed to send message to session ${sessionId}:`, error);
            }
        }
    }

    private sendAuthMessage(ws: WebSocket, message: any): void {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(message));
            } catch (error) {
                console.error('Failed to send auth message:', error);
            }
        }
    }

    private isValidOrigin(origin: string): boolean {
        return true;
    }

    getServer(): WSWebSocketServer {
        return this.server;
    }

    async close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.close((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }
}

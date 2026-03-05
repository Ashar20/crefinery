import WebSocket from 'ws';
import { WalletManager } from './WalletManager';
import * as path from 'path';
import fetch from 'node-fetch';

const WS_URL = process.env.WS_URL || 'ws://localhost:8080';
const SESSION_ID = process.env.SESSION_ID;
const MODEL_ID = process.env.MODEL_ID;
const MODEL_PORT = parseInt(process.env.MODEL_PORT || '8000');

async function main() {
    console.log('=== Inference Handler - Automated UserB ===');
    console.log(`Session ID: ${SESSION_ID}`);
    console.log(`Model ID: ${MODEL_ID}`);
    console.log(`Model Port: ${MODEL_PORT}`);
    console.log(`WebSocket URL: ${WS_URL}\n`);

    if (!SESSION_ID || !MODEL_ID) {
        console.error('SESSION_ID and MODEL_ID environment variables are required');
        process.exit(1);
    }

    const walletManager = new WalletManager(path.join(process.cwd(), 'wallets'));
    const wallet = await walletManager.loadWallet('userB');

    if (!wallet) {
        console.error('User B wallet not found. Please run the server first to generate wallets.');
        process.exit(1);
    }

    console.log(`Wallet Address: ${wallet.address}\n`);

    const ws = new WebSocket(WS_URL);
    let sessionJoined = false;

    ws.on('open', () => {
        console.log('Connected to server, waiting for authentication challenge...\n');
    });

    ws.on('message', async (data: Buffer) => {
        try {
            const message = JSON.parse(data.toString());

            if (message.type === 'challenge' && message.challenge) {
                console.log('Received authentication challenge, signing...');
                const signature = await walletManager.signMessage(wallet, message.challenge);

                ws.send(JSON.stringify({
                    type: 'authenticate',
                    walletAddress: wallet.address,
                    signature
                }));
                console.log('Authentication sent\n');
                return;
            }

            if (message.type === 'system') {
                console.log(`[SYSTEM] ${message.content}`);

                if (message.content.includes('Authenticated')) {
                    console.log('Authentication successful!\n');

                    ws.send(JSON.stringify({
                        type: 'join_session' as const,
                        sessionId: SESSION_ID
                    }));
                    console.log(`Joining session: ${SESSION_ID}...`);
                }

                if (message.content.includes('Joined session')) {
                    sessionJoined = true;
                    console.log(`Session joined successfully. Ready for inference.\n`);
                }

                if (message.content.includes('Session active') || message.content.includes('Both clients connected')) {
                    console.log('Session is active! Listening for user messages...\n');
                }

                if (message.content.includes('Session closed')) {
                    console.log('Session closed, exiting...');
                    ws.close();
                    process.exit(0);
                }
            } else if (message.type === 'message') {
                console.log(`[User A] ${message.content}`);

                if (sessionJoined) {
                    await handleInferenceRequest(message.content);
                }
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        process.exit(1);
    });

    ws.on('close', (code, reason) => {
        console.log(`\nConnection closed: ${code} - ${reason.toString()}`);
        process.exit(0);
    });

    async function handleInferenceRequest(userInput: string) {
        try {
            console.log(`Processing inference request: "${userInput}"`);

            const inferenceUrl = `http://localhost:${MODEL_PORT}/inference`;
            console.log(`Calling inference API: ${inferenceUrl}`);

            const response = await fetch(inferenceUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: userInput
                })
            });

            if (!response.ok) {
                throw new Error(`Inference API returned ${response.status}: ${response.statusText}`);
            }

            const result: any = await response.json();
            const inferenceResponse = result.response || result.output || result.text || 'No response generated';

            console.log(`Inference completed: "${inferenceResponse}"`);

            const responseMessage = {
                type: 'message' as const,
                sessionId: SESSION_ID,
                content: inferenceResponse,
                timestamp: new Date().toISOString()
            };
            ws.send(JSON.stringify(responseMessage));
            console.log('Response sent to user\n');

        } catch (error: any) {
            console.error('Inference error:', error.message);

            const errorMessage = {
                type: 'message' as const,
                sessionId: SESSION_ID,
                content: `Sorry, I encountered an error processing your request: ${error.message}`,
                timestamp: new Date().toISOString()
            };
            ws.send(JSON.stringify(errorMessage));
        }
    }
}

process.on('SIGINT', () => {
    console.log('\nInference handler shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nInference handler shutting down...');
    process.exit(0);
});

main().catch(console.error);

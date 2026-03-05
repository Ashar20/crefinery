import fetch from 'node-fetch';
import { SessionData, EncryptedSession } from '../types';
import { EncryptionService } from './EncryptionService';

export class PinataStorage {
    private encryptionService: EncryptionService;
    private jwt: string;
    private gatewayUrl: string;
    private sessionIndex: Map<string, EncryptedSession>;

    constructor(encryptionService: EncryptionService, jwt: string, gatewayUrl: string) {
        this.encryptionService = encryptionService;
        this.jwt = jwt;
        this.gatewayUrl = gatewayUrl;
        this.sessionIndex = new Map();
    }

    /**
     * Upload JSON data to Pinata IPFS and return the CID
     */
    private async pinJson(data: object, name?: string): Promise<string> {
        const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.jwt}`,
            },
            body: JSON.stringify({
                pinataContent: data,
                pinataMetadata: {
                    name: name || 'puresapiens-data',
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Pinata upload failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json() as any;
        return result.IpfsHash;
    }

    /**
     * Fetch JSON data from IPFS by CID
     */
    private async fetchFromIPFS(cid: string): Promise<any> {
        const url = `${this.gatewayUrl}/ipfs/${cid}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`IPFS fetch failed for CID ${cid}: ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Save session data (encrypt with AES-256-GCM and upload to Pinata IPFS)
     */
    async saveSession(sessionData: SessionData): Promise<EncryptedSession> {
        const encryptedSession = this.encryptionService.encryptSession(sessionData);

        const pinataPayload = {
            encryptedData: encryptedSession.encryptedData,
            encryptionKey: encryptedSession.encryptionKey,
            iv: encryptedSession.iv,
            authTag: encryptedSession.authTag,
            nonce: encryptedSession.nonce,
            sessionId: sessionData.sessionId,
        };

        const cid = await this.pinJson(pinataPayload, `session-${sessionData.sessionId}`);
        encryptedSession.cid = cid;

        this.sessionIndex.set(sessionData.sessionId, encryptedSession);
        console.log(`Session ${sessionData.sessionId} stored on Pinata IPFS with CID: ${cid}`);

        return encryptedSession;
    }

    /**
     * Save session data as plaintext JSON to Pinata (for CRE which can't decrypt)
     */
    async saveSessionPlaintext(sessionData: SessionData): Promise<string> {
        // Map server message format to CRE-expected format (role/content)
        const messages = sessionData.messages.map(msg => ({
            role: msg.type === 'system' ? 'system' : (msg.direction === 'incoming' ? 'user' : 'assistant'),
            content: msg.content,
            timestamp: msg.timestamp,
        }));

        const plaintextPayload = {
            sessionId: sessionData.sessionId,
            messages,
            metadata: sessionData.metadata,
            createdAt: sessionData.createdAt,
            closedAt: sessionData.closedAt,
        };

        const cid = await this.pinJson(plaintextPayload, `session-plaintext-${sessionData.sessionId}`);
        console.log(`Plaintext session ${sessionData.sessionId} stored on Pinata IPFS with CID: ${cid}`);
        return cid;
    }

    /**
     * Load session data (retrieve from IPFS and decrypt)
     */
    async loadSession(sessionId: string): Promise<SessionData | null> {
        try {
            const encryptedSession = this.sessionIndex.get(sessionId);
            if (!encryptedSession) {
                return null;
            }

            const storedData = await this.fetchFromIPFS(encryptedSession.cid);

            const fullEncryptedSession: EncryptedSession = {
                ...encryptedSession,
                encryptedData: storedData.encryptedData,
                encryptionKey: storedData.encryptionKey,
                iv: storedData.iv,
                authTag: storedData.authTag,
                nonce: storedData.nonce,
            };

            return this.encryptionService.decryptSession(fullEncryptedSession);
        } catch (error) {
            console.error(`Failed to load session ${sessionId}:`, error);
            return null;
        }
    }

    /**
     * Upload encrypted model data to Pinata and return CID
     */
    async storeModelData(data: object, name?: string): Promise<string> {
        return await this.pinJson(data, name || 'puresapiens-model');
    }

    async listSessions(): Promise<string[]> {
        return Array.from(this.sessionIndex.keys());
    }

    hasSession(sessionId: string): boolean {
        return this.sessionIndex.has(sessionId);
    }

    getEncryptedSessionMetadata(sessionId: string): EncryptedSession | undefined {
        return this.sessionIndex.get(sessionId);
    }
}

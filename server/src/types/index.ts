// --- Session types (from C-S) ---

export interface SessionMessage {
    type: 'message' | 'system' | 'error';
    content: string;
    timestamp: string;
    direction: 'incoming' | 'outgoing';
}

export interface SessionData {
    sessionId: string;
    createdAt: string;
    closedAt?: string;
    status: 'active' | 'closed' | 'error' | 'waiting';
    messages: SessionMessage[];
    clientCount: number;
    metadata?: Record<string, any>;
}

export interface WebSocketMessage {
    type: 'create_session' | 'join_session' | 'message' | 'close' | 'ping' | 'pong' | 'authenticate' | 'challenge';
    sessionId?: string;
    content?: string;
    timestamp?: string;
    walletAddress?: string;
    signature?: string;
    challenge?: string;
    nullifierHash?: string;
}

export interface SessionConfig {
    port: number;
    wsPort: number;
    heartbeatInterval: number;
    sessionTimeout: number;
}

export interface WalletInfo {
    address: string;
    privateKey: string;
    publicKey: string;
    wallet: any;
}

export interface EncryptedSession {
    encryptedData: string;
    encryptionKey: string;
    iv: string;
    authTag: string;
    cid: string;              // Pinata IPFS CID (was blobId for Walrus)
    nonce: string;
    sessionId: string;
}

// --- Model types (from nautilus-backend) ---

export interface ModelMetadata {
    name: string;
    company: string;
    parameters: string;
    goodAt: string;
    needsImprovement: string;
}

export interface ModelUploadRequest {
    dockerfile: string;
    metadata: ModelMetadata;
    uploaderAddress: string;
    files?: Record<string, string>;  // Optional companion files (filename -> base64 content)
}

export interface ModelResponse {
    id: string;
    metadata: ModelMetadata;
    uploaderAddress: string;
    createdAt: string;
    dockerfileHash: string;
    metadataHash: string;
    trainingData?: string[];
    trainingDataNullifiers?: Record<string, string>;  // sessionHash -> nullifierHash
}

export interface EncryptedModelData {
    encryptedData: string;
    encryptionKey: string;
    iv: string;
    authTag: string;
    cid: string;              // Pinata IPFS CID (was blobId for Walrus)
    nonce: string;
    modelId: string;
}

export interface BackendWallet {
    address: string;
    privateKey: string;
    publicKey: string;
}

export interface ServerConfig {
    port: number;
    wsPort: number;
    evmRpcUrl: string;
    registryAddress: string;
    accessControlAddress: string;
    finetuneProofRegistryAddress: string;
    pinataJwt: string;
    pinataGatewayUrl: string;
}

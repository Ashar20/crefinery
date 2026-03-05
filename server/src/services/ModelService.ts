import { v4 as uuidv4 } from 'uuid';
import { EncryptionService } from './EncryptionService';
import { PinataStorage } from './PinataStorage';
import { EvmService } from './EvmService';
import { ModelMetadata, ModelResponse, ModelUploadRequest, EncryptedModelData, BackendWallet } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class ModelService {
  private encryptionService: EncryptionService;
  private pinataStorage: PinataStorage;
  private evmService: EvmService;
  private backendWallet: BackendWallet;
  private modelsStorage: Map<string, ModelResponse & { encryptedData: EncryptedModelData; files?: Record<string, string> }>;

  constructor(
    encryptionService: EncryptionService,
    pinataStorage: PinataStorage,
    evmService: EvmService,
    backendWallet: BackendWallet
  ) {
    this.encryptionService = encryptionService;
    this.pinataStorage = pinataStorage;
    this.evmService = evmService;
    this.backendWallet = backendWallet;

    this.modelsStorage = new Map();
    this.loadStoredModels();
  }

  async uploadModel(request: ModelUploadRequest): Promise<ModelResponse> {
    const modelId = uuidv4();

    try {
      const dockerfileContent = Buffer.from(request.dockerfile, 'base64').toString('utf-8');

      const metadataJson = JSON.stringify(request.metadata);
      const dockerfileHash = await this.generateHash(dockerfileContent);
      const metadataHash = await this.generateHash(metadataJson);

      const encryptedModel: EncryptedModelData = this.encryptionService.encryptModel(dockerfileContent, modelId);

      // Store on Pinata IPFS
      const cid = await this.pinataStorage.storeModelData(encryptedModel, `model-${modelId}`);
      encryptedModel.cid = cid;

      // Register on EVM blockchain
      try {
        await this.evmService.registerModel(
          modelId,
          request.metadata,
          request.uploaderAddress,
          metadataHash,
          dockerfileHash
        );
      } catch (evmError) {
        console.error('EVM registration failed:', evmError);
      }

      const modelResponse: ModelResponse = {
        id: modelId,
        metadata: request.metadata,
        uploaderAddress: request.uploaderAddress,
        createdAt: new Date().toISOString(),
        dockerfileHash,
        metadataHash
      };

      this.modelsStorage.set(modelId, {
        ...modelResponse,
        encryptedData: encryptedModel,
        files: request.files
      });
      this.saveStoredModels();

      return modelResponse;
    } catch (error) {
      console.error('Failed to upload model:', error);
      throw error;
    }
  }

  async getModels(): Promise<ModelResponse[]> {
    return Array.from(this.modelsStorage.values()).map(({ encryptedData, ...model }) => model);
  }

  async getModelById(modelId: string): Promise<ModelResponse | null> {
    const storedModel = this.modelsStorage.get(modelId);
    if (!storedModel) {
      return null;
    }

    const { encryptedData, ...model } = storedModel;
    return model;
  }

  async getModelDockerfile(modelId: string, requesterAddress: string): Promise<string> {
    try {
      if (!modelId || modelId === 'undefined') {
        throw new Error('Invalid model ID provided');
      }

      const storedModel = this.modelsStorage.get(modelId);
      if (!storedModel) {
        throw new Error(`Model not found: ${modelId}`);
      }

      const { encryptedData } = storedModel;

      if (requesterAddress !== storedModel.uploaderAddress) {
        throw new Error('Access denied: requester not authorized');
      }

      return this.encryptionService.decryptModel(encryptedData);
    } catch (error) {
      console.error('Failed to get model dockerfile:', error);
      throw new Error(`Failed to get model dockerfile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async updateAllowlist(modelId: string, serverAddresses: string[]): Promise<void> {
    try {
      await this.evmService.updateAllowlist(modelId, serverAddresses);
    } catch (error) {
      console.error('Failed to update allowlist on EVM:', error);
    }
  }

  async getEncryptedModelData(modelId: string, requesterAddress: string): Promise<EncryptedModelData> {
    const storedModel = this.modelsStorage.get(modelId);
    if (!storedModel) {
      throw new Error('Model not found');
    }

    if (requesterAddress !== storedModel.uploaderAddress) {
      throw new Error('Access denied: requester not authorized');
    }

    return storedModel.encryptedData;
  }

  getModelFiles(modelId: string): Record<string, string> | undefined {
    const storedModel = this.modelsStorage.get(modelId);
    return storedModel?.files;
  }

  getServerAddress(): string {
    return this.backendWallet.address;
  }

  async addTrainingData(modelId: string, sessionHash: string, nullifierHash?: string): Promise<void> {
    const storedModel = this.modelsStorage.get(modelId);
    if (!storedModel) {
      throw new Error(`Model not found: ${modelId}`);
    }

    if (!storedModel.trainingData) {
      storedModel.trainingData = [];
    }

    if (storedModel.trainingData.includes(sessionHash)) {
      console.log(`Session hash ${sessionHash} already exists in training data for model ${modelId}`);
      return;
    }

    storedModel.trainingData.push(sessionHash);

    // Store nullifier hash mapping for human verification tracking
    if (nullifierHash) {
      if (!storedModel.trainingDataNullifiers) {
        storedModel.trainingDataNullifiers = {};
      }
      storedModel.trainingDataNullifiers[sessionHash] = nullifierHash;
      console.log(`Linked nullifier ${nullifierHash.slice(0, 16)}... to session ${sessionHash}`);
    }

    this.saveStoredModels();

    console.log(`Added session hash ${sessionHash} to training data for model ${modelId} (total: ${storedModel.trainingData.length})`);
  }

  getTrainingDataVerification(modelId: string): { totalSessions: number; verifiedSessions: number; nullifiers: Record<string, string> } {
    const storedModel = this.modelsStorage.get(modelId);
    if (!storedModel) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const trainingData = storedModel.trainingData || [];
    const nullifiers = storedModel.trainingDataNullifiers || {};

    return {
      totalSessions: trainingData.length,
      verifiedSessions: Object.keys(nullifiers).length,
      nullifiers,
    };
  }

  private async generateHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private loadStoredModels(): void {
    try {
      const storagePath = path.join(process.cwd(), 'models-storage.json');
      if (fs.existsSync(storagePath)) {
        const data = fs.readFileSync(storagePath, 'utf-8');
        const storedData = JSON.parse(data);

        for (const [key, value] of Object.entries(storedData)) {
          this.modelsStorage.set(key, value as any);
        }
      }
    } catch (error) {
      console.warn('Failed to load stored models:', error);
    }
  }

  private saveStoredModels(): void {
    try {
      const storagePath = path.join(process.cwd(), 'models-storage.json');
      const data = Object.fromEntries(this.modelsStorage);
      fs.writeFileSync(storagePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save stored models:', error);
    }
  }
}

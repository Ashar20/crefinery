import { ethers } from 'ethers';
import { ModelMetadata, ModelResponse } from '../types';

const MODEL_REGISTRY_ABI = [
  'function registerModel(string modelId, address uploader, string metadataHash, string dockerfileHash) external returns (bytes32)',
  'function getModelCount() view returns (uint256)',
  'event ModelRegistered(string indexed modelId, address indexed uploader, string metadataHash, string dockerfileHash, uint256 timestamp)',
] as const;

const ACCESS_CONTROL_ABI = [
  'function updateAllowlist(string modelId, address[] serverAddresses) external',
  'function isServerAllowed(string modelId, address server) view returns (bool)',
] as const;

const FINETUNE_PROOF_REGISTRY_ABI = [
  'function storeProof(string modelId, uint256 timestampMs, bytes32[] sessionHashes, bytes signature) external returns (uint256)',
  'function getProofsByModel(string modelId) view returns (uint256[])',
  'function getProof(uint256 proofId) view returns (tuple(string modelId, uint256 timestampMs, bytes32[] sessionHashes, bytes signature, uint256 createdAt))',
  'event ProofStored(uint256 indexed proofId, bytes32 indexed modelIdHash, string modelId, uint256 timestampMs)',
] as const;

export class EvmService {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private registry: ethers.Contract;
  private accessControl: ethers.Contract;
  private finetuneProofRegistry: ethers.Contract;

  constructor(
    provider: ethers.JsonRpcProvider,
    signer: ethers.Wallet,
    registryAddress: string,
    accessControlAddress: string,
    finetuneProofRegistryAddress: string
  ) {
    this.provider = provider;
    this.signer = signer;

    this.registry = new ethers.Contract(registryAddress, MODEL_REGISTRY_ABI, signer);
    this.accessControl = new ethers.Contract(accessControlAddress, ACCESS_CONTROL_ABI, signer);
    this.finetuneProofRegistry = new ethers.Contract(finetuneProofRegistryAddress, FINETUNE_PROOF_REGISTRY_ABI, signer);
  }

  async registerModel(
    modelId: string,
    _metadata: ModelMetadata,
    uploaderAddress: string,
    metadataHash: string,
    dockerfileHash: string
  ): Promise<string> {
    try {
      const tx = await this.registry.registerModel(
        modelId,
        uploaderAddress,
        metadataHash,
        dockerfileHash
      );
      const receipt = await tx.wait();
      console.log(`Model ${modelId} registered on EVM with tx: ${receipt.hash}`);
      return receipt.hash;
    } catch (error) {
      throw new Error(`Failed to register model on EVM: ${error}`);
    }
  }

  async getModels(): Promise<ModelResponse[]> {
    try {
      const filter = this.registry.filters.ModelRegistered();
      const events = await this.registry.queryFilter(filter);

      const models: ModelResponse[] = events.map((event) => {
        const log = event as ethers.EventLog;
        const args = log.args;
        return {
          id: args[0] as string,
          metadata: {
            name: '',
            company: '',
            parameters: '',
            goodAt: '',
            needsImprovement: '',
          },
          uploaderAddress: args[1] as string,
          createdAt: new Date(Number(args[4]) * 1000).toISOString(),
          dockerfileHash: args[3] as string,
          metadataHash: args[2] as string,
        };
      });

      return models;
    } catch (error) {
      console.error('Failed to get models from EVM:', error);
      return [];
    }
  }

  async getModelById(modelId: string): Promise<ModelResponse | null> {
    try {
      const filter = this.registry.filters.ModelRegistered(modelId);
      const events = await this.registry.queryFilter(filter);

      if (events.length === 0) {
        return null;
      }

      const log = events[events.length - 1] as ethers.EventLog;
      const args = log.args;

      return {
        id: args[0] as string,
        metadata: {
          name: '',
          company: '',
          parameters: '',
          goodAt: '',
          needsImprovement: '',
        },
        uploaderAddress: args[1] as string,
        createdAt: new Date(Number(args[4]) * 1000).toISOString(),
        dockerfileHash: args[3] as string,
        metadataHash: args[2] as string,
      };
    } catch (error) {
      console.error(`Failed to get model ${modelId} from EVM:`, error);
      return null;
    }
  }

  async updateAllowlist(modelId: string, serverAddresses: string[]): Promise<void> {
    try {
      const tx = await this.accessControl.updateAllowlist(modelId, serverAddresses);
      await tx.wait();
      console.log(`Allowlist updated for model ${modelId}`);
    } catch (error) {
      throw new Error(`Failed to update allowlist: ${error}`);
    }
  }

  async isServerAllowed(modelId: string, serverAddress: string): Promise<boolean> {
    try {
      return await this.accessControl.isServerAllowed(modelId, serverAddress);
    } catch (error) {
      console.error('Failed to check server permission:', error);
      return false;
    }
  }

  async storeFineTuneProof(
    modelId: string,
    timestampMs: number,
    sessionHashes: string[],
    signature: string
  ): Promise<string> {
    try {
      const sigBytes = ethers.getBytes('0x' + signature.replace(/^0x/, ''));
      const tx = await this.finetuneProofRegistry.storeProof(
        modelId,
        timestampMs,
        sessionHashes,
        sigBytes
      );
      const receipt = await tx.wait();

      for (const log of receipt.logs) {
        try {
          const parsed = this.finetuneProofRegistry.interface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });
          if (parsed && parsed.name === 'ProofStored') {
            return parsed.args.proofId.toString();
          }
        } catch {
          // not our event, skip
        }
      }

      return receipt.hash;
    } catch (error) {
      console.error('Failed to store fine-tuning proof:', error);
      throw error;
    }
  }

  async getFineTuneProofs(modelId: string): Promise<any[]> {
    try {
      const proofIds: bigint[] = await this.finetuneProofRegistry.getProofsByModel(modelId);
      const proofs: any[] = [];

      for (const proofId of proofIds) {
        const proof = await this.finetuneProofRegistry.getProof(proofId);

        proofs.push({
          id: proofId.toString(),
          modelId: proof.modelId,
          timestampMs: Number(proof.timestampMs),
          sessionHashes: [...proof.sessionHashes],
          signature: ethers.hexlify(proof.signature),
          storedAt: new Date(Number(proof.createdAt) * 1000).toISOString(),
        });
      }

      return proofs;
    } catch (error) {
      console.error('Failed to get fine-tuning proofs:', error);
      throw error;
    }
  }
}

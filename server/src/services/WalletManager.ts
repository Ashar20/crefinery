import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { WalletInfo } from '../types';

export interface SerializedWallet {
    address: string;
    privateKey: string;
    publicKey: string;
}

export class WalletManager {
    private walletsDir: string;

    constructor(walletsDir: string = path.join(process.cwd(), 'wallets')) {
        this.walletsDir = walletsDir;
        this.ensureDirectory();
    }

    private ensureDirectory(): void {
        if (!fs.existsSync(this.walletsDir)) {
            fs.mkdirSync(this.walletsDir, { recursive: true });
        }
    }

    async generateWallet(userId: string): Promise<WalletInfo> {
        const wallet = ethers.Wallet.createRandom();

        const walletInfo: WalletInfo = {
            address: wallet.address,
            privateKey: wallet.privateKey,
            publicKey: wallet.signingKey.compressedPublicKey,
            wallet
        };

        await this.saveWallet(userId, walletInfo);
        return walletInfo;
    }

    async loadWallet(userId: string): Promise<WalletInfo | null> {
        const filePath = path.join(this.walletsDir, `${userId}.json`);

        if (!fs.existsSync(filePath)) {
            return null;
        }

        try {
            const data = await fs.promises.readFile(filePath, 'utf-8');
            const serialized: SerializedWallet = JSON.parse(data);
            const wallet = new ethers.Wallet(serialized.privateKey);

            return {
                address: serialized.address,
                privateKey: serialized.privateKey,
                publicKey: serialized.publicKey,
                wallet
            };
        } catch (error) {
            throw new Error(`Failed to load wallet for ${userId}: ${error}`);
        }
    }

    private async saveWallet(userId: string, walletInfo: WalletInfo): Promise<void> {
        const filePath = path.join(this.walletsDir, `${userId}.json`);

        const serialized: SerializedWallet = {
            address: walletInfo.address,
            privateKey: walletInfo.privateKey,
            publicKey: walletInfo.publicKey
        };

        await fs.promises.writeFile(filePath, JSON.stringify(serialized, null, 2), 'utf-8');
    }

    async getOrCreateWallet(userId: string): Promise<WalletInfo> {
        const existing = await this.loadWallet(userId);
        if (existing) {
            return existing;
        }
        return await this.generateWallet(userId);
    }

    async signMessage(wallet: WalletInfo, message: string): Promise<string> {
        return await wallet.wallet.signMessage(message);
    }

    async verifySignature(address: string, message: string, signature: string): Promise<boolean> {
        try {
            const recoveredAddress = ethers.verifyMessage(message, signature);
            return recoveredAddress.toLowerCase() === address.toLowerCase();
        } catch (error) {
            console.error('Signature verification failed:', error);
            return false;
        }
    }

    generateChallenge(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    async listWallets(): Promise<string[]> {
        try {
            const files = await fs.promises.readdir(this.walletsDir);
            return files
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''));
        } catch (error) {
            return [];
        }
    }
}

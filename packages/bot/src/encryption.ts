import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';
import { logger } from '@trading-bot/core';

export interface EncryptionConfig {
  provider: 'aws-kms' | 'vault' | 'local';
  awsKms?: {
    region: string;
    keyId: string;
  };
  vault?: {
    address: string;
    token: string;
    namespace?: string;
  };
}

export class EncryptionService {
  private config: EncryptionConfig;
  private kmsClient?: KMSClient;

  constructor(config: EncryptionConfig) {
    this.config = config;
    
    if (config.provider === 'aws-kms' && config.awsKms) {
      this.kmsClient = new KMSClient({ region: config.awsKms.region });
    }
  }

  async decryptPrivateKey(encryptedKey: string): Promise<string> {
    try {
      switch (this.config.provider) {
        case 'aws-kms':
          return await this.decryptWithKMS(encryptedKey);
        
        case 'vault':
          return await this.decryptWithVault(encryptedKey);
        
        case 'local':
          // For development only - keys stored in env vars
          return encryptedKey;
        
        default:
          throw new Error(`Unknown encryption provider: ${this.config.provider}`);
      }
    } catch (error) {
      logger.error('Failed to decrypt private key', error);
      throw error;
    }
  }

  private async decryptWithKMS(ciphertext: string): Promise<string> {
    if (!this.kmsClient) {
      throw new Error('KMS client not initialized');
    }

    const command = new DecryptCommand({
      CiphertextBlob: Buffer.from(ciphertext, 'base64'),
      KeyId: this.config.awsKms?.keyId,
    });

    const response = await this.kmsClient.send(command);
    
    if (!response.Plaintext) {
      throw new Error('KMS decryption returned no plaintext');
    }

    return Buffer.from(response.Plaintext).toString('utf-8');
  }

  private async decryptWithVault(path: string): Promise<string> {
    if (!this.config.vault) {
      throw new Error('Vault configuration not provided');
    }

    const { address, token, namespace } = this.config.vault;
    
    // Extract secret path from vault:secret/data/path format
    const secretPath = path.replace(/^vault:/, '');
    
    const url = `${address}/v1/${secretPath}`;
    const headers: Record<string, string> = {
      'X-Vault-Token': token,
    };
    
    if (namespace) {
      headers['X-Vault-Namespace'] = namespace;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Vault request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data.data.privateKey;
  }
}

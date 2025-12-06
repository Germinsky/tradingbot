#!/bin/bash
# Script to encrypt wallet private keys using AWS KMS

set -e

echo "========================================="
echo "Trading Bot Key Encryption Script"
echo "========================================="
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    echo "Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
    exit 1
fi

# Check if KMS key ID is set
if [ -z "$AWS_KMS_KEY_ID" ]; then
    echo "Error: AWS_KMS_KEY_ID environment variable not set"
    echo "Usage: export AWS_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/your-key-id"
    exit 1
fi

echo "Using KMS Key: $AWS_KMS_KEY_ID"
echo ""

CHAINS=("ETH" "ARB" "BASE" "OP" "MATIC")

for CHAIN in "${CHAINS[@]}"; do
    echo "----------------------------------------"
    echo "Encrypting private key for $CHAIN"
    echo "----------------------------------------"
    
    read -sp "Enter private key for $CHAIN (0x...): " PRIVATE_KEY
    echo ""
    
    if [ -z "$PRIVATE_KEY" ]; then
        echo "⚠️  Skipping $CHAIN (no key provided)"
        echo ""
        continue
    fi
    
    # Validate private key format
    if [[ ! "$PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
        echo "⚠️  Warning: Invalid private key format for $CHAIN"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            continue
        fi
    fi
    
    # Encrypt with KMS
    echo "Encrypting..."
    ENCRYPTED=$(aws kms encrypt \
        --key-id "$AWS_KMS_KEY_ID" \
        --plaintext "$PRIVATE_KEY" \
        --query CiphertextBlob \
        --output text)
    
    if [ $? -eq 0 ]; then
        echo "✓ Successfully encrypted"
        echo ""
        echo "Add to .env.production:"
        echo "AWS_KMS_ENCRYPTED_KEY_$CHAIN=$ENCRYPTED"
        echo ""
    else
        echo "✗ Failed to encrypt $CHAIN key"
        echo ""
    fi
done

echo "========================================="
echo "Encryption complete!"
echo ""
echo "Next steps:"
echo "1. Add encrypted keys to .env.production"
echo "2. Verify decryption: npm run test:decrypt"
echo "3. Start bot: pm2 start ecosystem.config.js"
echo "========================================="

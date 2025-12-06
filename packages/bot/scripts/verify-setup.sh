#!/bin/bash
# Quick test script to verify production setup

set -e

echo "========================================="
echo "Trading Bot Production Setup Verification"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
    echo -e "${GREEN}✓${NC} $1"
}

fail() {
    echo -e "${RED}✗${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check Node.js
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    pass "Node.js installed: $NODE_VERSION"
else
    fail "Node.js not installed"
    exit 1
fi

# Check npm
echo "Checking npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    pass "npm installed: $NPM_VERSION"
else
    fail "npm not installed"
    exit 1
fi

# Check if built
echo ""
echo "Checking build..."
if [ -d "dist" ]; then
    pass "dist/ directory exists"
else
    warn "dist/ directory not found - run 'npm run build'"
fi

# Check configuration
echo ""
echo "Checking configuration..."
if [ -f "config/prod.yaml" ]; then
    pass "config/prod.yaml exists"
else
    fail "config/prod.yaml not found"
fi

# Check environment
echo ""
echo "Checking environment..."
if [ -f ".env.production" ]; then
    pass ".env.production exists"
    
    # Check for required variables
    source .env.production 2>/dev/null || true
    
    if [ -z "$AWS_KMS_KEY_ID" ] && [ -z "$VAULT_ADDR" ]; then
        warn "No encryption service configured (AWS_KMS_KEY_ID or VAULT_ADDR)"
    else
        pass "Encryption service configured"
    fi
    
    if [ -z "$ETHEREUM_RPC_URL" ]; then
        warn "ETHEREUM_RPC_URL not set"
    else
        pass "RPC endpoints configured"
    fi
else
    warn ".env.production not found - copy from .env.production.example"
fi

# Check AWS CLI (for KMS)
echo ""
echo "Checking AWS CLI..."
if command -v aws &> /dev/null; then
    AWS_VERSION=$(aws --version)
    pass "AWS CLI installed: $AWS_VERSION"
    
    # Check AWS credentials
    if aws sts get-caller-identity &> /dev/null; then
        pass "AWS credentials configured"
    else
        warn "AWS credentials not configured - run 'aws configure'"
    fi
else
    warn "AWS CLI not installed (required for KMS)"
fi

# Check PM2
echo ""
echo "Checking PM2..."
if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 --version)
    pass "PM2 installed: $PM2_VERSION"
else
    warn "PM2 not installed - run 'npm install -g pm2'"
fi

# Check Docker
echo ""
echo "Checking Docker..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    pass "Docker installed: $DOCKER_VERSION"
else
    warn "Docker not installed"
fi

# Check dependencies
echo ""
echo "Checking dependencies..."
if [ -d "node_modules" ]; then
    pass "node_modules exists"
    
    # Check for key packages
    if [ -d "node_modules/@aws-sdk" ]; then
        pass "@aws-sdk installed"
    else
        warn "@aws-sdk not installed - run 'npm install'"
    fi
    
    if [ -d "node_modules/prom-client" ]; then
        pass "prom-client installed"
    else
        warn "prom-client not installed - run 'npm install'"
    fi
else
    fail "node_modules not found - run 'npm install'"
fi

# Test config loading
echo ""
echo "Testing configuration loading..."
if [ -f "dist/config-loader.js" ]; then
    if node -e "const { ProductionConfigLoader } = require('./dist/config-loader.js'); ProductionConfigLoader.load('./config/prod.yaml');" 2>/dev/null; then
        pass "Configuration loads successfully"
    else
        warn "Configuration has validation errors"
    fi
else
    warn "Build required - run 'npm run build'"
fi

# Summary
echo ""
echo "========================================="
echo "Summary"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. If warnings above, fix them"
echo "2. Run 'npm run build' to compile TypeScript"
echo "3. Encrypt private keys: ./scripts/encrypt-keys.sh"
echo "4. Configure .env.production with encrypted keys"
echo "5. Start with PM2: pm2 start ecosystem.config.js"
echo "   OR with Docker: docker-compose up -d"
echo ""
echo "Monitoring:"
echo "  Health: http://localhost:8080/health"
echo "  Metrics: http://localhost:8080/metrics"
echo ""
echo "========================================="

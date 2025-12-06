# Trading Bot - Production Package

Production-ready multi-chain trading bot with enterprise-grade security and monitoring.

## Features

✅ **Multi-Chain Support**
- Ethereum Mainnet
- Arbitrum
- Base
- Optimism
- Polygon

✅ **Secure Key Management**
- AWS KMS encryption
- Hashicorp Vault support
- Never stores plaintext keys

✅ **Exchange Adapters**
- Uniswap V3 (all chains)
- QuickSwap (Polygon)
- Extensible adapter system

✅ **Strategy Engine**
- Grid Trading
- Arbitrage (cross-chain)
- Momentum Trading
- Dynamic strategy loading

✅ **Production Features**
- Health check HTTP server (port 8080)
- Prometheus metrics endpoint
- Graceful shutdown (60s position monitoring)
- Auto-restart via PM2 or Docker
- CloudWatch logging integration
- Comprehensive error handling

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
# Copy production environment template
cp .env.production.example .env.production

# Set up AWS KMS key
export AWS_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/your-key-id

# Encrypt your private keys
chmod +x scripts/encrypt-keys.sh
./scripts/encrypt-keys.sh

# Add RPC endpoints to .env.production
# Edit the file and add your Alchemy/Infura API keys
```

### 3. Build

```bash
npm run build
```

### 4. Start with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start the bot
pm2 start ecosystem.config.js --env production

# Monitor
pm2 logs trading-bot
pm2 monit
```

### 5. Start with Docker

```bash
# Build and run
docker-compose up -d

# View logs
docker logs -f trading-bot-prod

# Check status
curl http://localhost:8080/health
```

## Configuration

Edit `config/prod.yaml` to configure:

- **Wallets**: Multi-chain wallet configuration
- **Exchanges**: Enable/disable exchanges per chain
- **Strategies**: Configure trading strategies
- **Risk Management**: Position sizing, stop loss, take profit
- **Monitoring**: Prometheus metrics, logging

## Health Checks

```bash
# Overall health
curl http://localhost:8080/health

# Prometheus metrics
curl http://localhost:8080/metrics

# Detailed status
curl http://localhost:8080/status | jq
```

## Monitoring

### Metrics Exposed

- `trading_bot_orders_total` - Total orders placed
- `trading_bot_position_pnl` - Current position PnL
- `trading_bot_execution_latency_ms` - Order execution time
- `trading_bot_gas_cost_usd` - Gas costs in USD
- `trading_bot_uptime_seconds` - Bot uptime
- `trading_bot_errors_total` - Error count

### Grafana Dashboard

Import the included Grafana dashboard:
1. Open Grafana
2. Import dashboard
3. Upload `grafana-dashboard.json`
4. Select Prometheus datasource

## Graceful Shutdown

The bot handles shutdown gracefully:

```bash
# Send SIGTERM
pm2 stop trading-bot

# Or Docker
docker stop trading-bot-prod
```

During shutdown:
1. Logs all open positions
2. Monitors positions for 60 seconds
3. Cancels pending orders (if configured)
4. Closes connections
5. Exits cleanly

## Security

🔒 **Private keys are encrypted at rest**
- Never stored in plaintext
- Decrypted in-memory only
- Encrypted with AWS KMS or Vault

🔒 **AWS IAM Best Practices**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:us-east-1:123456789012:key/your-key-id"
    }
  ]
}
```

## Architecture

```
src/
├── index.ts              # Main entry point
├── bot.ts                # Bot orchestration
├── config-loader.ts      # YAML config parser
├── encryption.ts         # KMS/Vault decryption
├── health-server.ts      # HTTP health checks
├── metrics.ts            # Prometheus metrics
└── api-server.ts         # WebSocket API (legacy)

config/
└── prod.yaml             # Production configuration

scripts/
└── encrypt-keys.sh       # Key encryption helper
```

## Troubleshooting

### Bot won't start

```bash
# Check logs
pm2 logs trading-bot --lines 100

# Verify config
node -e "const yaml = require('js-yaml'); const fs = require('fs'); console.log(yaml.load(fs.readFileSync('./config/prod.yaml', 'utf8')));"

# Test KMS decryption
aws kms decrypt --ciphertext-blob fileb://<(echo $AWS_KMS_ENCRYPTED_KEY_ETH | base64 -d) --query Plaintext --output text | base64 -d
```

### High error rate

```bash
# View recent errors
curl http://localhost:8080/status | jq '.errors'

# Increase log level to debug
# Edit config/prod.yaml: logging.level = debug
pm2 restart trading-bot
```

### Position stuck

```bash
# Get current positions
curl http://localhost:8080/status | jq '.positions'

# Emergency stop
pm2 stop trading-bot

# Manually close position via exchange UI if needed
```

## Development

```bash
# Run in development mode
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Testing

```bash
# Test configuration loading
npm run test:config

# Test key decryption
npm run test:decrypt

# Test exchange connections
npm run test:exchanges
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment guide including:
- AWS KMS setup
- RPC provider configuration
- PM2 vs Docker deployment
- Monitoring setup
- Security best practices
- Cost estimates

## Support

- **Documentation**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Issues**: Create a GitHub issue
- **Security**: Report to security@example.com

## License

MIT

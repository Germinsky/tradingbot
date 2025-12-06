# Production Deployment Guide

## Prerequisites

1. **AWS KMS Setup** (or Hashicorp Vault)
2. **Multi-chain RPC Endpoints** (Alchemy/Infura recommended)
3. **PM2** or **Docker** for process management
4. **Prometheus** (optional) for metrics collection

## Quick Start

### Option 1: PM2 Deployment

```bash
# Install PM2 globally
npm install -g pm2

# Install dependencies
npm install

# Build the project
npm run build

# Encrypt your private keys with AWS KMS
aws kms encrypt \
  --key-id $AWS_KMS_KEY_ID \
  --plaintext "0xYourPrivateKey" \
  --query CiphertextBlob \
  --output text

# Configure environment variables
cp .env.production.example .env.production
# Edit .env.production with your values

# Start with PM2
pm2 start ecosystem.config.js --env production

# Monitor
pm2 logs trading-bot
pm2 monit

# View metrics
curl http://localhost:8080/metrics
```

### Option 2: Docker Deployment

```bash
# Build Docker image
docker build -t trading-bot:latest .

# Run with docker-compose
docker-compose up -d

# View logs
docker logs -f trading-bot-prod

# Check health
curl http://localhost:8080/health
```

## Configuration

### 1. Encrypt Private Keys

#### Using AWS KMS:
```bash
#!/bin/bash
# encrypt-keys.sh

CHAINS=("ETH" "ARB" "BASE" "OP" "MATIC")

for CHAIN in "${CHAINS[@]}"; do
  echo "Encrypting key for $CHAIN..."
  read -sp "Enter private key for $CHAIN: " PRIVATE_KEY
  
  ENCRYPTED=$(aws kms encrypt \
    --key-id $AWS_KMS_KEY_ID \
    --plaintext "$PRIVATE_KEY" \
    --query CiphertextBlob \
    --output text)
  
  echo "AWS_KMS_ENCRYPTED_KEY_$CHAIN=$ENCRYPTED"
  echo ""
done
```

#### Using Hashicorp Vault:
```bash
# Store keys in Vault
vault kv put secret/trading-bot/eth-key privateKey="0xYourPrivateKey"
vault kv put secret/trading-bot/arb-key privateKey="0xYourPrivateKey"
# etc...

# Update config/prod.yaml to use vault:secret/data/trading-bot/eth-key format
```

### 2. Configure RPC Endpoints

Sign up for:
- **Alchemy**: https://www.alchemy.com/ (Recommended)
- **Infura**: https://infura.io/
- **QuickNode**: https://www.quicknode.com/

Add endpoints to `.env.production`:
```bash
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR-API-KEY
# etc...
```

### 3. Customize Strategies

Edit `config/prod.yaml`:

```yaml
strategies:
  - name: grid-strategy-eth
    type: grid
    enabled: true
    chain: ethereum
    symbol: ETH/USDC
    params:
      gridSize: 20
      gridSpacing: 25
      basePrice: 2000
      quantity: 0.05
```

## Health Checks

The bot exposes several endpoints:

- `GET /health` - Overall health status
- `GET /metrics` - Prometheus metrics
- `GET /ready` - Readiness probe (Kubernetes)
- `GET /live` - Liveness probe (Kubernetes)
- `GET /status` - Detailed status with positions/orders
- `POST /shutdown` - Graceful shutdown (should be authenticated)

Example health check:
```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "ok",
  "uptime": 3600,
  "timestamp": "2025-12-06T02:00:00.000Z",
  "bot": {
    "running": true,
    "equity": 50000,
    "positions": 3,
    "orders": 5,
    "errors": 0
  }
}
```

## Prometheus Metrics

Available metrics:
- `trading_bot_orders_total` - Total orders (counter)
- `trading_bot_position_pnl` - Position PnL (gauge)
- `trading_bot_execution_latency_ms` - Execution latency (histogram)
- `trading_bot_gas_cost_usd` - Gas costs (histogram)
- `trading_bot_uptime_seconds` - Uptime (gauge)
- `trading_bot_errors_total` - Error count (counter)

Configure Prometheus to scrape:
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'trading-bot'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

## Graceful Shutdown

The bot monitors open positions during shutdown:

1. Receives SIGTERM/SIGINT
2. Logs all open positions with PnL
3. Waits 60s monitoring positions
4. Cancels pending orders (if configured)
5. Stops all strategies
6. Exits cleanly

Force shutdown:
```bash
# Send SIGTERM
kill -TERM <pid>

# Or with PM2
pm2 stop trading-bot

# Or with Docker
docker stop trading-bot-prod
```

## Security Best Practices

1. **Never commit private keys** - Always use KMS/Vault
2. **Rotate keys regularly** - Update encrypted keys monthly
3. **Use least-privilege IAM** - KMS decrypt permission only
4. **Enable CloudWatch logs** - Monitor for suspicious activity
5. **Set up alerts** - Slack/PagerDuty for errors
6. **Use VPC endpoints** - For AWS services (avoid internet)
7. **Enable MFA** - For AWS console access
8. **Audit access logs** - Review who decrypts keys

## Monitoring

### PM2 Web Dashboard
```bash
pm2 install pm2-server-monit
```

### Grafana Dashboard
Import dashboard for trading bot metrics:
- Position PnL over time
- Order execution latency
- Gas costs per chain
- Error rates
- Uptime

### Alerts
Set up alerts for:
- Bot downtime > 5 minutes
- Error rate > 10/hour
- Drawdown > 10%
- Position PnL < -$1000
- Gas costs > $100/hour

## Troubleshooting

### Bot won't start
```bash
# Check logs
pm2 logs trading-bot --lines 100

# Check config
node -e "console.log(require('js-yaml').load(require('fs').readFileSync('./config/prod.yaml')))"

# Test KMS decryption
aws kms decrypt --ciphertext-blob fileb://<(echo $AWS_KMS_ENCRYPTED_KEY_ETH | base64 -d) --query Plaintext --output text | base64 -d
```

### High error rate
```bash
# Check recent errors
curl http://localhost:8080/status | jq '.errors'

# Increase log level
# Edit config/prod.yaml: logging.level = debug
pm2 restart trading-bot
```

### Position stuck
```bash
# Get current positions
curl http://localhost:8080/status | jq '.positions'

# Manual intervention may be required
# Use emergency shutdown
pm2 stop trading-bot
```

## Backup & Recovery

### Backup state
```bash
# Export positions (manual)
curl http://localhost:8080/status > backup-$(date +%Y%m%d).json
```

### Disaster Recovery
1. Stop bot: `pm2 stop trading-bot`
2. Review open positions
3. Manually close positions if needed
4. Fix configuration
5. Restart: `pm2 restart trading-bot`

## Cost Estimates

Per month (approximate):
- **AWS KMS**: $1 (10,000 requests free tier)
- **RPC Endpoints**: $0-$200 (depends on calls/day)
- **EC2 Instance**: $30-$100 (t3.medium recommended)
- **CloudWatch Logs**: $5-$20
- **Ethereum Gas**: Variable ($10-$500+)

**Total**: ~$50-$800/month (excluding gas)

## Support

- GitHub Issues: https://github.com/your-org/trading-bot/issues
- Slack: #trading-bot-support
- Email: support@example.com

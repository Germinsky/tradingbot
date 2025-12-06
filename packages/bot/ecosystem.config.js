// PM2 Ecosystem Configuration for Production
module.exports = {
  apps: [
    {
      name: 'trading-bot',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      
      // Auto-restart configuration
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      min_uptime: '60s',
      max_restarts: 10,
      restart_delay: 5000,
      
      // Environment
      env: {
        NODE_ENV: 'production',
        CONFIG_PATH: './config/prod.yaml',
      },
      
      // Logging
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Graceful shutdown
      kill_timeout: 65000, // 65s (5s more than shutdown timeout)
      wait_ready: true,
      listen_timeout: 10000,
      
      // Health checks
      health_check: {
        enabled: true,
        interval: 30000, // 30s
        endpoint: 'http://localhost:8080/health',
        timeout: 5000,
      },
      
      // Monitoring
      instance_var: 'INSTANCE_ID',
      combine_logs: true,
      
      // On error actions
      exp_backoff_restart_delay: 100,
    },
  ],
};

import { PerformanceMetrics, Trade } from './metrics-calculator';
import * as fs from 'fs';
import * as path from 'path';

export interface ReportConfig {
  title: string;
  outputPath: string;
  includeTradeLog: boolean;
  includeCharts: boolean;
}

export class HTMLReporter {
  private config: ReportConfig;

  constructor(config: ReportConfig) {
    this.config = config;
  }

  generateReport(metrics: PerformanceMetrics, trades: Trade[]): void {
    const html = this.buildHTML(metrics, trades);
    
    const dir = path.dirname(this.config.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(this.config.outputPath, html, 'utf-8');
    console.log(`✅ Report generated: ${this.config.outputPath}`);
  }

  private buildHTML(metrics: PerformanceMetrics, trades: Trade[]): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.config.title}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    ${this.getCSS()}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${this.config.title}</h1>
      <p class="subtitle">Generated on ${new Date().toLocaleString()}</p>
    </header>

    ${this.buildSummarySection(metrics)}
    ${this.buildRiskMetricsSection(metrics)}
    ${this.buildTradeStatisticsSection(metrics)}
    ${this.config.includeCharts ? this.buildChartsSection(metrics) : ''}
    ${this.buildStrategyBreakdownSection(metrics)}
    ${this.buildMonthlyReturnsTable(metrics)}
    ${this.config.includeTradeLog ? this.buildTradeLogSection(trades) : ''}
  </div>

  ${this.config.includeCharts ? this.buildChartScripts(metrics) : ''}
</body>
</html>`;
  }

  private getCSS(): string {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #333;
        line-height: 1.6;
        padding: 20px;
      }

      .container {
        max-width: 1400px;
        margin: 0 auto;
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        overflow: hidden;
      }

      header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 40px;
        text-align: center;
      }

      header h1 {
        font-size: 2.5em;
        margin-bottom: 10px;
      }

      .subtitle {
        opacity: 0.9;
        font-size: 0.9em;
      }

      section {
        padding: 40px;
        border-bottom: 1px solid #e0e0e0;
      }

      section:last-child {
        border-bottom: none;
      }

      h2 {
        color: #667eea;
        margin-bottom: 20px;
        font-size: 1.8em;
        border-bottom: 3px solid #667eea;
        padding-bottom: 10px;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-top: 20px;
      }

      .metric-card {
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      .metric-card h3 {
        font-size: 0.9em;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 10px;
      }

      .metric-card .value {
        font-size: 2em;
        font-weight: bold;
        color: #333;
      }

      .metric-card.positive .value {
        color: #10b981;
      }

      .metric-card.negative .value {
        color: #ef4444;
      }

      .chart-container {
        position: relative;
        height: 400px;
        margin: 30px 0;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
      }

      th {
        background: #667eea;
        color: white;
        padding: 12px;
        text-align: left;
        font-weight: 600;
      }

      td {
        padding: 10px 12px;
        border-bottom: 1px solid #e0e0e0;
      }

      tr:hover {
        background: #f8f9fa;
      }

      .positive {
        color: #10b981;
      }

      .negative {
        color: #ef4444;
      }

      .trade-long {
        background: rgba(16, 185, 129, 0.1);
      }

      .trade-short {
        background: rgba(239, 68, 68, 0.1);
      }

      .strategy-badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 20px;
        background: #667eea;
        color: white;
        font-size: 0.85em;
        font-weight: 600;
      }
    `;
  }

  private buildSummarySection(metrics: PerformanceMetrics): string {
    return `
    <section>
      <h2>📊 Performance Summary</h2>
      <div class="metrics-grid">
        <div class="metric-card ${metrics.totalReturnPercent >= 0 ? 'positive' : 'negative'}">
          <h3>Total Return</h3>
          <div class="value">${metrics.totalReturnPercent.toFixed(2)}%</div>
        </div>
        <div class="metric-card">
          <h3>Annualized Return</h3>
          <div class="value ${metrics.annualizedReturn >= 0 ? 'positive' : 'negative'}">
            ${metrics.annualizedReturn.toFixed(2)}%
          </div>
        </div>
        <div class="metric-card">
          <h3>Sharpe Ratio</h3>
          <div class="value">${metrics.sharpeRatio.toFixed(3)}</div>
        </div>
        <div class="metric-card negative">
          <h3>Max Drawdown</h3>
          <div class="value">${metrics.maxDrawdownPercent.toFixed(2)}%</div>
        </div>
      </div>
    </section>`;
  }

  private buildRiskMetricsSection(metrics: PerformanceMetrics): string {
    return `
    <section>
      <h2>⚠️ Risk Metrics</h2>
      <div class="metrics-grid">
        <div class="metric-card">
          <h3>Sortino Ratio</h3>
          <div class="value">${metrics.sortinoRatio.toFixed(3)}</div>
        </div>
        <div class="metric-card">
          <h3>Calmar Ratio</h3>
          <div class="value">${metrics.calmarRatio.toFixed(3)}</div>
        </div>
        <div class="metric-card negative">
          <h3>Max Drawdown ($)</h3>
          <div class="value">$${metrics.maxDrawdown.toFixed(2)}</div>
        </div>
        <div class="metric-card">
          <h3>Profit Factor</h3>
          <div class="value">${metrics.profitFactor.toFixed(2)}</div>
        </div>
      </div>
    </section>`;
  }

  private buildTradeStatisticsSection(metrics: PerformanceMetrics): string {
    return `
    <section>
      <h2>📈 Trade Statistics</h2>
      <div class="metrics-grid">
        <div class="metric-card">
          <h3>Total Trades</h3>
          <div class="value">${metrics.totalTrades}</div>
        </div>
        <div class="metric-card positive">
          <h3>Win Rate</h3>
          <div class="value">${metrics.winRate.toFixed(2)}%</div>
        </div>
        <div class="metric-card positive">
          <h3>Avg Win</h3>
          <div class="value">$${metrics.avgWin.toFixed(2)}</div>
        </div>
        <div class="metric-card negative">
          <h3>Avg Loss</h3>
          <div class="value">$${metrics.avgLoss.toFixed(2)}</div>
        </div>
        <div class="metric-card positive">
          <h3>Best Trade</h3>
          <div class="value">$${metrics.bestTrade.toFixed(2)}</div>
        </div>
        <div class="metric-card negative">
          <h3>Worst Trade</h3>
          <div class="value">$${metrics.worstTrade.toFixed(2)}</div>
        </div>
        <div class="metric-card">
          <h3>Consecutive Wins</h3>
          <div class="value">${metrics.consecutiveWins}</div>
        </div>
        <div class="metric-card">
          <h3>Consecutive Losses</h3>
          <div class="value">${metrics.consecutiveLosses}</div>
        </div>
      </div>
    </section>`;
  }

  private buildChartsSection(metrics: PerformanceMetrics): string {
    return `
    <section>
      <h2>📉 Equity & Drawdown Curves</h2>
      <div class="chart-container">
        <canvas id="equityChart"></canvas>
      </div>
      <div class="chart-container">
        <canvas id="underwaterChart"></canvas>
      </div>
    </section>`;
  }

  private buildStrategyBreakdownSection(metrics: PerformanceMetrics): string {
    if (metrics.strategyMetrics.size === 0) return '';

    const rows = Array.from(metrics.strategyMetrics.values())
      .map(s => `
        <tr>
          <td><span class="strategy-badge">${s.strategyName}</span></td>
          <td class="${s.totalReturn >= 0 ? 'positive' : 'negative'}">$${s.totalReturn.toFixed(2)}</td>
          <td>${s.sharpeRatio.toFixed(3)}</td>
          <td class="negative">$${s.maxDrawdown.toFixed(2)}</td>
          <td>${s.totalTrades}</td>
          <td class="positive">${s.winRate.toFixed(2)}%</td>
        </tr>
      `).join('');

    return `
    <section>
      <h2>🎯 Strategy Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Strategy</th>
            <th>Total Return</th>
            <th>Sharpe Ratio</th>
            <th>Max Drawdown</th>
            <th>Trades</th>
            <th>Win Rate</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>`;
  }

  private buildMonthlyReturnsTable(metrics: PerformanceMetrics): string {
    if (metrics.monthlyReturns.length === 0) return '';

    const rows = metrics.monthlyReturns
      .map(m => `
        <tr>
          <td>${m.year}</td>
          <td>${new Date(2000, m.month).toLocaleString('default', { month: 'long' })}</td>
          <td class="${m.return >= 0 ? 'positive' : 'negative'}">${m.return.toFixed(2)}%</td>
          <td>${m.trades}</td>
        </tr>
      `).join('');

    return `
    <section>
      <h2>📅 Monthly Returns</h2>
      <table>
        <thead>
          <tr>
            <th>Year</th>
            <th>Month</th>
            <th>Return</th>
            <th>Trades</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>`;
  }

  private buildTradeLogSection(trades: Trade[]): string {
    const rows = trades
      .slice(0, 100) // Limit to first 100 trades for performance
      .map(t => `
        <tr class="${t.side === 'long' ? 'trade-long' : 'trade-short'}">
          <td>${new Date(t.entryTime).toLocaleString()}</td>
          <td>${t.symbol}</td>
          <td>${t.side.toUpperCase()}</td>
          <td><span class="strategy-badge">${t.strategy}</span></td>
          <td>$${t.entryPrice.toFixed(2)}</td>
          <td>$${t.exitPrice.toFixed(2)}</td>
          <td>${t.quantity.toFixed(4)}</td>
          <td class="${t.pnl >= 0 ? 'positive' : 'negative'}">$${t.pnl.toFixed(2)}</td>
          <td class="${t.pnlPercent >= 0 ? 'positive' : 'negative'}">${t.pnlPercent.toFixed(2)}%</td>
          <td>${(t.duration / 3600000).toFixed(2)}h</td>
        </tr>
      `).join('');

    return `
    <section>
      <h2>📝 Trade Log (First 100 Trades)</h2>
      <table>
        <thead>
          <tr>
            <th>Entry Time</th>
            <th>Symbol</th>
            <th>Side</th>
            <th>Strategy</th>
            <th>Entry Price</th>
            <th>Exit Price</th>
            <th>Quantity</th>
            <th>P&L</th>
            <th>P&L %</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>`;
  }

  private buildChartScripts(metrics: PerformanceMetrics): string {
    const equityData = metrics.equityCurve.map(p => ({
      x: p.timestamp,
      y: p.equity,
    }));

    const underwaterData = metrics.equityCurve.map((p, i) => ({
      x: p.timestamp,
      y: -metrics.underwaterCurve[i],
    }));

    return `
    <script>
      // Equity Curve
      const equityCtx = document.getElementById('equityChart').getContext('2d');
      new Chart(equityCtx, {
        type: 'line',
        data: {
          datasets: [{
            label: 'Equity',
            data: ${JSON.stringify(equityData)},
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            fill: true,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'month'
              }
            },
            y: {
              beginAtZero: false
            }
          },
          plugins: {
            title: {
              display: true,
              text: 'Equity Curve',
              font: { size: 18 }
            }
          }
        }
      });

      // Underwater Curve
      const underwaterCtx = document.getElementById('underwaterChart').getContext('2d');
      new Chart(underwaterCtx, {
        type: 'line',
        data: {
          datasets: [{
            label: 'Drawdown',
            data: ${JSON.stringify(underwaterData)},
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            borderWidth: 2,
            fill: true,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'month'
              }
            },
            y: {
              reverse: false
            }
          },
          plugins: {
            title: {
              display: true,
              text: 'Underwater Curve (Drawdown Over Time)',
              font: { size: 18 }
            }
          }
        }
      });
    </script>`;
  }
}

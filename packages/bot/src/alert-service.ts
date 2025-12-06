/**
 * Alert Webhook Service
 * Sends notifications to Slack, Discord, and Telegram
 */

import { logger } from '@trading-bot/core';
import axios from 'axios';

export interface AlertConfig {
  slack?: {
    webhookUrl: string;
    channel?: string;
    username?: string;
  };
  discord?: {
    webhookUrl: string;
    username?: string;
  };
  telegram?: {
    botToken: string;
    chatId: string;
  };
  enabled?: boolean;
}

export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';

export interface Alert {
  level: AlertLevel;
  title: string;
  message: string;
  fields?: Record<string, string | number>;
  timestamp?: number;
}

export class AlertService {
  private config: AlertConfig;
  private enabled: boolean;

  constructor(config: AlertConfig) {
    this.config = config;
    this.enabled = config.enabled !== false;

    if (this.enabled) {
      logger.info('Alert service initialized with:', {
        slack: !!config.slack,
        discord: !!config.discord,
        telegram: !!config.telegram
      });
    }
  }

  /**
   * Send alert to all configured channels
   */
  async send(alert: Alert): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const timestamp = alert.timestamp || Date.now();
    
    const promises: Promise<void>[] = [];

    if (this.config.slack) {
      promises.push(this.sendToSlack(alert, timestamp));
    }

    if (this.config.discord) {
      promises.push(this.sendToDiscord(alert, timestamp));
    }

    if (this.config.telegram) {
      promises.push(this.sendToTelegram(alert, timestamp));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Send order fill notification
   */
  async notifyOrderFill(
    orderId: string,
    symbol: string,
    side: 'buy' | 'sell',
    quantity: number,
    price: number,
    chain: string
  ): Promise<void> {
    await this.send({
      level: 'info',
      title: `✅ Order Filled: ${side.toUpperCase()} ${symbol}`,
      message: `Order ${orderId} executed successfully`,
      fields: {
        Chain: chain,
        Side: side.toUpperCase(),
        Symbol: symbol,
        Quantity: quantity.toFixed(6),
        Price: `$${price.toFixed(2)}`,
        Total: `$${(quantity * price).toFixed(2)}`
      }
    });
  }

  /**
   * Send error notification
   */
  async notifyError(
    error: Error,
    context: string,
    details?: Record<string, string | number>
  ): Promise<void> {
    await this.send({
      level: 'error',
      title: `❌ Error: ${context}`,
      message: error.message,
      fields: {
        Context: context,
        Error: error.name,
        Stack: error.stack?.split('\n')[1] || 'N/A',
        ...details
      }
    });
  }

  /**
   * Send critical alert
   */
  async notifyCritical(
    title: string,
    message: string,
    details?: Record<string, string | number>
  ): Promise<void> {
    await this.send({
      level: 'critical',
      title: `🚨 CRITICAL: ${title}`,
      message,
      fields: details
    });
  }

  /**
   * Send warning notification
   */
  async notifyWarning(
    title: string,
    message: string,
    details?: Record<string, string | number>
  ): Promise<void> {
    await this.send({
      level: 'warning',
      title: `⚠️ Warning: ${title}`,
      message,
      fields: details
    });
  }

  /**
   * Send to Slack
   */
  private async sendToSlack(alert: Alert, timestamp: number): Promise<void> {
    if (!this.config.slack) return;

    try {
      const color = this.getSlackColor(alert.level);
      const fields = alert.fields
        ? Object.entries(alert.fields).map(([key, value]) => ({
            title: key,
            value: String(value),
            short: true
          }))
        : [];

      await axios.post(this.config.slack.webhookUrl, {
        channel: this.config.slack.channel,
        username: this.config.slack.username || 'Trading Bot',
        attachments: [
          {
            color,
            title: alert.title,
            text: alert.message,
            fields,
            ts: Math.floor(timestamp / 1000)
          }
        ]
      });

      logger.debug('Sent alert to Slack');
    } catch (error) {
      logger.error(`Failed to send Slack alert: ${error}`);
    }
  }

  /**
   * Send to Discord
   */
  private async sendToDiscord(alert: Alert, timestamp: number): Promise<void> {
    if (!this.config.discord) return;

    try {
      const color = this.getDiscordColor(alert.level);
      const fields = alert.fields
        ? Object.entries(alert.fields).map(([name, value]) => ({
            name,
            value: String(value),
            inline: true
          }))
        : [];

      await axios.post(this.config.discord.webhookUrl, {
        username: this.config.discord.username || 'Trading Bot',
        embeds: [
          {
            title: alert.title,
            description: alert.message,
            color,
            fields,
            timestamp: new Date(timestamp).toISOString()
          }
        ]
      });

      logger.debug('Sent alert to Discord');
    } catch (error) {
      logger.error(`Failed to send Discord alert: ${error}`);
    }
  }

  /**
   * Send to Telegram
   */
  private async sendToTelegram(alert: Alert, timestamp: number): Promise<void> {
    if (!this.config.telegram) return;

    try {
      const emoji = this.getTelegramEmoji(alert.level);
      let text = `${emoji} *${this.escapeMarkdown(alert.title)}*\n\n${this.escapeMarkdown(alert.message)}`;

      if (alert.fields) {
        text += '\n\n';
        for (const [key, value] of Object.entries(alert.fields)) {
          text += `*${this.escapeMarkdown(key)}:* ${this.escapeMarkdown(String(value))}\n`;
        }
      }

      text += `\n_${new Date(timestamp).toISOString()}_`;

      await axios.post(
        `https://api.telegram.org/bot${this.config.telegram.botToken}/sendMessage`,
        {
          chat_id: this.config.telegram.chatId,
          text,
          parse_mode: 'Markdown'
        }
      );

      logger.debug('Sent alert to Telegram');
    } catch (error) {
      logger.error(`Failed to send Telegram alert: ${error}`);
    }
  }

  /**
   * Get Slack color for alert level
   */
  private getSlackColor(level: AlertLevel): string {
    const colors: Record<AlertLevel, string> = {
      info: '#36a64f',
      warning: '#ff9800',
      error: '#f44336',
      critical: '#9c27b0'
    };
    return colors[level];
  }

  /**
   * Get Discord color for alert level
   */
  private getDiscordColor(level: AlertLevel): number {
    const colors: Record<AlertLevel, number> = {
      info: 0x36a64f,
      warning: 0xff9800,
      error: 0xf44336,
      critical: 0x9c27b0
    };
    return colors[level];
  }

  /**
   * Get Telegram emoji for alert level
   */
  private getTelegramEmoji(level: AlertLevel): string {
    const emojis: Record<AlertLevel, string> = {
      info: '✅',
      warning: '⚠️',
      error: '❌',
      critical: '🚨'
    };
    return emojis[level];
  }

  /**
   * Escape Markdown special characters for Telegram
   */
  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }
}

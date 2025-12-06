import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function getChainColor(chain: string): string {
  const colors: Record<string, string> = {
    ethereum: '#627EEA',
    base: '#0052FF',
    arbitrum: '#28A0F0',
    optimism: '#FF0420',
    polygon: '#8247E5',
    bsc: '#F3BA2F',
    avalanche: '#E84142',
  };
  return colors[chain.toLowerCase()] || '#888888';
}

export function getPnLColor(value: number): string {
  if (value > 0) return 'hsl(var(--success))';
  if (value < 0) return 'hsl(var(--destructive))';
  return 'hsl(var(--muted-foreground))';
}

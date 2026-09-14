import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCompactCurrency(amount: number): string {
  if (amount >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return formatCurrency(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDateTime(dateStr: string): string {
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'text-green-400';
    case 'REFUNDED': return 'text-blue-400';
    case 'BLOCKED': return 'text-red-400';
    default: return 'text-dark-400';
  }
}

export function getTransactionTypeLabel(type: string): string {
  switch (type) {
    case 'TOPUP': return 'Top-Up';
    case 'SPEND': return 'Purchase';
    case 'REFUND': return 'Refund';
    case 'TICKET_REPLACEMENT': return 'Replacement';
    default: return type;
  }
}

export function getTransactionTypeColor(type: string): string {
  switch (type) {
    case 'TOPUP': return 'bg-green-500/20 text-green-400';
    case 'SPEND': return 'bg-red-500/20 text-red-400';
    case 'REFUND': return 'bg-blue-500/20 text-blue-400';
    case 'TICKET_REPLACEMENT': return 'bg-yellow-500/20 text-yellow-400';
    default: return 'bg-dark-600 text-dark-300';
  }
}

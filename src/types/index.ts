export interface Visitor {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  created_at: string;
  wallets?: Wallet[];
}

export interface Wallet {
  id: string;
  visitor_id: string | null;
  qr_code_hash: string;
  balance: number;
  status: 'ACTIVE' | 'REFUNDED' | 'BLOCKED';
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  name: string;
  pin_hash: string;
  commission_rate: number;
  is_active: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  wallet_id: string;
  vendor_id: string | null;
  cashier_id: string | null;
  amount: number;
  type: 'TOPUP' | 'SPEND' | 'REFUND' | 'TICKET_REPLACEMENT';
  created_at: string;
}

export interface DeductionResult {
  success: boolean;
  error?: string;
  transaction_id?: string;
  new_balance?: number;
  deducted_amount?: number;
  current_balance?: number;
}

export interface RegisterResult {
  success: boolean;
  visitor_id?: string;
  wallet_id?: string;
  qr_code_hash?: string;
  error?: string;
}

export interface ReplacementResult {
  success: boolean;
  new_wallet_id?: string;
  transferred_balance?: number;
  visitor_id?: string;
  error?: string;
}

export interface TopUpResult {
  success: boolean;
  transaction_id?: string;
  new_balance?: number;
  topup_amount?: number;
  error?: string;
}

export interface VendorRevenueRow {
  vendor_id: string;
  vendor_name: string;
  commission_rate: number;
  total_transactions: number | null;
  gross_revenue: number | null;
  commission_amount: number | null;
}

export interface DailySettlementRow {
  settlement_date: string;
  vendor_id: string;
  vendor_name: string;
  commission_rate: number;
  total_transactions: number | null;
  gross_revenue: number | null;
  commission_amount: number | null;
  net_to_vendor: number | null;
  first_transaction: string;
  last_transaction: string;
}

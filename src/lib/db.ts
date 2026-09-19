import { getSupabase } from './supabase';
const supabase = getSupabase();

export async function registerVisitor(
  fullName: string,
  phone: string,
  email: string | null,
  paymentMethod: string = 'CASH',
  notes: string | null = null,
  amount: number = 0
) {
  const { data, error } = await supabase.rpc('register_visitor', {
    p_full_name: fullName,
    p_phone: phone,
    p_email: email,
    p_payment_method: paymentMethod,
    p_notes: notes,
    p_initial_amount: amount.toString(),
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function getVisitorsByPhone(phone: string) {
  const { data, error } = await supabase.rpc('get_visitors_by_phone', {
    p_phone: phone,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function topUpWallet(
  walletId: string,
  cashierId: string,
  amount: number
) {
  const { data, error } = await supabase.rpc('top_up_wallet', {
    p_wallet_id: walletId,
    p_cashier_id: cashierId,
    p_amount: amount.toString(),
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function getRecentTransactions() {
  const { data, error } = await supabase.rpc('get_recent_transactions');
  if (error) throw new Error(error.message);
  return data;
}

export async function voidTransaction(transactionId: string) {
  const { data, error } = await supabase.rpc('void_transaction', {
    p_transaction_id: transactionId,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function processDeduction(
  walletId: string,
  vendorId: string,
  amount: number
) {
  const { data, error } = await supabase.rpc('process_vendor_deduction', {
    p_wallet_id: walletId,
    p_vendor_id: vendorId,
    p_amount: amount.toString(),
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function replaceLostTicket(
  oldWalletId: string,
  cashierId: string
) {
  const { data, error } = await supabase.rpc('replace_lost_ticket', {
    p_old_wallet_id: oldWalletId,
    p_cashier_id: cashierId,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function getVisitorByPhone(phone: string) {
  const { data, error } = await supabase
    .from('visitors')
    .select('*, wallets(*)')
    .eq('phone', phone)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getWalletByQRHash(qrHash: string) {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('qr_code_hash', qrHash)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getVendorRevenueSummary() {
  const { data, error } = await supabase
    .from('vendor_revenue_summary')
    .select('*');
  if (error) throw new Error(error.message);
  return data;
}

export async function getDailySettlement() {
  const { data, error } = await supabase
    .from('daily_settlement')
    .select('*')
    .order('settlement_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function authenticateVendor(loginCode: string) {
  const { data, error } = await supabase.rpc('authenticate_vendor', {
    p_login_code: loginCode,
  });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [data].filter(Boolean);
  return rows.length > 0 ? rows[0] : null;
}

export async function authenticateCashier(loginCode: string) {
  const { data, error } = await supabase.rpc('authenticate_cashier', {
    p_login_code: loginCode,
  });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [data].filter(Boolean);
  return rows.length > 0 ? rows[0] : null;
}

export async function getVendorSales(vendorId: string) {
  const end = new Date().toISOString().split('T')[0];
  const start = new Date(2026, 0, 1).toISOString().split('T')[0];
  const { data, error } = await supabase.rpc('get_vendor_sales', {
    p_vendor_id: vendorId,
    p_start_date: start,
    p_end_date: end,
  });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [data].filter(Boolean);
  return rows.length > 0 ? rows[0] : null;
}

export async function getVendorTransactions(vendorId: string) {
  const { data, error } = await supabase.rpc('get_vendor_transactions', {
    p_vendor_id: vendorId,
  });
  if (error) throw new Error(error.message);
  if (data && typeof data === 'object' && 'transactions' in data) {
    return data.transactions;
  }
  return data;
}

export async function generateCSVSettlement(data: any[]) {
  const headers = [
    'Settlement Date',
    'Vendor ID',
    'Vendor Name',
    'Commission Rate',
    'Total Transactions',
    'Gross Revenue',
    'Commission Amount',
    'Net to Vendor',
    'First Transaction',
    'Last Transaction',
  ];

  const rows = data.map((row: any) => [
    row.settlement_date,
    row.vendor_id,
    row.vendor_name,
    row.commission_rate.toString(),
    row.total_transactions?.toString() || '0',
    row.gross_revenue?.toString() || '0.00',
    row.commission_amount?.toString() || '0.00',
    row.net_to_vendor?.toString() || '0.00',
    row.first_transaction,
    row.last_transaction,
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `settlement_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

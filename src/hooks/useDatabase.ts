import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';
const supabase = getSupabase();

export function useWallet(walletId: string | null) {
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async () => {
    if (!walletId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', walletId)
        .single();
      if (error) throw error;
      setWallet(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [walletId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  // Real-time subscription
  useEffect(() => {
    if (!walletId) return;
    const channel = supabase
      .channel(`wallet:${walletId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'wallets',
        filter: `id=eq.${walletId}`,
      }, (payload: any) => {
        setWallet(payload.new);
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [walletId]);

  return { wallet, loading, error, refetch: fetchWallet };
}

export function useTransactions(walletId: string | null) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletId) return;
    const fetchTransactions = async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('wallet_id', walletId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTransactions(data);
    };
    fetchTransactions();
  }, [walletId]);

  return { transactions, loading };
}

export function useRealtimeTransactions(walletId: string | null) {
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!walletId) return;
    const channel = supabase
      .channel(`transactions:${walletId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'transactions',
        filter: `wallet_id=eq.${walletId}`,
      }, (payload: any) => {
        setTransactions(prev => [payload.new, ...prev]);
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [walletId]);

  return transactions;
}

export function useVisitorByPhone(phone: string) {
  const [visitor, setVisitor] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async () => {
    if (!phone || phone.length < 3) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('visitors')
        .select('*, wallets(*)')
        .eq('phone', phone)
        .single();
      if (error) throw error;
      setVisitor(data);
    } catch (err: any) {
      setError(err.message);
      setVisitor(null);
    } finally {
      setLoading(false);
    }
  }, [phone]);

  return { visitor, loading, error, lookup };
}

export function useDailySettlement() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from('daily_settlement')
        .select('*')
        .order('settlement_date', { ascending: false });
      if (error) throw error;
      setData(data);
    };
    fetch();
  }, []);

  return { data, loading };
}

export function useVendorRevenue() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from('vendor_revenue_summary')
        .select('*');
      if (error) throw error;
      setData(data);
    };
    fetch();
  }, []);

  return { data, loading };
}

export function useRealtimeActivityFeed() {
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel('public:transactions')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'transactions',
      }, (payload: any) => {
        setActivities(prev => [payload.new, ...prev.slice(0, 49)]);
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, []);

  return activities;
}

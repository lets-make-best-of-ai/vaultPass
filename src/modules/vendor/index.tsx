"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  authenticateVendor,
  getVendorSales,
  getVendorTransactions,
  processDeduction,
} from '@/lib/db';
import { getSupabase } from '@/lib/supabase';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import Spinner from '@/components/ui/spinner';
import { cn, formatCurrency } from '@/lib/utils';

type Screen = 'login' | 'pos' | 'scan';
type Tab = 'pos' | 'history';

const sb = getSupabase();

export default function VendorPOS() {
  const [screen, setScreen] = useState<Screen>('login');
  const [tab, setTab] = useState<Tab>('pos');
  const [vendor, setVendor] = useState<any>(null);
  const [loginCode, setLoginCode] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [totalSales, setTotalSales] = useState<number>(0);
  const [salesCount, setSalesCount] = useState<number>(0);
  const [posTransactions, setPosTransactions] = useState<any[]>([]);
  const [transactionsHistory, setTransactionsHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [scannedWallet, setScannedWallet] = useState<any>(null);
  const [deductAmount, setDeductAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [deductResult, setDeductResult] = useState<any>(null);
  const [scannerError, setScannerError] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);

  const loadSalesData = useCallback(async (vendorId: string) => {
    try {
      const salesData = await getVendorSales(vendorId);
      if (salesData && salesData[0]) {
        setTotalSales(Number(salesData[0].total_sales) || 0);
        setSalesCount(Number(salesData[0].transaction_count) || 0);
      }
    } catch {
      // Silently handle
    }
  }, []);

  const loadPosTransactions = useCallback(async (vendorId: string) => {
    try {
      const txns = await getVendorTransactions(vendorId);
      setPosTransactions(txns || []);
    } catch {
      // Silently handle
    }
  }, []);

  // Real-time subscription for vendor SPEND transactions
  useEffect(() => {
    if (screen !== 'pos' || !vendor) return;

    const channel = sb.channel(`vendor:${vendor.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'transactions',
        filter: `vendor_id=eq.${vendor.id}`,
      }, (payload: any) => {
        const newTxn = payload.new;
        if (newTxn.type === 'SPEND') {
          setPosTransactions(prev => [newTxn, ...prev.slice(0, 19)]);
          setTotalSales(prev => prev + Number(newTxn.amount));
          setSalesCount(prev => prev + 1);
        }
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [screen, vendor]);

  // Load initial data when entering pos screen
  useEffect(() => {
    if (screen === 'pos' && vendor) {
      loadSalesData(vendor.id);
      loadPosTransactions(vendor.id);
    }
  }, [screen, vendor, loadSalesData, loadPosTransactions]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginCode.trim()) return;

    setLoginLoading(true);
    setLoginError('');

    try {
      const result = await authenticateVendor(loginCode.trim());
      if (result && result.length > 0) {
        setVendor(result[0]);
        setScreen('pos');
        setLoginCode('');
      } else {
        setLoginError('Invalid login code');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Authentication failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const startScanner = useCallback(async () => {
    setScreen('scan');
    setScannerError('');
    setScannedWallet(null);
    setDeductResult(null);
    setDeductAmount('');

    try {
      const html5Qrcode = new Html5Qrcode('reader');
      await html5Qrcode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          try {
            await html5Qrcode.stop();
            scannerRef.current = null;
            const response = await fetch(`/api/wallet/${decodedText}`);
            if (!response.ok) throw new Error('Wallet not found');
            const walletInfo = await response.json();
            setScannedWallet(walletInfo);
            setScreen('pos');
            setTab('pos');
          } catch (err: any) {
            setScannerError(err.message);
          }
        },
        () => {}
      );
      scannerRef.current = html5Qrcode;
    } catch (err: any) {
      setScannerError(err.message);
      setScreen('pos');
    }
  }, []);

  const handleDeduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedWallet?.id || !vendor || !deductAmount) return;

    setProcessing(true);
    setDeductResult(null);

    try {
      const result = await processDeduction(
        scannedWallet.id,
        vendor.id,
        parseFloat(deductAmount)
      );
      setDeductResult(result);
      if (result.success) {
        setScannedWallet((prev: any) => ({ ...prev, balance: result.new_balance }));
        setDeductAmount('');
        loadPosTransactions(vendor.id);
        loadSalesData(vendor.id);
      }
    } catch (err: any) {
      setDeductResult({ success: false, error: err.message });
    } finally {
      setProcessing(false);
    }
  };

  const quickDeduct = (amount: number) => {
    setDeductAmount(amount.toString());
  };

  const handleHistoryClick = async () => {
    if (!vendor) return;
    setTab('history');
    setHistoryLoading(true);
    try {
      const txns = await getVendorTransactions(vendor.id);
      setTransactionsHistory(txns || []);
    } catch {
      // Silently handle
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleLogout = () => {
    setVendor(null);
    setScreen('login');
    setScannedWallet(null);
    setDeductResult(null);
    setPosTransactions([]);
    setTotalSales(0);
    setSalesCount(0);
    setDeductAmount('');
    setLoginCode('');
    setTab('pos');
  };

  const totalHistory = transactionsHistory.reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Vendor POS</h2>
          {vendor && (
            <div className="flex items-center gap-3">
              <Badge variant="success">{vendor.name}</Badge>
              <Button variant="ghost" size="sm" onClick={handleLogout}>Logout</Button>
            </div>
          )}
        </div>

        {/* Screen A: Vendor Login */}
        {screen === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4 max-w-md mx-auto">
            <div>
              <h3 className="text-lg font-medium text-white text-center mb-2">Vendor Login</h3>
              <p className="text-dark-400 text-sm text-center">Enter your login code provided by the event organizer</p>
            </div>
            <input
              type="text"
              placeholder="Login Code"
              value={loginCode}
              onChange={e => setLoginCode(e.target.value.toUpperCase())}
              className="input-field text-center text-lg"
              autoFocus
            />
            {loginError && (
              <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm text-center">
                {loginError}
              </div>
            )}
            <Button type="submit" loading={loginLoading} variant="primary" className="w-full" size="lg">
              Login
            </Button>
          </form>
        )}

        {/* Screen B/C: POS */}
        {(screen === 'pos' || screen === 'scan') && vendor && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-dark-900 rounded-lg border border-dark-600">
                <p className="text-dark-400 text-xs uppercase tracking-wider">Vendor</p>
                <p className="text-white font-bold mt-1">{vendor.name}</p>
              </div>
              <div className="p-4 bg-dark-900 rounded-lg border border-dark-600">
                <p className="text-dark-400 text-xs uppercase tracking-wider">Total Sales</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{formatCurrency(totalSales)}</p>
                <p className="text-dark-400 text-xs">{salesCount} transactions</p>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2">
              <Button
                variant={tab === 'pos' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setTab('pos')}
              >
                POS
              </Button>
              <Button
                variant={tab === 'history' ? 'primary' : 'secondary'}
                size="sm"
                onClick={handleHistoryClick}
              >
                History
              </Button>
            </div>

            {/* POS Tab */}
            {tab === 'pos' && (
              <div className="space-y-4">
                <Button onClick={startScanner} variant="accent" className="w-full" size="lg">
                  📷 Scan QR Code
                </Button>

                <div>
                  <p className="text-dark-400 text-xs uppercase tracking-wider mb-2">Quick Deduct</p>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 5, 10, 20, 50].map(amount => (
                      <Button
                        key={amount}
                        variant="secondary"
                        size="sm"
                        onClick={() => quickDeduct(amount)}
                      >
                        ${amount}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Wallet display after scan */}
                {scannedWallet && (
                  <form onSubmit={handleDeduct} className="p-4 bg-dark-900 rounded-lg border border-dark-600 space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-dark-400 text-xs">Wallet</p>
                        <p className="text-white font-mono text-sm">...{scannedWallet.id?.slice(-8)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-dark-400 text-xs">Balance</p>
                        <p className="text-xl font-bold text-green-400">{formatCurrency(Number(scannedWallet.balance))}</p>
                      </div>
                    </div>
                    <Badge variant={scannedWallet.status === 'ACTIVE' ? 'success' : 'danger'}>
                      {scannedWallet.status}
                    </Badge>

                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={Number(scannedWallet.balance)}
                        placeholder="Amount"
                        value={deductAmount}
                        onChange={e => setDeductAmount(e.target.value)}
                        className="input-field flex-1"
                        required
                      />
                      <Button type="submit" loading={processing} variant="danger">
                        Deduct
                      </Button>
                    </div>

                    {deductResult && (
                      <div className={cn(
                        'p-3 rounded-lg text-sm',
                        deductResult.success
                          ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                          : 'bg-red-500/10 border border-red-500/30 text-red-400'
                      )}>
                        {deductResult.success ? (
                          <>✓ Deducted {formatCurrency(deductResult.deducted_amount)}! New balance: {formatCurrency(deductResult.new_balance)}</>
                        ) : (
                          <>✗ {deductResult.error}</>
                        )}
                      </div>
                    )}
                  </form>
                )}

                {/* Recent Transactions */}
                {posTransactions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-dark-400 uppercase tracking-wider mb-2">Recent Transactions</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {posTransactions.slice(0, 10).map((tx: any) => (
                        <div key={tx.id} className="flex justify-between items-center p-2 bg-dark-900 rounded text-sm">
                          <span className="text-dark-300">SPEND</span>
                          <span className="text-red-400">-{formatCurrency(Number(tx.amount))}</span>
                          <span className="text-dark-500 text-xs">{new Date(tx.created_at).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* History Tab */}
            {tab === 'history' && (
              <div className="space-y-4">
                <p className="text-dark-400 text-sm">
                  {transactionsHistory.length} transactions · Total: {formatCurrency(totalHistory)}
                </p>

                {historyLoading ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : transactionsHistory.length === 0 ? (
                  <div className="text-center text-dark-400 py-8">No transactions yet</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {transactionsHistory.map((tx: any) => (
                      <div key={tx.id} className="flex justify-between items-center p-3 bg-dark-900 rounded-lg">
                        <div>
                          <p className="text-white text-sm font-mono">{tx.id?.slice(0, 8)}...</p>
                          <p className="text-dark-400 text-xs">Wallet: ...{tx.wallet_last4}</p>
                          <p className="text-dark-400 text-xs">{new Date(tx.created_at).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-red-400 font-bold">-{formatCurrency(Number(tx.amount))}</p>
                          <Badge variant="danger" className="mt-1">SPEND</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Scanner overlay when in scan screen */}
        {screen === 'scan' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Scan QR Code</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (scannerRef.current) {
                    scannerRef.current.stop().catch(() => {});
                    scannerRef.current = null;
                  }
                  setScreen('pos');
                }}
              >
                Back
              </Button>
            </div>

            <div id="reader" className="w-full rounded-lg overflow-hidden bg-dark-900" />

            {scannerError && (
              <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
                {scannerError}
              </div>
            )}

            {scannedWallet && (
              <div className="p-4 bg-dark-900 rounded-lg border border-dark-600 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-dark-400 text-xs">Wallet ID</p>
                    <p className="text-white font-mono text-sm">...{scannedWallet.id?.slice(-8)}</p>
                  </div>
                  <div>
                    <p className="text-dark-400 text-xs">Balance</p>
                    <p className="text-xl font-bold text-green-400">{formatCurrency(Number(scannedWallet.balance))}</p>
                  </div>
                </div>
                <Badge variant={scannedWallet.status === 'ACTIVE' ? 'success' : 'danger'}>
                  {scannedWallet.status}
                </Badge>

                <form onSubmit={handleDeduct} className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={Number(scannedWallet.balance)}
                    placeholder="Deduction amount"
                    value={deductAmount}
                    onChange={e => setDeductAmount(e.target.value)}
                    className="input-field flex-1"
                    required
                  />
                  <Button type="submit" loading={processing} variant="danger">
                    Deduct
                  </Button>
                </form>

                {deductResult && (
                  <div className={cn(
                    'p-3 rounded-lg text-sm',
                    deductResult.success
                      ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                      : 'bg-red-500/10 border border-red-500/30 text-red-400'
                  )}>
                    {deductResult.success ? (
                      <>✓ Deducted {formatCurrency(deductResult.deducted_amount)}! New balance: {formatCurrency(deductResult.new_balance)}</>
                    ) : (
                      <>✗ {deductResult.error}</>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

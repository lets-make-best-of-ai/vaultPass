"use client";

import { useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { processDeduction } from '@/lib/db';
import { useWallet, useRealtimeTransactions } from '@/hooks/useDatabase';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import Spinner from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';

interface ScannerState {
  scanning: boolean;
  error: string | null;
  lastResult: string | null;
}

export default function VendorPOS() {
  const [scanner, setScanner] = useState<ScannerState>({
    scanning: false,
    error: null,
    lastResult: null,
  });
  const [vendorId, setVendorId] = useState('');
  const [vendorPin, setVendorPin] = useState('');
  const [deductAmount, setDeductAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [deductionResult, setDeductionResult] = useState<any>(null);
  const [walletData, setWalletData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const { wallet } = useWallet(walletData?.wallet_id || null);
  const transactions = useRealtimeTransactions(walletData?.wallet_id || null);

  const startScanner = useCallback(async () => {
    setScanner({ scanning: true, error: null, lastResult: null });
    try {
      const html5Qrcode = new Html5Qrcode('reader');
      await html5Qrcode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setScanner({ scanning: false, error: null, lastResult: decodedText });
          setWalletData(null);
          handleQRDecode(decodedText);
          html5Qrcode.stop().catch(() => {});
        },
        () => {} // Ignore scan errors
      );
    } catch (err: any) {
      setScanner({ scanning: false, error: err.message, lastResult: null });
    }
  }, []);

  const handleQRDecode = async (qrData: string) => {
    try {
      const walletId = qrData;
      const response = await fetch(`/api/wallet/${walletId}`);
      if (!response.ok) throw new Error('Wallet not found');
      const walletInfo = await response.json();
      setWalletData(walletInfo);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletData?.wallet_id || !vendorId || !deductAmount) return;

    setProcessing(true);
    setError(null);
    setDeductionResult(null);

    try {
      const result = await processDeduction(
        walletData.wallet_id,
        vendorId,
        parseFloat(deductAmount)
      );
      setDeductionResult(result);
      if (result.success) {
        setWalletData((prev: any) => ({ ...prev, balance: result.new_balance }));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <h2 className="text-xl font-bold text-white mb-4">Vendor Mobile POS</h2>

        {/* Vendor Auth */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <input
            type="text"
            placeholder="Vendor ID"
            value={vendorId}
            onChange={e => setVendorId(e.target.value)}
            className="input-field"
          />
          <input
            type="password"
            placeholder="PIN"
            value={vendorPin}
            onChange={e => setVendorPin(e.target.value)}
            className="input-field"
          />
        </div>

        {/* QR Scanner */}
        <div className="mb-6">
          <Button
            onClick={startScanner}
            loading={scanner.scanning}
            variant="accent"
            className="w-full mb-4"
          >
            {scanner.scanning ? 'Scanning...' : '📷 Scan QR Ticket'}
          </Button>

          <div id="reader" className="w-full rounded-lg overflow-hidden bg-dark-900" />

          {scanner.error && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
              {scanner.error}
            </div>
          )}
          {scanner.lastResult && (
            <div className="mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">
              QR Detected: {scanner.lastResult.substring(0, 16)}...
            </div>
          )}
        </div>

        {/* Wallet Display & Deduction */}
        {walletData && (
          <form onSubmit={handleDeduct} className="space-y-4">
            <div className="p-4 bg-dark-900 rounded-lg border border-dark-600 grid grid-cols-2 gap-4">
              <div>
                <p className="text-dark-400 text-xs">Wallet ID</p>
                <p className="text-white font-mono text-sm">{walletData.wallet_id?.substring(0, 12)}...</p>
              </div>
              <div>
                <p className="text-dark-400 text-xs">Balance</p>
                <p className="text-2xl font-bold text-green-400">{formatCurrency(Number(walletData.balance))}</p>
              </div>
              <div>
                <p className="text-dark-400 text-xs">Status</p>
                <Badge variant={walletData.status === 'ACTIVE' ? 'success' : 'danger'}>
                  {walletData.status}
                </Badge>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="0.01"
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
          </form>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {deductionResult && (
          <div className={cn(
            'mt-4 p-4 rounded-lg',
            deductionResult.success
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          )}>
            <p className={deductionResult.success ? 'text-green-400' : 'text-red-400'}>
              {deductionResult.success ? '✓ Deduction successful!' : `✗ ${deductionResult.error}`}
            </p>
            {deductionResult.new_balance && (
              <p className="text-dark-300 text-sm mt-1">
                New Balance: {formatCurrency(deductionResult.new_balance)}
              </p>
            )}
            {deductionResult.current_balance && (
              <p className="text-dark-300 text-xs mt-1">
                Current Balance: {formatCurrency(deductionResult.current_balance)}
              </p>
            )}
          </div>
        )}

        {/* Live Transactions */}
        {transactions.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-dark-400 uppercase tracking-wider mb-2">Recent Transactions</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {transactions.slice(0, 10).map((tx: any) => (
                <div key={tx.id} className="flex justify-between items-center p-2 bg-dark-900 rounded text-sm">
                  <span className="text-dark-300">{tx.type}</span>
                  <span className={tx.type === 'SPEND' ? 'text-red-400' : 'text-green-400'}>
                    {tx.type === 'SPEND' ? '-' : '+'} ${Number(tx.amount).toFixed(2)}
                  </span>
                  <span className="text-dark-500 text-xs">{new Date(tx.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

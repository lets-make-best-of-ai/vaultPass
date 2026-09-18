"use client";

import { useState, useCallback } from 'react';
import {
  Zap, Printer, User, Phone, Mail, Wallet, CircleDollarSign, ShieldAlert,
  ScanQrCode, Search, Info, Database, Cpu, CheckCircle2, AlertTriangle,
  Ban, Camera, X, PlusCircle, Check, AlertCircle, Printer as PrinterIcon,
  ChevronRight, Wrench
} from 'lucide-react';
import { registerVisitor, topUpWallet, replaceLostTicket, getRecentTransactions, voidTransaction, getVisitorsByPhone } from '@/lib/db';
import { printQRWalletTicket, printTopUpReceipt, printReplacementReceipt, requestUSBDevice } from '@/lib/printer';
import { formatCurrency } from '@/lib/utils';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';

// Tab types
type Tab = 'register' | 'topup' | 'recovery' | 'history';

// Toast types
interface Toast {
  message: string;
  type: 'success' | 'warning' | 'danger';
}

// Receipt data for thermal print
interface ReceiptData {
  jobType: string;
  title: string;
  attendeeName: string;
  phone: string;
  walletId: string;
  status: string;
  balanceLabel: string;
  balance: number;
  barcode: string;
}

export default function CashierStation() {
  const [activeTab, setActiveTab] = useState<Tab>('register');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // --- Register state ---
  const [regName, setRegName] = useState('Taylor Reed');
  const [regPhone, setRegPhone] = useState('+1 (555) 349-8821');
  const [regEmail, setRegEmail] = useState('taylor.reed@livemusic.org');
  const [regDepositAmount, setRegDepositAmount] = useState(50);
  const [regPaymentMethod, setRegPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');

  // --- Top-up state ---
  const [topupSearchQuery, setTopupSearchQuery] = useState('');
  const [activeTopupWallet, setActiveTopupWallet] = useState({
    name: 'Jordan Lee',
    phone: '+1 (555) 782-9014',
    balance: 34.50,
    walletId: 'WLT-8921-QR'
  });
  const [topupAddAmount, setTopupAddAmount] = useState(20);
  const [hasWallet, setHasWallet] = useState(false);

  // --- Recovery state ---
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [activeRecoveryWallet, setActiveRecoveryWallet] = useState({
    name: 'Marcus Vance',
    phone: '+1 (555) 612-4019',
    balance: 87.50,
    walletId: 'WLT-6124-LOST'
  });
  const [showRecoveryDetails, setShowRecoveryDetails] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);

  // --- History state ---
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showTransactionVoidModal, setShowTransactionVoidModal] = useState(false);
  const [voidingTxId, setVoidingTxId] = useState<string | null>(null);

  // --- Top-up visitor selection state ---
  const [topupVisitors, setTopupVisitors] = useState<any[]>([]);
  const [topupSelectedVisitor, setTopupSelectedVisitor] = useState<any>(null);

  // --- Modals ---
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentReceipt, setCurrentReceipt] = useState<ReceiptData | null>(null);

  // --- Toast ---
  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- Tab switching ---
  const switchTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
    if (tab !== 'recovery') setShowRecoveryDetails(false);
    if (tab !== 'topup') setHasWallet(false);
  }, []);

  // --- Register quick amount ---
  const setRegAmount = useCallback((val: number) => {
    setRegDepositAmount(val);
  }, []);

  const onCustomRegInput = useCallback((val: string) => {
    const num = parseFloat(val) || 0;
    setRegDepositAmount(num);
  }, []);

  // --- Register submit ---
  const handleRegistrationSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone.trim()) {
      showToast('Full Name and Phone are required.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const data = await registerVisitor(regName, regPhone, regEmail || null, regPaymentMethod);
      const walletId = data.wallet_id || 'WLT-' + Math.floor(1000 + Math.random() * 9000) + '-EVT';
      const qrHash = data.qr_code_hash || walletId;

      showToast('Record inserted into public.visitors & public.wallets!', 'success');

      // Print receipt
      const device = await requestUSBDevice();
      setCurrentReceipt({
        jobType: 'NEW VISITOR REGISTRATION',
        title: 'NEW ENROLLMENT & TICKET',
        attendeeName: regName,
        phone: regPhone,
        walletId,
        status: 'VERIFIED ACTIVE',
        balanceLabel: 'INITIAL WALLET BALANCE',
        balance: regDepositAmount,
        barcode: `*${walletId}*`
      });
      setShowReceiptModal(true);

      if (device) {
        await printQRWalletTicket(walletId, regDepositAmount, regName, device);
      }
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [regName, regPhone, regEmail, regDepositAmount, showToast]);

  // --- Load recent transactions ---
  const loadTransactions = useCallback(async () => {
    try {
      const data = await getRecentTransactions();
      setTransactions(data || []);
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  }, [showToast]);

  // --- Void a transaction ---
  const handleVoidClick = useCallback((txId: string) => {
    setVoidingTxId(txId);
    setShowTransactionVoidModal(true);
  }, []);

  const confirmVoid = useCallback(async () => {
    if (!voidingTxId) return;
    setLoading(true);
    try {
      await voidTransaction(voidingTxId);
      setTransactions(prev => prev.map(t => t.id === voidingTxId ? { ...t, status: 'VOIDED' } : t));
      setShowTransactionVoidModal(false);
      setVoidingTxId(null);
      showToast('Transaction marked as VOIDED', 'success');
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [voidingTxId, showToast]);

  // --- Top-up: lookup by phone with duplicate handling ---
  const handleTopupLookup = useCallback(async () => {
    if (!topupSearchQuery.trim()) {
      showToast('Please enter phone to lookup', 'warning');
      return;
    }
    try {
      const visitors = await getVisitorsByPhone(topupSearchQuery);
      if (visitors.length === 0) {
        showToast('No visitor found with this phone', 'warning');
        setTopupVisitors([]);
        setTopupSelectedVisitor(null);
        setHasWallet(false);
      } else if (visitors.length === 1) {
        const v = visitors[0];
        setActiveTopupWallet({ name: v.full_name, phone: v.phone, balance: Number(v.wallet_balance) || 0, walletId: v.wallet_id || 'N/A' });
        setTopupSelectedVisitor(v);
        setHasWallet(true);
        setTopupVisitors([]);
        showToast('Wallet located for: ' + v.full_name, 'success');
      } else {
        setTopupVisitors(visitors);
        setTopupSelectedVisitor(null);
        setHasWallet(false);
        showToast(`${visitors.length} visitors found — select one`, 'warning');
      }
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  }, [topupSearchQuery, showToast]);

  // --- Top-up: select visitor from list ---
  const selectVisitor = useCallback((v: any) => {
    setActiveTopupWallet({ name: v.full_name, phone: v.phone, balance: Number(v.wallet_balance) || 0, walletId: v.wallet_id || 'N/A' });
    setTopupSelectedVisitor(v);
    setHasWallet(true);
    setTopupVisitors([]);
    showToast('Wallet located for: ' + v.full_name, 'success');
  }, [showToast]);

  // --- Top-up: open scanner ---
  const triggerCameraScanner = useCallback(() => {
    setShowScannerModal(true);
  }, []);

  const closeScannerModal = useCallback(() => {
    setShowScannerModal(false);
  }, []);

  const simulateScanDetected = useCallback(() => {
    closeScannerModal();
    const wallet = {
      name: 'Jordan Lee (Scanned)',
      phone: '+1 (555) 782-9014',
      balance: 34.50,
      walletId: 'WLT-8921-QR'
    };
    setActiveTopupWallet(wallet);
    setHasWallet(true);
    showToast('QR Code Verified: Jordan Lee (WLT-8921-QR)', 'success');
  }, [closeScannerModal, showToast]);

  // --- Top-up: lookup ---
  const performLookup = useCallback(() => {
    handleTopupLookup();
  }, [handleTopupLookup]);

  // --- Top-up: quick amount ---
  const setTopupAmount = useCallback((val: number) => {
    setTopupAddAmount(val);
  }, []);

  const onCustomTopupInput = useCallback((val: string) => {
    const num = parseFloat(val) || 0;
    setTopupAddAmount(num);
  }, []);

  const updateTopupPreview = useCallback(() => {
    return activeTopupWallet.balance + topupAddAmount;
  }, [activeTopupWallet.balance, topupAddAmount]);

  // --- Top-up: execute ---
  const executeTopUp = useCallback(async () => {
    if (topupAddAmount <= 0) {
      showToast('Please enter an amount to top-up', 'warning');
      return;
    }
    setLoading(true);
    try {
      const cashierId = '00000000-0000-0000-0000-000000000001'; // In real app, from auth
      const data = await topUpWallet(activeTopupWallet.walletId, cashierId, topupAddAmount);
      const newBal = Number(data.new_balance) || activeTopupWallet.balance + topupAddAmount;
      setActiveTopupWallet(prev => ({ ...prev, balance: newBal }));

      showToast(`Added +${formatCurrency(topupAddAmount)} to ${activeTopupWallet.name}'s wallet`, 'success');

      const device = await requestUSBDevice();
      setCurrentReceipt({
        jobType: 'CASH TOP-UP COMPLETED',
        title: 'TOP-UP RECEIPT SLIP',
        attendeeName: activeTopupWallet.name,
        phone: activeTopupWallet.phone,
        walletId: activeTopupWallet.walletId,
        status: 'VERIFIED ACTIVE',
        balanceLabel: 'NEW BALANCE',
        balance: newBal,
        barcode: `*${activeTopupWallet.walletId}*`
      });
      setShowReceiptModal(true);

      if (device) {
        await printTopUpReceipt(activeTopupWallet.walletId, newBal, topupAddAmount, 'Jane Doe #104', device);
      }
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [topupAddAmount, activeTopupWallet, showToast]);

  // --- Recovery: search ---
  const searchLostTicket = useCallback(() => {
    if (!recoveryPhone.trim()) {
      showToast('Enter attendee phone to locate', 'warning');
      return;
    }
    setShowRecoveryDetails(true);
    showToast('Wallet located for recovery protocol', 'success');
  }, [recoveryPhone, showToast]);

  // --- Recovery: populate test ---
  const populateRecovery = useCallback((name: string, phone: string, balance: number, walletId: string) => {
    setActiveRecoveryWallet({ name, phone, balance, walletId });
    setShowRecoveryDetails(true);
    setRecoveryPhone(phone);
  }, []);

  // --- Void ticket ---
  const openVoidModal = useCallback(() => {
    setShowVoidModal(true);
  }, []);

  const closeVoidModal = useCallback(() => {
    setShowVoidModal(false);
  }, []);

  const confirmAndExecuteReplacement = useCallback(async () => {
    setLoading(true);
    try {
      const cashierId = 'cashier-001';
      const data = await replaceLostTicket(activeRecoveryWallet.walletId, cashierId);
      const newWalletId = data.new_wallet_id || 'WLT-' + Math.floor(1000 + Math.random() * 9000) + '-NEW';
      const transferredBalance = data.transferred_balance || activeRecoveryWallet.balance;

      showToast('Old QR blacklisted, funds migrated to new ticket!', 'success');

      const device = await requestUSBDevice();
      setCurrentReceipt({
        jobType: 'TICKET REPLACEMENT',
        title: 'TICKET REPLACEMENT',
        attendeeName: activeRecoveryWallet.name,
        phone: activeRecoveryWallet.phone,
        walletId: newWalletId,
        status: 'REPLACED & ACTIVE',
        balanceLabel: 'TRANSFERRED BALANCE',
        balance: transferredBalance,
        barcode: `*${newWalletId}*`
      });
      setShowReceiptModal(true);

      if (device) {
        await printReplacementReceipt(
          activeRecoveryWallet.walletId,
          newWalletId,
          transferredBalance,
          activeRecoveryWallet.name,
          device
        );
      }

      setShowVoidModal(false);
      setShowRecoveryDetails(false);
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [activeRecoveryWallet, showToast]);

  const closeReceiptModal = useCallback(() => {
    setShowReceiptModal(false);
    setCurrentReceipt(null);
  }, []);

  // --- Highlight helpers ---
  const highlightRegButtons = (val: number) => {
    // Handled via inline state in JSX
  };
  const highlightTopupButtons = (val: number) => {
    // Handled via inline state in JSX
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased overflow-x-hidden pb-12">
      {/* TOP HEADER / CASHIER STATUS BAR */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-white">EventWallet Terminal</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/80">PWA ONLINE</span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">Gate #3 • Lane A • Shift #402</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2.5 py-1 bg-slate-800/80 border border-slate-700/60 rounded-lg text-xs font-mono text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>SYNCED</span>
            </div>
            <button
              onClick={() => showToast('Printer online — 58mm thermal ready', 'success')}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition relative"
              title="Thermal Printer Status"
            >
              <Printer className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </button>
          </div>
        </div>
      </header>

      {/* SUB-NAV / TAB SWITCHER */}
      <div className="max-w-md mx-auto px-3.5 pt-3 mb-4">
<div className="grid grid-cols-4 gap-1.5 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl">
           <button
             onClick={() => switchTab('register')}
             className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl font-medium text-xs transition-all duration-200 ${
               activeTab === 'register'
                 ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                 : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
             }`}
           >
             <User className="w-4 h-4 mb-1" />
             <span>1. Register</span>
           </button>
           <button
             onClick={() => switchTab('topup')}
             className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl font-medium text-xs transition-all duration-200 ${
               activeTab === 'topup'
                 ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                 : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
             }`}
           >
             <CircleDollarSign className="w-4 h-4 mb-1" />
             <span>2. Top-Up</span>
           </button>
           <button
             onClick={() => switchTab('history')}
             className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl font-medium text-xs transition-all duration-200 ${
               activeTab === 'history'
                 ? 'bg-blue-500 text-slate-950 shadow-md font-bold'
                 : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
             }`}
           >
             <Database className="w-4 h-4 mb-1" />
             <span>3. History</span>
           </button>
           <button
             onClick={() => switchTab('recovery')}
             className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl font-medium text-xs transition-all duration-200 ${
               activeTab === 'recovery'
                 ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                 : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
             }`}
           >
             <ShieldAlert className="w-4 h-4 mb-1" />
             <span>4. Lost Ticket</span>
           </button>
         </div>
       </div>

      {/* TAB 1: NEW VISITOR REGISTRATION */}
      {activeTab === 'register' && (
        <div className="max-w-md mx-auto px-3.5 space-y-4">
          <Card variant="glass">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Attendee Enrollment</span>
                  <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded font-mono">public.visitors</span>
                </h2>
                <p className="text-xs text-slate-400">Issue wristband/ticket &amp; generate cold wallet</p>
              </div>
              <span className="text-xs font-mono font-bold bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700">#NEW-REG</span>
            </div>

            <form onSubmit={handleRegistrationSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-medium transition"
                    placeholder="e.g. Alex Morgan"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Phone Number <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Phone className="w-4 h-4" />
                  </span>
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={e => setRegPhone(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-mono font-medium transition"
                    placeholder="+1 (555) 019-2831"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Email Address</label>
                  <span className="text-[10px] text-slate-500 italic">Optional e-receipt</span>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                    placeholder="alex.morgan@event.io"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Initial Wallet Balance</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-emerald-400">${regDepositAmount.toFixed(2)}</span>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-2.5">
                  {[10, 20, 50, 100].map(amount => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setRegAmount(amount)}
                      className={`py-3 rounded-xl text-sm font-mono font-bold transition active:scale-95 ${
                        regDepositAmount === amount
                          ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 shadow-sm'
                          : 'bg-slate-800/90 border border-slate-700 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      +${amount}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-400 font-mono font-bold text-base">$</span>
                  <input
                    type="number"
                    value={regDepositAmount || ''}
                    onChange={e => onCustomRegInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-24 py-3 text-base font-mono font-bold text-emerald-400 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setRegAmount(0)}
                    className="absolute right-2 top-2 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-400 hover:text-slate-200 border border-slate-700 transition"
                  >
                    $0 Free
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <div className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Payment Method</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setRegPaymentMethod('CASH')}
                    className={`py-3 rounded-xl text-sm font-mono font-bold transition active:scale-95 flex items-center justify-center gap-2 ${
                      regPaymentMethod === 'CASH'
                        ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 shadow-sm'
                        : 'bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <CircleDollarSign className="w-4 h-4" />
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegPaymentMethod('CARD')}
                    className={`py-3 rounded-xl text-sm font-mono font-bold transition active:scale-95 flex items-center justify-center gap-2 ${
                      regPaymentMethod === 'CARD'
                        ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-400 shadow-sm'
                        : 'bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                    Card
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 active:scale-[0.98] text-slate-950 font-black text-base rounded-2xl flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50"
                >
                  <PrinterIcon className="w-5 h-5 text-slate-950 stroke-[2.5]" />
                  <span>{loading ? 'Processing...' : 'Issue Ticket &amp; Print QR'}</span>
                </button>
                <div className="flex items-center justify-center gap-3 mt-2 text-[11px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1"><Database className="w-3 h-3 text-slate-500" /> public.visitors</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><Cpu className="w-3 h-3 text-slate-500" /> public.wallets</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3 h-3" /> ESC/POS Ready</span>
                </div>
              </div>
            </form>
          </Card>

          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3 text-xs text-slate-400">
            <div className="p-2 rounded-lg bg-slate-800 text-cyan-400 shrink-0"><Info className="w-4 h-4" /></div>
            <p className="leading-relaxed">Cash drawer unlocks upon printing. Ensure 58mm thermal paper is aligned before issuing wristband slip.</p>
          </div>
        </div>
      )}

      {/* TAB 2: QUICK CASH TOP-UP */}
      {activeTab === 'topup' && (
        <div className="max-w-md mx-auto px-3.5 space-y-4">
          <Card variant="glass">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Wallet Lookup</span>
                <span className="text-[10px] bg-amber-950 text-amber-400 border border-amber-800 px-1.5 py-0.5 rounded font-mono">Fast Top-Up</span>
              </h2>
              <span className="text-xs font-mono text-slate-400">Scan or Search</span>
            </div>

            <button
              onClick={triggerCameraScanner}
              className="w-full h-14 mb-3 bg-slate-800 hover:bg-slate-750 border-2 border-dashed border-amber-500/50 hover:border-amber-400 text-amber-300 font-bold rounded-xl flex items-center justify-center gap-2.5 transition active:scale-[0.98] shadow-inner"
            >
              <ScanQrCode className="w-5 h-5 text-amber-400 animate-pulse" />
              <span>Launch Camera QR Scanner</span>
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800" />
              <span className="flex-shrink mx-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Or Manual Search</span>
              <div className="flex-grow border-t border-slate-800" />
            </div>

<div className="mt-2 relative">
               <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                 <Search className="w-4 h-4" />
               </span>
               <input
                 type="text"
                 value={topupSearchQuery}
                 onChange={e => setTopupSearchQuery(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleTopupLookup()}
                 placeholder="Enter phone number..."
                 className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-20 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 font-medium"
               />
               <button
                 onClick={handleTopupLookup}
                 className="absolute right-2 top-2 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition"
               >
                 Lookup
               </button>
             </div>

             {topupVisitors.length > 0 && (
               <div className="mt-3 space-y-2">
                 <p className="text-xs font-bold text-slate-400 uppercase">Select a visitor:</p>
                 {topupVisitors.map((v, i) => (
                   <button
                     key={i}
                     onClick={() => selectVisitor(v)}
                     className="w-full p-3 bg-slate-800/80 border border-slate-700 rounded-xl text-left hover:border-amber-500 transition"
                   >
                     <div className="font-bold text-white text-sm">{v.full_name}</div>
                     <div className="text-xs font-mono text-slate-400">{v.phone}</div>
                   </button>
                 ))}
               </div>
             )}

             <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-slate-400 overflow-x-auto pb-1">
               <span className="shrink-0 text-slate-500">Try sample:</span>
               <button
                 onClick={() => { setActiveTopupWallet({ name: 'Jordan Lee', phone: '+1 (555) 782-9014', balance: 34.50, walletId: 'WLT-8921-QR' }); setHasWallet(true); }}
                 className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 hover:text-white font-mono shrink-0"
               >
                 Jordan ($34.50)
               </button>
               <button
                 onClick={() => { setActiveTopupWallet({ name: 'Elena Rostova', phone: '+1 (555) 441-2099', balance: 12.00, walletId: 'WLT-4412-QR' }); setHasWallet(true); }}
                 className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 hover:text-white font-mono shrink-0"
               >
                 Elena ($12.00)
               </button>
             </div>
           </Card>

           {hasWallet && (
            <div className="bg-gradient-to-b from-slate-900 to-slate-900/90 border-2 border-emerald-500/50 rounded-2xl p-4 shadow-xl relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> ACTIVE WALLET VERIFIED
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1">{activeTopupWallet.name}</h3>
                  <p className="text-xs font-mono text-slate-400">{activeTopupWallet.phone}</p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Current Balance</span>
                  <div className="text-2xl font-black font-mono text-emerald-400 tracking-tight">{formatCurrency(activeTopupWallet.balance)}</div>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">{activeTopupWallet.walletId}</span>
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-800">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center justify-between">
                  <span>Select Cash Deposit Amount</span>
                  <span className="text-emerald-400 font-mono text-xs">New Bal: {formatCurrency(activeTopupWallet.balance + topupAddAmount)}</span>
                </label>

                <div className="grid grid-cols-4 gap-2 mb-2.5">
                  {[10, 20, 50, 100].map(amount => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setTopupAmount(amount)}
                      className={`py-3 rounded-xl text-sm font-mono font-bold transition active:scale-95 ${
                        topupAddAmount === amount
                          ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-300 shadow-sm'
                          : 'bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-750'
                      }`}
                    >
                      +${amount}
                    </button>
                  ))}
                </div>

                <div className="relative mb-3.5">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-amber-400 font-mono font-bold text-base">+$</span>
                  <input
                    type="number"
                    value={topupAddAmount || ''}
                    onChange={e => onCustomTopupInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-11 pr-4 py-3 text-base font-mono font-bold text-amber-300 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                <button
                  onClick={executeTopUp}
                  disabled={loading}
                  className="w-full h-14 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-[0.98] text-slate-950 font-black text-base rounded-2xl flex items-center justify-center gap-2.5 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
                >
                  <PlusCircle className="w-5 h-5 text-slate-950 stroke-[2.5]" />
                  <span>{loading ? 'Processing...' : 'Top-Up Balance &amp; Print Slip'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TRANSACTION HISTORY */}
      {activeTab === 'history' && (
        <div className="max-w-md mx-auto px-3.5 space-y-4">
          <Card variant="glass">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Transaction History</span>
                  <span className="text-[10px] bg-blue-950 text-blue-400 border border-blue-800 px-1.5 py-0.5 rounded font-mono">Last 20</span>
                </h2>
                <p className="text-xs text-slate-400">Recent transactions. Void if needed.</p>
              </div>
              <button
                onClick={loadTransactions}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition border border-slate-700"
              >
                ↻ Refresh
              </button>
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500 text-sm">No transactions found</p>
                <button
                  onClick={loadTransactions}
                  className="mt-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/30 hover:bg-emerald-500/30 transition"
                >
                  Load Transactions
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {transactions.map(tx => (
                  <div
                    key={tx.id}
                    className={`p-3 rounded-xl border ${
                      tx.status === 'VOIDED'
                        ? 'bg-slate-800/50 border-slate-700/50 opacity-60'
                        : 'bg-slate-800/80 border-emerald-500/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{tx.visitor_name || 'Unknown'}</span>
                          {tx.status === 'VOIDED' && (
                            <span className="text-[9px] bg-rose-950 text-rose-400 px-1.5 py-0.5 rounded font-mono font-bold">VOIDED</span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-slate-400">{tx.visitor_phone}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-white text-sm">{formatCurrency(tx.amount)}</div>
                        <div className="text-[10px] font-mono text-slate-500">{tx.type} • {tx.id?.slice(0,8)}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
                      <span className="text-[10px] font-mono text-slate-500">{tx.created_at ? new Date(tx.created_at).toLocaleString() : ''}</span>
                      {tx.status !== 'VOIDED' && (
                        <button
                          onClick={() => handleVoidClick(tx.id)}
                          className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-[10px] font-bold border border-rose-500/30 transition"
                        >
                          Void
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 4: LOST TICKET RECOVERY */}
      {activeTab === 'recovery' && (
        <div className="max-w-md mx-auto px-3.5 space-y-4">
          <Card variant="glass">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>Lost Ticket Recovery</span>
                </h2>
                <p className="text-xs text-slate-400">Security protocol: Void compromised QR &amp; migrate funds</p>
              </div>
              <span className="text-xs font-mono font-bold bg-rose-950 text-rose-400 border border-rose-800 px-2 py-0.5 rounded">VOID/REPLACE</span>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Search Registered Visitor by Phone Number
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Phone className="w-4 h-4" />
                </span>
                <input
                  type="tel"
                  value={recoveryPhone}
                  onChange={e => setRecoveryPhone(e.target.value)}
                  placeholder="Enter attendee phone (e.g. 555-8912)..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-24 py-3 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                />
                <button
                  onClick={searchLostTicket}
                  className="absolute right-2 top-2 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-bold transition"
                >
                  Locate
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 overflow-x-auto text-[11px] text-slate-400 pb-1">
              <span className="text-slate-500 shrink-0">Test cases:</span>
              <button
                onClick={() => populateRecovery('Marcus Vance', '+1 (555) 612-4019', 87.50, 'WLT-6124-LOST')}
                className="px-2 py-1 rounded bg-slate-800 border border-slate-700 hover:text-white font-mono shrink-0"
              >
                Marcus ($87.50)
              </button>
              <button
                onClick={() => populateRecovery('Samantha Chen', '+1 (555) 902-1188', 42.00, 'WLT-9021-LOST')}
                className="px-2 py-1 rounded bg-slate-800 border border-slate-700 hover:text-white font-mono shrink-0"
              >
                Samantha ($42.00)
              </button>
            </div>
          </Card>

          {showRecoveryDetails && (
            <div className="bg-slate-900/90 border border-rose-900/60 rounded-2xl p-4 shadow-2xl relative">
              <div className="flex items-start justify-between pb-3 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-rose-400 font-semibold mb-1">
                    <ShieldAlert className="w-4 h-4" />
                    <span>COMPROMISED / LOST TICKET REPORTED</span>
                  </div>
                  <h3 className="text-base font-bold text-white">{activeRecoveryWallet.name}</h3>
                  <p className="text-xs font-mono text-slate-400">{activeRecoveryWallet.phone}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Remaining Balance</span>
                  <div className="text-2xl font-black font-mono text-emerald-400">{formatCurrency(activeRecoveryWallet.balance)}</div>
                  <span className="text-[10px] font-mono text-rose-400/90 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-900">OLD: {activeRecoveryWallet.walletId}</span>
                </div>
              </div>

              <div className="my-3 p-3 bg-rose-950/30 border border-rose-800/60 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Irreversible Action Notice</span>
                </div>
                <p className="text-rose-200/80 leading-relaxed text-[11px]">
                  Executing <code className="font-mono bg-rose-950 px-1 py-0.5 rounded text-rose-300">replace_lost_ticket</code>. The old physical QR code is blacklisted immediately. All <strong>{formatCurrency(activeRecoveryWallet.balance)}</strong> will be securely migrated to a freshly generated wallet and printed.
                </p>
              </div>

              <button
                onClick={openVoidModal}
                className="w-full h-14 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-[0.98] text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2.5 shadow-lg shadow-rose-600/30 transition-all"
              >
                <Ban className="w-5 h-5 text-white stroke-[2.5]" />
                <span>Void Lost Ticket &amp; Re-issue</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL: CAMERA QR SCANNER */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-[6px]" onClick={closeScannerModal}>
          <div className="bg-slate-900 border border-slate-700 max-w-sm w-full rounded-2xl p-5 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400"><Camera className="w-5 h-5" /></div>
                <div>
                  <h3 className="font-bold text-sm text-white">Live Camera Scanner</h3>
                  <p className="text-[11px] text-slate-400">Align ticket QR inside viewfinder</p>
                </div>
              </div>
              <button onClick={closeScannerModal} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"><X className="w-4 h-4" /></button>
            </div>

            {/* Viewfinder */}
            <div className="relative w-full h-56 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:16px_16px] opacity-20" />
              <div className="relative w-40 h-40 border-2 border-amber-400/80 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.25)]">
                <span className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-amber-300" />
                <span className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-amber-300" />
                <span className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-amber-300" />
                <span className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-amber-300" />
                <div className="absolute left-1 right-1 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-pulse shadow-[0_0_8px_#f59e0b]" style={{ top: '50%', animation: 'scanline 2.2s ease-in-out infinite alternate' }} />
                <div className="w-28 h-28 bg-white p-1 rounded flex items-center justify-center opacity-85">
                  <svg className="w-full h-full text-slate-950" viewBox="0 0 100 100" fill="currentColor">
                    <rect x="5" y="5" width="30" height="30" fill="currentColor" />
                    <rect x="10" y="10" width="20" height="20" fill="white" />
                    <rect x="15" y="15" width="10" height="10" fill="currentColor" />
                    <rect x="65" y="5" width="30" height="30" fill="currentColor" />
                    <rect x="70" y="10" width="20" height="20" fill="white" />
                    <rect x="75" y="15" width="10" height="10" fill="currentColor" />
                    <rect x="5" y="65" width="30" height="30" fill="currentColor" />
                    <rect x="10" y="70" width="20" height="20" fill="white" />
                    <rect x="15" y="75" width="10" height="10" fill="currentColor" />
                    <rect x="42" y="15" width="8" height="8" fill="currentColor" />
                    <rect x="42" y="42" width="16" height="16" fill="currentColor" />
                    <rect x="65" y="45" width="10" height="10" fill="currentColor" />
                    <rect x="45" y="70" width="12" height="12" fill="currentColor" />
                    <rect x="75" y="75" width="15" height="15" fill="currentColor" />
                  </svg>
                </div>
              </div>
            </div>

            <button
              onClick={simulateScanDetected}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition active:scale-95 shadow-md"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Simulate Barcode/QR Detected</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL: THERMAL RECEIPT */}
      {showReceiptModal && currentReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-[6px]" onClick={closeReceiptModal}>
          <div className="max-w-sm w-full animate-[printEject_0.45s_cubic-bezier(0.16,1,0.3,1)_forwards] space-y-3" onClick={e => e.stopPropagation()}>
            {/* Receipt Header */}
            <div className="flex items-center justify-between bg-slate-900 border border-slate-700 px-3.5 py-2.5 rounded-xl shadow-lg">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">Thermal Print Job #{Math.floor(1000 + Math.random() * 9000)}</span>
              </div>
              <button onClick={closeReceiptModal} className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"><X className="w-4 h-4" /></button>
            </div>

            {/* 58mm Thermal Paper */}
            <div className="bg-white text-slate-950 font-mono text-xs rounded-t-lg shadow-2xl p-5 relative overflow-hidden border-t-8 border-emerald-500">
              <div className="text-center pb-3 border-b-2 border-dashed border-slate-300">
                <h2 className="text-base font-black tracking-tighter uppercase font-sans">SOLSTICE MUSIC FEST</h2>
                <p className="text-[10px] text-slate-600">OFFICIAL CASHLESS FIELD TERMINAL</p>
                <p className="text-[10px] text-slate-500">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date().toLocaleTimeString()} PST</p>
              </div>

              <div className="py-2 text-center border-b border-slate-200 bg-slate-50 my-2 rounded">
                <span className="font-black text-xs uppercase tracking-widest text-slate-800">{currentReceipt.title}</span>
              </div>

              <div className="space-y-1.5 py-1 text-slate-700">
                <div className="flex justify-between"><span className="text-slate-500">ATTENDEE:</span><span className="font-bold text-slate-950">{currentReceipt.attendeeName}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">PHONE:</span><span className="font-bold text-slate-950 font-mono">{currentReceipt.phone}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">WALLET ID:</span><span className="font-bold text-slate-950 font-mono">{currentReceipt.walletId}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">STATUS:</span><span className="font-bold text-emerald-700 font-mono">{currentReceipt.status}</span></div>
              </div>

              <div className="my-3 p-3 bg-slate-100 rounded-lg text-center border border-slate-300">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{currentReceipt.balanceLabel}</div>
                <div className="text-3xl font-black tracking-tight text-slate-950 my-0.5">{formatCurrency(currentReceipt.balance)}</div>
                <div className="text-[9px] text-slate-500 font-sans">Closed-loop ledger: Food, Drinks &amp; Merch</div>
              </div>

              <div className="flex flex-col items-center justify-center my-3 pt-1">
                <div className="p-2 border-2 border-slate-900 bg-white rounded-lg shadow-sm">
                  <svg className="w-32 h-32 text-slate-950" viewBox="0 0 100 100" fill="currentColor">
                    <rect x="0" y="0" width="30" height="30" fill="black" />
                    <rect x="5" y="5" width="20" height="20" fill="white" />
                    <rect x="10" y="10" width="10" height="10" fill="black" />
                    <rect x="70" y="0" width="30" height="30" fill="black" />
                    <rect x="75" y="5" width="20" height="20" fill="white" />
                    <rect x="80" y="10" width="10" height="10" fill="black" />
                    <rect x="0" y="70" width="30" height="30" fill="black" />
                    <rect x="5" y="75" width="20" height="20" fill="white" />
                    <rect x="10" y="80" width="10" height="10" fill="black" />
                    <rect x="36" y="8" width="6" height="6" fill="black" />
                    <rect x="48" y="8" width="8" height="8" fill="black" />
                    <rect x="36" y="24" width="8" height="6" fill="black" />
                    <rect x="50" y="22" width="6" height="8" fill="black" />
                    <rect x="8" y="38" width="8" height="8" fill="black" />
                    <rect x="22" y="42" width="8" height="6" fill="black" />
                    <rect x="38" y="38" width="24" height="24" fill="black" />
                    <rect x="42" y="42" width="16" height="16" fill="white" />
                    <rect x="46" y="46" width="8" height="8" fill="black" />
                    <rect x="72" y="38" width="8" height="6" fill="black" />
                    <rect x="86" y="44" width="8" height="8" fill="black" />
                    <rect x="8" y="54" width="8" height="6" fill="black" />
                    <rect x="24" y="54" width="6" height="6" fill="black" />
                    <rect x="68" y="54" width="8" height="6" fill="black" />
                    <rect x="84" y="58" width="10" height="6" fill="black" />
                    <rect x="38" y="72" width="8" height="8" fill="black" />
                    <rect x="52" y="68" width="8" height="8" fill="black" />
                    <rect x="42" y="86" width="10" height="8" fill="black" />
                    <rect x="68" y="72" width="12" height="6" fill="black" />
                    <rect x="86" y="78" width="8" height="14" fill="black" />
                    <rect x="70" y="86" width="10" height="6" fill="black" />
                  </svg>
                </div>
                <span className="text-[10px] font-bold text-slate-800 mt-1 font-mono tracking-wider">*{currentReceipt.walletId}*</span>
              </div>

              <div className="text-center pt-2 border-t-2 border-dashed border-slate-300 text-[10px] text-slate-500 space-y-0.5">
                <p className="font-bold text-slate-800">KEEP SLIP DRY &amp; SECURE</p>
                <p>Scan this QR at any bar, food truck or merchandise tent.</p>
                <p className="font-mono text-[9px] pt-1">Cashier: Jane Doe #104 • Terminal T-04</p>
              </div>
            </div>

            <div className="h-4 bg-[linear-gradient(135deg,_#f8fafc_8px,transparent_0),linear-gradient(-135deg,_#f8fafc_8px,transparent_0)] bg-[position:left_bottom] bg-repeat-x bg-[size:16px_16px] w-full filter drop-shadow" />

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { closeReceiptModal(); showToast('Ticket printed! Ready for next customer.', 'success'); }} className="py-3 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-1.5 transition text-xs shadow-lg">
                <PrinterIcon className="w-4 h-4" />
                <span>Cut &amp; Next Customer</span>
              </button>
              <button onClick={closeReceiptModal} className="py-3 px-4 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-semibold rounded-xl flex items-center justify-center gap-1.5 transition text-xs border border-slate-700">
                <Check className="w-4 h-4" />
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM VOID LOST TICKET */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-[6px]" onClick={closeVoidModal}>
          <div className="bg-slate-900 border-2 border-rose-600/80 max-w-sm w-full rounded-2xl p-5 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 mx-auto">
              <ShieldAlert className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-white">Confirm Ticket Invalidation?</h3>
              <p className="text-xs text-slate-400">You are executing <span className="font-mono text-rose-400 font-bold">replace_lost_ticket</span></p>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1 font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Attendee:</span>
                <span className="text-white font-bold">{activeRecoveryWallet.name}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Phone:</span>
                <span className="text-white">{activeRecoveryWallet.phone}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Carried Balance:</span>
                <span className="text-emerald-400 font-bold">{formatCurrency(activeRecoveryWallet.balance)}</span>
              </div>
              <div className="flex justify-between text-rose-400 pt-1 border-t border-slate-800">
                <span>Action:</span>
                <span className="font-bold">BLACKLIST OLD QR</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={closeVoidModal} className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition border border-slate-700">Cancel</button>
              <button
                onClick={confirmAndExecuteReplacement}
                disabled={loading}
                className="py-3 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{loading ? 'Processing...' : 'Authorize &amp; Print'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM TRANSACTION VOID */}
      {showTransactionVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-[6px]" onClick={() => setShowTransactionVoidModal(false)}>
          <div className="bg-slate-900 border-2 border-rose-600/80 max-w-sm w-full rounded-2xl p-5 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 mx-auto">
              <Ban className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-white">Confirm Transaction Void?</h3>
              <p className="text-xs text-slate-400">This marks the transaction as VOIDED</p>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1 font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Transaction ID:</span>
                <span className="text-white font-bold">{voidingTxId?.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between text-rose-400 pt-1 border-t border-slate-800">
                <span>Effect:</span>
                <span className="font-bold">QR Blocked from Withdrawal</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => { setShowTransactionVoidModal(false); setVoidingTxId(null); }} className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition border border-slate-700">Cancel</button>
              <button
                onClick={confirmVoid}
                disabled={loading}
                className="py-3 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{loading ? 'Processing...' : 'Confirm Void'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 ${
          toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <div className={`bg-slate-800/95 border backdrop-blur text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-medium ${
          toast?.type === 'success' ? 'border-emerald-500/40' : toast?.type === 'warning' ? 'border-amber-500/40' : 'border-rose-500/40'
        }`}>
          {toast?.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          {toast?.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
          {toast?.type === 'danger' && <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />}
          <span>{toast?.message}</span>
        </div>
      </div>
    </div>
  );
}

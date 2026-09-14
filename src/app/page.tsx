'use client';

import { useState } from 'react';
import { CashierStation, VendorPOS, AdminDashboard } from '@/modules';
import { cn } from '@/lib/utils';

export default function Home() {
  const [activeModule, setActiveModule] = useState<'cashier' | 'vendor' | 'admin'>('cashier');

  const modules = [
    { id: 'cashier' as const, label: 'Cashier Station', icon: '💰', desc: 'Register visitors, top-ups, ticket replacement' },
    { id: 'vendor' as const, label: 'Vendor POS', icon: '📷', desc: 'QR scan, balance check, instant deduction' },
    { id: 'admin' as const, label: 'Admin Dashboard', icon: '📊', desc: 'Analytics, settlements, live activity' },
  ];

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Module Switcher */}
      <div className="fixed top-16 left-0 right-0 z-30 bg-dark-900/90 backdrop-blur-xl border-b border-dark-700/50">
        <div className="max-w-7xl mx-auto px-4 py-2 flex gap-2">
          {modules.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveModule(m.id)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeModule === m.id
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                  : 'bg-dark-800 text-dark-400 hover:text-dark-200'
              )}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-24">
        {activeModule === 'cashier' && <CashierStation />}
        {activeModule === 'vendor' && <VendorPOS />}
        {activeModule === 'admin' && <AdminDashboard />}
      </div>
    </div>
  );
}

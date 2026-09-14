"use client";

import { useState, useEffect } from 'react';
import { useDailySettlement, useVendorRevenue } from '@/hooks/useDatabase';
import { generateCSVSettlement } from '@/lib/db';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import Spinner from '@/components/ui/spinner';
import { formatCurrency } from '@/lib/utils';

export default function AdminDashboard() {
  const { data: revenueData, loading: revenueLoading } = useVendorRevenue();
  const { data: settlementData, loading: settlementLoading } = useDailySettlement();
  const [activeTab, setActiveTab] = useState<'overview' | 'settlement' | 'activity'>('overview');

  // Stats
  const totalRevenue = settlementData?.reduce((sum: number, r: any) => sum + (Number(r.gross_revenue) || 0), 0) || 0;
  const totalTransactions = settlementData?.reduce((sum: number, r: any) => sum + (r.total_transactions || 0), 0) || 0;
  const totalCommissions = settlementData?.reduce((sum: number, r: any) => sum + (Number(r.commission_amount) || 0), 0) || 0;

  const handleExportCSV = () => {
    if (settlementData) {
      generateCSVSettlement(settlementData);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Tabs */}
      <div className="flex gap-2">
        {(['overview', 'settlement', 'activity'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-lg font-medium text-sm capitalize transition-all ${
              activeTab === tab
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                : 'bg-dark-800 text-dark-400 hover:text-dark-200'
            }`}
          >
            {tab === 'overview' ? '📊 Overview' : tab === 'settlement' ? '📋 Settlements' : '📡 Live Activity'}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <p className="stat-label">Gross Revenue</p>
              <p className="stat-value text-green-400">{formatCurrency(totalRevenue)}</p>
            </Card>
            <Card>
              <p className="stat-label">Total Transactions</p>
              <p className="stat-value">{totalTransactions.toLocaleString()}</p>
            </Card>
            <Card>
              <p className="stat-label">Total Commissions</p>
              <p className="stat-value text-yellow-400">{formatCurrency(totalCommissions)}</p>
            </Card>
            <Card>
              <p className="stat-label">Active Vendors</p>
              <p className="stat-value">{revenueData?.length || 0}</p>
            </Card>
          </div>

          {/* Vendor Breakdown */}
          <Card>
            <h3 className="text-lg font-bold text-white mb-4">Vendor Breakdown</h3>
            {revenueLoading ? (
              <Spinner />
            ) : (
              <div className="space-y-3">
                {revenueData?.map((vendor: any) => (
                  <div key={vendor.vendor_id} className="flex items-center justify-between p-4 bg-dark-900 rounded-lg">
                    <div>
                      <p className="text-white font-medium">{vendor.vendor_name}</p>
                      <p className="text-dark-400 text-sm">Commission: {vendor.commission_rate}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-green-400 font-medium">{formatCurrency(Number(vendor.gross_revenue))}</p>
                      <p className="text-dark-400 text-xs">{vendor.total_transactions} txns</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Settlement Tab */}
      {activeTab === 'settlement' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">End-of-Day Commission Settlements</h3>
            <Button variant="accent" onClick={handleExportCSV}>
              📥 Export CSV
            </Button>
          </div>
          {settlementLoading ? (
            <Spinner />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-600">
                    {['Date', 'Vendor', 'Txns', 'Gross Rev', 'Commission', 'Net to Vendor'].map((h) => (
                      <th key={h} className="text-left text-dark-400 text-xs font-medium px-4 py-3 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {settlementData?.map((row: any, i: number) => (
                    <tr key={i} className="border-b border-dark-700/50 hover:bg-dark-800/50">
                      <td className="px-4 py-3 text-dark-300 text-sm">{row.settlement_date}</td>
                      <td className="px-4 py-3 text-white text-sm">{row.vendor_name}</td>
                      <td className="px-4 py-3 text-dark-300 text-sm">{row.total_transactions}</td>
                      <td className="px-4 py-3 text-green-400 text-sm">{formatCurrency(Number(row.gross_revenue))}</td>
                      <td className="px-4 py-3 text-yellow-400 text-sm">{formatCurrency(Number(row.commission_amount))}</td>
                      <td className="px-4 py-3 text-dark-200 text-sm">{formatCurrency(Number(row.net_to_vendor))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <Card>
          <h3 className="text-lg font-bold text-white mb-4">Live Activity Feed</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {[
              { id: '1', type: 'SPEND', amount: 15.50, wallet_id: '...', created_at: new Date().toISOString() },
              { id: '2', type: 'TOPUP', amount: 50.00, wallet_id: '...', created_at: new Date().toISOString() },
            ].map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-dark-900 rounded-lg animate-slide-in">
                <div className="flex items-center gap-3">
                  <Badge variant={item.type === 'SPEND' ? 'danger' : item.type === 'TOPUP' ? 'success' : 'info'}>
                    {item.type}
                  </Badge>
                  <span className="text-dark-300 text-sm">{item.wallet_id?.substring(0, 12)}...</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={item.type === 'SPEND' ? 'text-red-400' : 'text-green-400'}>
                    {item.type === 'SPEND' ? '-' : '+'}{formatCurrency(item.amount)}
                  </span>
                  <span className="text-dark-500 text-xs">{new Date(item.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

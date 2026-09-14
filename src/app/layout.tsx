import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VaultPass - Event Payment & Wallet PWA',
  description: 'Closed-Loop Event Payment & Wallet Platform',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}

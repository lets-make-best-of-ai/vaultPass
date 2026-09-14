"use client";

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { cn } from '@/lib/utils';

interface QRScannerProps {
  onScan: (data: string) => void;
  onScanError?: (error: string) => void;
}

export default function QRScanner({ onScan, onScanError }: QRScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  const startScanning = async () => {
    if (!readerRef.current) return;
    try {
      const html5Qrcode = new Html5Qrcode('reader');
      html5QrcodeRef.current = html5Qrcode;
      await html5Qrcode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          onScan(decodedText);
          setScanning(false);
          html5Qrcode.stop().catch(() => {});
        },
        () => {}
      );
      setScanning(true);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      onScanError?.(err.message);
    }
  };

  const stopScanning = async () => {
    if (html5QrcodeRef.current) {
      await html5QrcodeRef.current.stop().catch(() => {});
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div ref={readerRef} id="reader" className="w-full rounded-lg overflow-hidden bg-dark-900" />
      <div className="flex gap-2">
        {!scanning ? (
          <button onClick={startScanning} className="btn-primary flex-1">
            📷 Start Scan
          </button>
        ) : (
          <button onClick={stopScanning} className="btn-secondary flex-1">
            ⏹ Stop
          </button>
        )}
      </div>
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
    </div>
  );
}

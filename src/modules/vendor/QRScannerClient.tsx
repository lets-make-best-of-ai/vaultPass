"use client";

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import Button from '@/components/ui/button';

interface QRScannerClientProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
  onClose: () => void;
}

export default function QRScannerClient({ onScan, onError, onClose }: QRScannerClientProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const startScanning = async () => {
    if (!readerRef.current || !mounted) return;
    try {
      const html5Qrcode = new Html5Qrcode('qr-reader');
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
      onError?.(err.message);
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

  if (!mounted) {
    return <div id="qr-reader" className="w-full rounded-lg overflow-hidden bg-dark-900" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Scan QR Code</h3>
        <Button variant="ghost" size="sm" onClick={() => { stopScanning(); onClose(); }}>
          Back
        </Button>
      </div>

      <div ref={readerRef} id="qr-reader" className="w-full rounded-lg overflow-hidden bg-dark-900" />

      <div className="flex gap-2">
        {!scanning ? (
          <Button onClick={startScanning} variant="accent" className="w-full" size="lg">
            📷 Start Scan
          </Button>
        ) : (
          <Button onClick={stopScanning} variant="secondary" className="w-full" size="lg">
            ⏹ Stop
          </Button>
        )}
      </div>
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
    </div>
  );
}
"use client";

import { cn } from '@/lib/utils';
import * as React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({
  className,
  label,
  error,
  ...props
}: InputProps) {
  return (
    <div className="w-full">
      {label && <label className="label-text">{label}</label>}
      <input
        className={cn(
          'input-field w-full',
          error && 'border-red-500 focus:ring-red-500/50 focus:border-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

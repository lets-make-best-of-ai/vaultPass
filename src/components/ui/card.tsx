"use client";

import { cn } from '@/lib/utils';
import * as React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'hover' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export default function Card({
  className,
  variant = 'default',
  padding = 'md',
  children,
  ...props
}: CardProps) {
  const variants = {
    default: 'bg-dark-800/60 border border-dark-700/50 rounded-xl',
    hover: 'bg-dark-800/60 border border-dark-700/50 rounded-xl hover:border-primary-500/30 hover:shadow-primary-500/5 transition-all duration-300',
    glass: 'bg-dark-800/40 backdrop-blur-xl border border-dark-700/30 rounded-xl',
  };

  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-8',
  };

  return (
    <div className={cn(variants[variant], paddings[padding], className)} {...props}>
      {children}
    </div>
  );
}

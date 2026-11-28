'use client';

import React from 'react';
import { DataStatus } from '@/lib/types';

interface StatusBarProps {
  status: DataStatus;
  provider: string;
  delay?: string;
  lastUpdated?: number;
  error?: string;
}

export default function StatusBar({ status, provider, delay, lastUpdated, error }: StatusBarProps) {
  const statusConfig: Record<DataStatus, { dot: string; label: string; labelColor: string; bg: string }> = {
    live: { dot: 'bg-emerald-400 animate-pulse', label: 'LIVE', labelColor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    delayed: { dot: 'bg-amber-400 animate-pulse', label: 'DELAYED', labelColor: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    demo: { dot: 'bg-purple-400', label: 'DEMO', labelColor: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    loading: { dot: 'bg-blue-400 animate-pulse', label: 'LOADING', labelColor: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    error: { dot: 'bg-red-400', label: 'ERROR', labelColor: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    unavailable: { dot: 'bg-slate-400', label: 'UNAVAILABLE', labelColor: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
  };

  const config = statusConfig[status];

  return (
    <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border text-xs ${config.bg}`}>
      {/* Status indicator */}
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
        <span className={`font-bold tracking-wider ${config.labelColor}`}>{config.label}</span>
      </div>

      {/* Provider */}
      <span className="text-slate-500">|</span>
      <span className="text-slate-400">{provider}</span>

      {/* Delay info */}
      {delay && (
        <>
          <span className="text-slate-500">|</span>
          <span className="text-slate-500">{delay}</span>
        </>
      )}

      {/* Last updated */}
      {lastUpdated && (
        <>
          <span className="text-slate-500">|</span>
          <span className="text-slate-500">
            Updated {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        </>
      )}

      {/* Error message */}
      {error && status === 'error' && (
        <>
          <span className="text-slate-500">|</span>
          <span className="text-red-400 truncate max-w-xs" title={error}>{error}</span>
        </>
      )}

      {/* Demo warning */}
      {status === 'demo' && (
        <>
          <span className="text-slate-500">|</span>
          <span className="text-purple-400/80">
            Synthetic data — not real prices. Set API key for live data.
          </span>
        </>
      )}
    </div>
  );
}

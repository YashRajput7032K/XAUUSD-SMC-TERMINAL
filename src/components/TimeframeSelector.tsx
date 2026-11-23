'use client';

import React from 'react';
import { Timeframe, TIMEFRAMES, TIMEFRAME_LABELS } from '@/lib/types';

interface TimeframeSelectorProps {
  selected: Timeframe;
  onSelect: (tf: Timeframe) => void;
}

export default function TimeframeSelector({ selected, onSelect }: TimeframeSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-1 border border-slate-700" role="radiogroup" aria-label="Timeframe selection">
      {TIMEFRAMES.map(tf => (
        <button
          key={tf}
          onClick={() => onSelect(tf)}
          role="radio"
          aria-checked={selected === tf}
          aria-label={TIMEFRAME_LABELS[tf]}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 interactive-control ${
            selected === tf
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50 border border-transparent'
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  );
}

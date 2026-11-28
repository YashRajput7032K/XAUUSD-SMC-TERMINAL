'use client';

import React from 'react';
import { SMC_CONCEPTS, SMCConceptId, DetectedZone } from '@/lib/types';

interface ChartLegendProps {
  activeConcepts: SMCConceptId[];
  zones: DetectedZone[];
  timeframe: string;
}

export default function ChartLegend({ activeConcepts, zones, timeframe }: ChartLegendProps) {
  if (activeConcepts.length === 0) return null;

  return (
    <div className="absolute top-2 right-2 z-10 bg-slate-900/90 backdrop-blur-sm rounded-lg border border-slate-700 p-2 max-w-xs">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        <span>◈</span> Active Concepts
        <span className="text-slate-600">({timeframe})</span>
      </div>
      <div className="space-y-1">
        {activeConcepts.map(id => {
          const concept = SMC_CONCEPTS.find(c => c.id === id);
          if (!concept) return null;
          const count = zones.filter(z => z.conceptId === id).length;

          return (
            <div key={id} className="flex items-center gap-2 text-xs">
              <span
                className="w-3 h-0.5 rounded-full"
                style={{ backgroundColor: concept.color }}
              />
              <span className="text-slate-300">{concept.shortName}</span>
              {count > 0 && (
                <span className="text-slate-500 font-mono">({count})</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

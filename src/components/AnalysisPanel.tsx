'use client';

import React from 'react';
import {
  AnalysisResult,
  SignalQuality,
  TradeScenario,
  SMC_CONCEPTS,
} from '@/lib/types';

interface AnalysisPanelProps {
  analysis: AnalysisResult | null;
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
}

function SignalBadge({ quality }: { quality: SignalQuality }) {
  const config: Record<SignalQuality, { bg: string; text: string; label: string; dot: string }> = {
    strong: { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-400', label: 'Strong Signal', dot: 'bg-emerald-400' },
    moderate: { bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-400', label: 'Moderate Signal', dot: 'bg-amber-400' },
    weak: { bg: 'bg-orange-500/15 border-orange-500/30', text: 'text-orange-400', label: 'Weak Signal', dot: 'bg-orange-400' },
    none: { bg: 'bg-slate-500/15 border-slate-500/30', text: 'text-slate-400', label: 'No Signal', dot: 'bg-slate-400' },
  };
  const c = config[quality];

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${c.bg} ${c.text}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot} animate-pulse`} />
      {c.label}
    </span>
  );
}

function ScenarioCard({ scenario, index }: { scenario: TradeScenario; index: number }) {
  const isBuy = scenario.direction === 'buy';

  return (
    <div className={`rounded-lg border p-4 ${
      isBuy
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-red-500/30 bg-red-500/5'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
            {isBuy ? '▲ BUY' : '▼ SELL'}
          </span>
          <span className="text-xs text-slate-500">Scenario {index + 1}</span>
        </div>
        <SignalBadge quality={scenario.confidence} />
      </div>

      {/* Levels */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-800/60 rounded p-2.5">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Entry</div>
          <div className="text-sm font-mono font-bold text-white">${scenario.entry.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800/60 rounded p-2.5">
          <div className="text-xs text-slate-500 uppercase tracking-wider">R:R</div>
          <div className={`text-sm font-mono font-bold ${
            scenario.riskReward >= 2 ? 'text-emerald-400' : 'text-amber-400'
          }`}>
            1:{scenario.riskReward.toFixed(1)}
          </div>
        </div>
        <div className="bg-slate-800/60 rounded p-2.5">
          <div className="text-xs text-red-400/70 uppercase tracking-wider">Stop Loss</div>
          <div className="text-sm font-mono font-bold text-red-400">${scenario.stopLoss.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800/60 rounded p-2.5">
          <div className="text-xs text-emerald-400/70 uppercase tracking-wider">Take Profit</div>
          <div className="text-sm font-mono font-bold text-emerald-400">${scenario.takeProfit.toFixed(2)}</div>
        </div>
      </div>

      {/* Reasoning */}
      <div className="text-xs text-slate-300 leading-relaxed mb-2">{scenario.reasoning}</div>

      {/* Concepts used */}
      <div className="flex flex-wrap gap-1.5">
        {scenario.concepts.map((c, i) => (
          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400 border border-slate-600/50">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AnalysisPanel({ analysis, isOpen, onClose, isLoading }: AnalysisPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-slate-900/98 backdrop-blur-sm border-l border-slate-700 z-40 flex flex-col overflow-hidden shadow-2xl animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-amber-400">⊕</span> Analysis
          </h2>
          <p className="text-xs text-slate-400">SMC Trade Planner</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors interactive-control"
          aria-label="Close analysis panel"
        >
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
            <span className="text-sm">Analyzing chart data...</span>
          </div>
        )}

        {!isLoading && !analysis && (
          <div className="text-center py-16 text-slate-500">
            <div className="text-4xl mb-4">📊</div>
            <p className="text-sm">Click &ldquo;Analyze&rdquo; to run SMC analysis on the current chart data.</p>
          </div>
        )}

        {!isLoading && analysis && (
          <>
            {/* Instrument & Timeframe */}
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{analysis.instrument}</div>
                  <div className="text-xs text-slate-400">Timeframe: {analysis.timeframe}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-amber-400">
                    ${analysis.currentPrice.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(analysis.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Market Structure */}
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Market Structure</div>
              <div className={`text-sm font-semibold ${
                analysis.marketStructure.includes('Bullish') ? 'text-emerald-400' :
                analysis.marketStructure.includes('Bearish') ? 'text-red-400' : 'text-slate-300'
              }`}>
                {analysis.marketStructure}
              </div>
            </div>

            {/* Overall Signal */}
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-slate-500 uppercase tracking-wider">Signal Quality</div>
                <SignalBadge quality={analysis.overallSignal} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{analysis.signalExplanation}</p>
            </div>

            {/* Detected Concepts */}
            {analysis.detectedConcepts.length > 0 && (
              <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Detected Concepts</div>
                <div className="space-y-1.5">
                  {analysis.detectedConcepts.map((dc, i) => {
                    const concept = SMC_CONCEPTS.find(c => c.id === dc.conceptId);
                    return (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-300">
                          {concept?.icon} {concept?.name}
                        </span>
                        <span className="font-mono px-1.5 py-0.5 rounded bg-slate-700" style={{ color: concept?.color }}>
                          {dc.count} found
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Trade Scenarios */}
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                Trade Scenarios
              </div>
              {analysis.scenarios.length === 0 ? (
                <div className="bg-slate-800/40 rounded-lg p-4 text-center border border-slate-700">
                  <div className="text-slate-500 text-sm">
                    No valid trade setups detected.
                  </div>
                  <div className="text-slate-600 text-xs mt-1">
                    Try a different timeframe or enable more concepts.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {analysis.scenarios.map((scenario, idx) => (
                    <ScenarioCard key={idx} scenario={scenario} index={idx} />
                  ))}
                </div>
              )}
            </div>

            {/* Assumptions */}
            <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Assumptions</div>
              <ul className="space-y-1">
                {analysis.assumptions.map((a, i) => (
                  <li key={i} className="text-xs text-slate-400 flex gap-2">
                    <span className="text-slate-600 mt-0.5">•</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>

            {/* Disclaimer */}
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-amber-400 text-sm mt-0.5">⚠</span>
                <p className="text-xs text-amber-200/70 leading-relaxed">{analysis.disclaimer}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

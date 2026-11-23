'use client';

import React, { useState, useMemo } from 'react';
import { SMC_CONCEPTS, SMCConceptId, DetectedZone, SMC_GLOSSARY } from '@/lib/types';

interface ConceptSidebarProps {
  activeConcepts: SMCConceptId[];
  onToggleConcept: (id: SMCConceptId) => void;
  onClearAll: () => void;
  zones: DetectedZone[];
  isOpen: boolean;
  onToggleOpen: () => void;
}

export default function ConceptSidebar({
  activeConcepts,
  onToggleConcept,
  onClearAll,
  zones,
  isOpen,
  onToggleOpen,
}: ConceptSidebarProps) {
  const [search, setSearch] = useState('');
  const [expandedConcept, setExpandedConcept] = useState<SMCConceptId | null>(null);
  const [showGlossary, setShowGlossary] = useState(false);

  const filteredConcepts = useMemo(() => {
    if (!search.trim()) return SMC_CONCEPTS;
    const q = search.toLowerCase();
    return SMC_CONCEPTS.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.shortName.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    );
  }, [search]);

  const getZoneCount = (conceptId: SMCConceptId) =>
    zones.filter(z => z.conceptId === conceptId).length;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={onToggleOpen}
        className="fixed top-4 left-4 z-50 bg-slate-800 hover:bg-slate-700 text-white p-2.5 rounded-lg border border-slate-600 transition-all duration-200 shadow-lg interactive-control"
        aria-label={isOpen ? 'Close concept panel' : 'Open concept panel'}
        title={isOpen ? 'Close concepts' : 'Open concepts'}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full bg-slate-900/98 backdrop-blur-sm border-r border-slate-700 z-40 transition-all duration-300 ease-in-out overflow-hidden ${
          isOpen ? 'w-80' : 'w-0'
        }`}
      >
        <div className="w-80 h-full flex flex-col pt-16 px-4 pb-4 overflow-y-auto custom-scrollbar">
          {/* Header */}
          <div className="mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-amber-400">◈</span>
              SMC Concepts
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select concepts to detect and mark on the chart
            </p>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search concepts..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all interactive-control"
              aria-label="Search SMC concepts"
            />
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => SMC_CONCEPTS.forEach(c => {
                if (!activeConcepts.includes(c.id)) onToggleConcept(c.id);
              })}
              className="flex-1 text-xs py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-600 transition-colors interactive-control"
            >
              Select All
            </button>
            <button
              onClick={onClearAll}
              className="flex-1 text-xs py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-600 transition-colors interactive-control"
            >
              Clear All
            </button>
          </div>

          {/* Concept list */}
          <div className="flex-1 space-y-2">
            {filteredConcepts.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                No concepts match &ldquo;{search}&rdquo;
              </div>
            )}

            {filteredConcepts.map(concept => {
              const isActive = activeConcepts.includes(concept.id);
              const detectionCount = getZoneCount(concept.id);
              const isExpanded = expandedConcept === concept.id;

              return (
                <div
                  key={concept.id}
                  className={`rounded-lg border transition-all duration-200 ${
                    isActive
                      ? 'border-amber-500/40 bg-slate-800/80'
                      : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                  }`}
                >
                  <button
                    onClick={() => onToggleConcept(concept.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggleConcept(concept.id);
                      }
                    }}
                    className="w-full flex items-center gap-3 p-3 text-left interactive-control"
                    role="switch"
                    aria-checked={isActive}
                    aria-label={`Toggle ${concept.name}`}
                  >
                    {/* Toggle indicator */}
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                        isActive
                          ? 'border-amber-400 bg-amber-500/20'
                          : 'border-slate-500'
                      }`}
                      style={isActive ? { borderColor: concept.color } : {}}
                    >
                      {isActive && (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" style={{ color: concept.color }}>
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{concept.icon} {concept.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 font-mono">
                          {concept.shortName}
                        </span>
                      </div>
                    </div>

                    {/* Detection badge */}
                    {isActive && detectionCount > 0 && (
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: concept.bgColor, color: concept.color }}
                      >
                        {detectionCount}
                      </span>
                    )}
                  </button>

                  {/* Expand details */}
                  <div className="px-3 pb-1">
                    <button
                      onClick={() => setExpandedConcept(isExpanded ? null : concept.id)}
                      className="text-xs text-slate-500 hover:text-slate-300 transition-colors interactive-control"
                    >
                      {isExpanded ? '▾ Hide details' : '▸ Details'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <p className="text-xs text-slate-400 leading-relaxed">{concept.description}</p>
                      {isActive && detectionCount > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="text-xs font-medium text-slate-300">
                            Detected zones ({detectionCount}):
                          </div>
                          {zones
                            .filter(z => z.conceptId === concept.id)
                            .slice(-5)
                            .map((zone, idx) => (
                              <div
                                key={idx}
                                className="text-xs text-slate-400 bg-slate-800/60 rounded px-2 py-1.5 border-l-2"
                                style={{ borderColor: concept.color }}
                              >
                                <div className="font-medium" style={{ color: concept.color }}>
                                  {zone.type}
                                </div>
                                <div>{zone.details}</div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Glossary toggle */}
          <div className="mt-4 border-t border-slate-700 pt-4">
            <button
              onClick={() => setShowGlossary(!showGlossary)}
              className="w-full text-left text-sm text-slate-400 hover:text-white transition-colors interactive-control flex items-center gap-2"
            >
              <span>📖</span>
              <span>{showGlossary ? 'Hide' : 'Show'} SMC Glossary</span>
              <span className="ml-auto text-xs">{showGlossary ? '▾' : '▸'}</span>
            </button>

            {showGlossary && (
              <div className="mt-3 space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {Object.entries(SMC_GLOSSARY).map(([term, definition]) => (
                  <div key={term} className="text-xs">
                    <span className="font-bold text-amber-400">{term}</span>
                    <span className="text-slate-400"> — {definition}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

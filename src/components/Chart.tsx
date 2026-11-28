'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  createSeriesMarkers,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  SeriesMarker,
  Time,
  ISeriesMarkersPluginApi,
  IPriceLine,
} from 'lightweight-charts';
import { Candle, DetectedZone, SMC_CONCEPTS, SMCConceptId } from '@/lib/types';

interface ChartProps {
  candles: Candle[];
  zones: DetectedZone[];
  activeConcepts: SMCConceptId[];
  onCrosshairMove?: (price: number | null, time: number | null) => void;
}

export default function Chart({ candles, zones, activeConcepts, onCrosshairMove }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0e17' },
        textColor: '#9ca3af',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.4)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.4)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(224, 227, 235, 0.3)',
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: 'rgba(224, 227, 235, 0.3)',
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(42, 46, 57, 0.6)',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(42, 46, 57, 0.6)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    // Create markers plugin
    const markersPlugin = createSeriesMarkers(candleSeries, []);

    // Crosshair tracking
    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        const data = param.seriesData.get(candleSeries) as CandlestickData | undefined;
        if (data && onCrosshairMove) {
          onCrosshairMove(data.close as number, param.time as number);
        }
      } else if (onCrosshairMove) {
        onCrosshairMove(null, null);
      }
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    markersPluginRef.current = markersPlugin;

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersPluginRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update candle data
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const candleData: CandlestickData[] = candles.map(c => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData: HistogramData[] = candles
      .filter(c => c.volume !== undefined)
      .map(c => ({
        time: c.time as Time,
        value: c.volume!,
        color: c.close >= c.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
      }));

    candleSeriesRef.current.setData(candleData);
    if (volumeData.length > 0) {
      volumeSeriesRef.current.setData(volumeData);
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Draw zone overlays
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !markersPluginRef.current) return;

    // Remove old price lines
    priceLinesRef.current.forEach(pl => {
      try { candleSeriesRef.current?.removePriceLine(pl); } catch {}
    });
    priceLinesRef.current = [];

    const activeZones = zones.filter(z => activeConcepts.includes(z.conceptId));

    if (activeZones.length === 0) {
      markersPluginRef.current.setMarkers([]);
      return;
    }

    // Build markers
    const markers: SeriesMarker<Time>[] = [];

    activeZones.forEach(zone => {
      const concept = SMC_CONCEPTS.find(c => c.id === zone.conceptId);
      if (!concept) return;

      // Add price lines for zone boundaries
      try {
        const lineHigh = candleSeriesRef.current!.createPriceLine({
          price: zone.priceHigh,
          color: concept.color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: '',
        });
        const lineLow = candleSeriesRef.current!.createPriceLine({
          price: zone.priceLow,
          color: concept.color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: '',
        });
        priceLinesRef.current.push(lineHigh, lineLow);
      } catch {}

      // Add markers at zone start
      const isAbove = zone.type.includes('Bearish') || zone.type.includes('High') ||
                      zone.type.includes('Buy-side') || zone.type.includes('HH') || zone.type.includes('LH');

      markers.push({
        time: zone.startTime as Time,
        position: isAbove ? 'aboveBar' : 'belowBar',
        color: concept.color,
        shape: zone.conceptId === 'hh_ll' ? 'circle' as const :
               isAbove ? 'arrowDown' as const : 'arrowUp' as const,
        text: zone.label,
      });
    });

    // Sort markers by time
    markers.sort((a, b) => (a.time as number) - (b.time as number));

    // Deduplicate by time + position (lightweight-charts requires unique time per position)
    const uniqueMarkers = markers.reduce((acc, m) => {
      const key = `${m.time}-${m.position}`;
      const existing = acc.find(e => `${e.time}-${e.position}` === key);
      if (existing) {
        existing.text = (existing.text || '') + ' | ' + (m.text || '');
      } else {
        acc.push({ ...m });
      }
      return acc;
    }, [] as SeriesMarker<Time>[]);

    markersPluginRef.current.setMarkers(uniqueMarkers);
  }, [zones, activeConcepts]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full chart-area"
        style={{ minHeight: '400px' }}
      />
    </div>
  );
}

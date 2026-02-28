'use client';

import { useState, useRef, useMemo, useCallback, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Liveline, type LivelinePoint, type CandlePoint, type OrderbookData } from 'liveline';
import { useToken, useTokenInfo } from '@/providers/token-provider';
import { getClient, getDatastream } from '@/services/api';

interface WindowConfig {
  label: string;
  candle: number;
  secs: number;
  resolution: string;
  fetchSpan: number;
}

const WINDOWS: WindowConfig[] = [
  { label: '1s',  candle: 1,     secs: 60,       resolution: '1s',  fetchSpan: 180 },
  { label: '1m',  candle: 60,    secs: 3600,     resolution: '1m',  fetchSpan: 7200 },
  { label: '5m',  candle: 300,   secs: 18000,    resolution: '5m',  fetchSpan: 36000 },
  { label: '15m', candle: 900,   secs: 54000,    resolution: '15m', fetchSpan: 108000 },
  { label: '1h',  candle: 3600,  secs: 216000,   resolution: '1h',  fetchSpan: 432000 },
  { label: '4h',  candle: 14400, secs: 864000,   resolution: '4h',  fetchSpan: 1728000 },
  { label: '1d',  candle: 86400, secs: 5184000,  resolution: '1d',  fetchSpan: 10368000 },
];

const TIME_WINDOWS = WINDOWS.map((w) => ({ label: w.label, secs: w.secs }));

function getWindowConfig(secs: number): WindowConfig {
  return WINDOWS.find((w) => w.secs === secs) ?? WINDOWS[4];
}

function formatChartValue(v: number): string {
  if (v === 0) return '$0';
  if (!v || isNaN(v)) return '$0';
  const abs = Math.abs(v);
  if (abs < 0.000001) return '$' + v.toExponential(2);
  if (abs < 0.01) return '$' + v.toFixed(8);
  if (abs < 1) return '$' + v.toFixed(6);
  if (abs < 100) return '$' + v.toFixed(4);
  if (abs >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return '$' + (v / 1e3).toFixed(2) + 'K';
  return '$' + v.toFixed(2);
}

function formatChartTime(t: number): string {
  const d = new Date(t * 1000);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  const mon = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  return sameDay ? `${hh}:${mm}:${ss}` : `${mon}/${day} ${hh}:${mm}`;
}

function snapToCandle(timestamp: number, interval: number): number {
  return Math.floor(timestamp / interval) * interval;
}

function fillCandleGaps(candles: CandlePoint[], interval: number): CandlePoint[] {
  if (candles.length < 2 || interval <= 0) return candles;
  const filled: CandlePoint[] = [candles[0]];
  for (let i = 1; i < candles.length; i++) {
    const prev = filled[filled.length - 1];
    const curr = candles[i];
    const gap = curr.time - prev.time;
    if (gap > interval * 1.5) {
      const steps = Math.min(Math.floor(gap / interval), 500);
      for (let s = 1; s < steps; s++) {
        const t = prev.time + interval * s;
        if (t >= curr.time) break;
        filled.push({ time: t, open: prev.close, high: prev.close, low: prev.close, close: prev.close });
      }
    }
    filled.push(curr);
  }
  return filled;
}

function fillLineGaps(points: LivelinePoint[], interval: number): LivelinePoint[] {
  if (points.length < 2 || interval <= 0) return points;
  const filled: LivelinePoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = filled[filled.length - 1];
    const curr = points[i];
    const gap = curr.time - prev.time;
    if (gap > interval * 1.5) {
      const steps = Math.min(Math.floor(gap / interval), 500);
      for (let s = 1; s < steps; s++) {
        const t = prev.time + interval * s;
        if (t >= curr.time) break;
        filled.push({ time: t, value: prev.value });
      }
    }
    filled.push(curr);
  }
  return filled;
}

interface ProcessedChartData {
  linePoints: LivelinePoint[];
  candles: CandlePoint[];
}

function processChartBars(
  bars: { time: number; open: number; high: number; low: number; close: number }[],
  candleInterval: number,
): ProcessedChartData {
  const linePoints: LivelinePoint[] = [];
  const candles: CandlePoint[] = [];

  for (const bar of bars) {
    if (bar.time == null || bar.close == null || isNaN(bar.close)) continue;
    linePoints.push({ time: bar.time, value: bar.close });
    candles.push({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
  }

  linePoints.sort((a, b) => a.time - b.time);
  candles.sort((a, b) => a.time - b.time);

  return {
    linePoints: fillLineGaps(linePoints, candleInterval),
    candles: fillCandleGaps(candles, candleInterval),
  };
}

interface PriceStreamState {
  livePrice: number;
  points: LivelinePoint[];
  liveCandle: CandlePoint | null;
  completedCandles: CandlePoint[];
}

const EMPTY_PRICE_STATE: PriceStreamState = {
  livePrice: 0,
  points: [],
  liveCandle: null,
  completedCandles: [],
};

class PriceStreamStore {
  state: PriceStreamState = { ...EMPTY_PRICE_STATE };
  listeners = new Set<() => void>();
  windowSecs = 60;

  private _candleInterval = 60;
  private lastBar: CandlePoint | null = null;
  private lastProcessedPrice: number | null = null;
  private lastProcessedTime = 0;
  private sub: { unsubscribe: () => void } | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  get candleInterval(): number {
    return this._candleInterval;
  }

  set candleInterval(val: number) {
    if (this._candleInterval !== val) {
      this._candleInterval = val;
      this.lastBar = null;
    }
  }

  getSnapshot = (): PriceStreamState => this.state;

  reset(): void {
    this.state = { ...EMPTY_PRICE_STATE };
    this.lastBar = null;
    this.lastProcessedPrice = null;
    this.lastProcessedTime = 0;
  }

  connect(tokenAddress: string): void {
    this.disconnect();

    const attempt = (): void => {
      const ds = getDatastream();
      if (!ds) {
        this.retryTimer = setTimeout(attempt, 500);
        return;
      }

      this.sub = ds.subscribe.price.aggregated(tokenAddress).on((priceData: Record<string, any>) => {
        const liquidity = priceData?.aggregated?.liquidity ?? priceData?.liquidity;
        const p: unknown = liquidity === 0 ? 0 : (priceData?.aggregated?.average || priceData?.price);
        if (typeof p !== 'number') return;

        const nowMs = Date.now();
        const nowSec = Math.floor(nowMs / 1000);
        if (this.lastProcessedPrice === p && nowMs - this.lastProcessedTime < 100) return;
        this.lastProcessedPrice = p;
        this.lastProcessedTime = nowMs;

        this.applyPrice(p, nowSec);
      });
    };

    attempt();
  }

  disconnect(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.sub?.unsubscribe();
    this.sub = null;
  }

  private applyPrice(p: number, nowSec: number): void {
    const interval = this._candleInterval;
    const currentBarTime = snapToCandle(nowSec, interval);

    let points = this.state.points;
    if (points.length > 0 && points[points.length - 1].time === nowSec) {
      points = points.slice();
      points[points.length - 1] = { time: nowSec, value: p };
    } else {
      points = [...points, { time: nowSec, value: p }];
      const cutoff = nowSec - this.windowSecs * 2;
      if (points.length > 2000) points = points.filter((pt) => pt.time >= cutoff);
    }

    let completedCandles = this.state.completedCandles;
    let liveCandle: CandlePoint | null;
    const lastBar = this.lastBar;

    if (lastBar && currentBarTime === lastBar.time) {
      const updated: CandlePoint = {
        ...lastBar,
        high: Math.max(lastBar.high, p),
        low: Math.min(lastBar.low, p),
        close: p,
      };
      this.lastBar = updated;
      liveCandle = updated;
    } else {
      const openPrice = lastBar ? lastBar.close : p;

      if (lastBar) {
        completedCandles = [...completedCandles];
        if (completedCandles.length > 0 && completedCandles[completedCandles.length - 1].time === lastBar.time) {
          completedCandles[completedCandles.length - 1] = { ...lastBar };
        } else {
          completedCandles.push({ ...lastBar });
        }

        const gapStart = lastBar.time + interval;
        if (currentBarTime > gapStart) {
          const maxFill = Math.min(Math.floor((currentBarTime - gapStart) / interval), 200);
          for (let i = 0; i < maxFill; i++) {
            const gapTime = gapStart + interval * i;
            if (gapTime >= currentBarTime) break;
            completedCandles.push({
              time: gapTime,
              open: lastBar.close,
              high: lastBar.close,
              low: lastBar.close,
              close: lastBar.close,
            });
          }
        }
      }

      const newCandle: CandlePoint = {
        time: currentBarTime,
        open: openPrice,
        high: Math.max(openPrice, p),
        low: Math.min(openPrice, p),
        close: p,
      };
      this.lastBar = newCandle;
      liveCandle = newCandle;
    }

    this.state = { livePrice: p, points, liveCandle, completedCandles };
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

class OrderbookStore {
  state: OrderbookData | undefined = undefined;
  listeners = new Set<() => void>();

  private sub: { unsubscribe: () => void } | null = null;
  private lastVol = -1;
  private lastTxCount = -1;
  private getCurrentPrice: () => number = () => 0;

  getSnapshot = (): OrderbookData | undefined => this.state;

  connect(tokenAddress: string, getCurrentPrice: () => number): void {
    this.disconnect();
    this.getCurrentPrice = getCurrentPrice;

    const ds = getDatastream();
    if (!ds) return;

    this.sub = ds.subscribe.volume.token(tokenAddress).on((data: Record<string, any>) => {
      const vol = data?.volume as number | undefined;
      const txCount = (data?.txCount ?? -1) as number;
      if (!vol || typeof vol !== 'number') return;
      if (vol === this.lastVol && txCount === this.lastTxCount) return;
      this.lastVol = vol;
      this.lastTxCount = txCount;

      const p = this.getCurrentPrice();
      if (!p) return;

      const levels = 10;
      const spread = p * 0.005;
      const bids: [number, number][] = [];
      const asks: [number, number][] = [];

      for (let i = 0; i < levels; i++) {
        const depth = (i + 1) / levels;
        const size = (vol * (1 - depth * 0.7)) / levels;
        bids.push([p - spread * (i + 1), size]);
        asks.push([p + spread * (i + 1), size]);
      }

      this.state = { bids, asks };
      this.emit();
    });
  }

  disconnect(): void {
    this.sub?.unsubscribe();
    this.sub = null;
    this.lastVol = -1;
    this.lastTxCount = -1;
    this.state = undefined;
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

const getServerPriceState = (): PriceStreamState => EMPTY_PRICE_STATE;
const getServerOrderbook = (): OrderbookData | undefined => undefined;

interface LivelineChartProps {
  isDarkMode?: boolean;
}

export function LivelineChart({ isDarkMode = true }: LivelineChartProps) {
  const { tokenAddress } = useToken();
  const { price: initialPrice } = useTokenInfo();

  const [windowSecs, setWindowSecs] = useState<number>(WINDOWS[0].secs);
  const [chartMode, setChartMode] = useState<'line' | 'candle'>('line');

  const wc = getWindowConfig(windowSecs);

  const { data: ath } = useQuery({
    queryKey: ['ath', tokenAddress],
    queryFn: async () => {
      const data = await getClient().getAthPrice(tokenAddress);
      return data.highest_price > 0 ? data.highest_price : null;
    },
    enabled: !!tokenAddress,
    staleTime: 60_000,
  });

  const { data: historical, isLoading } = useQuery({
    queryKey: ['chart', tokenAddress, windowSecs],
    queryFn: async () => {
      const now = Math.floor(Date.now() / 1000);
      const from = now - wc.fetchSpan;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await getClient().getChartData({
        tokenAddress,
        type: wc.resolution,
        timeFrom: from,
        timeTo: now,
        removeOutliers: true,
        timezone: tz,
      });
      return processChartBars(response?.oclhv ?? [], wc.candle);
    },
    enabled: !!tokenAddress,
    staleTime: 5_000,
  });

  const priceStoreRef = useRef<PriceStreamStore | null>(null);
  if (!priceStoreRef.current) priceStoreRef.current = new PriceStreamStore();
  const priceStore = priceStoreRef.current;
  priceStore.candleInterval = wc.candle;
  priceStore.windowSecs = windowSecs;

  const priceSubscribe = useCallback(
    (onStoreChange: () => void) => {
      priceStore.listeners.add(onStoreChange);
      priceStore.reset();
      priceStore.connect(tokenAddress);
      return () => {
        priceStore.listeners.delete(onStoreChange);
        priceStore.disconnect();
      };
    },
    [priceStore, tokenAddress],
  );

  const priceStream = useSyncExternalStore(priceSubscribe, priceStore.getSnapshot, getServerPriceState);

  const orderbookStoreRef = useRef<OrderbookStore | null>(null);
  if (!orderbookStoreRef.current) orderbookStoreRef.current = new OrderbookStore();
  const orderbookStore = orderbookStoreRef.current;

  const currentPriceRef = useRef(initialPrice);
  currentPriceRef.current = priceStream.livePrice || initialPrice;

  const orderbookSubscribe = useCallback(
    (onStoreChange: () => void) => {
      orderbookStore.listeners.add(onStoreChange);
      orderbookStore.connect(tokenAddress, () => currentPriceRef.current);
      return () => {
        orderbookStore.listeners.delete(onStoreChange);
        orderbookStore.disconnect();
      };
    },
    [orderbookStore, tokenAddress],
  );

  const orderbook = useSyncExternalStore(orderbookSubscribe, orderbookStore.getSnapshot, getServerOrderbook);

  const chartData = useMemo(() => {
    const hist = historical?.linePoints ?? [];
    const live = priceStream.points;
    if (hist.length === 0) return live;
    if (live.length === 0) return hist;
    const lastHistorical = hist[hist.length - 1]?.time ?? 0;
    const newLive = live.filter((pt) => pt.time > lastHistorical);
    return [...hist, ...newLive];
  }, [historical?.linePoints, priceStream.points]);

  const candleData = useMemo(() => {
    const hist = historical?.candles ?? [];
    const live = priceStream.completedCandles;
    if (live.length === 0) return hist;
    if (hist.length === 0) return live;
    const lastHistorical = hist[hist.length - 1]?.time ?? 0;
    const newLive = live.filter((c) => c.time > lastHistorical);
    return [...hist, ...newLive];
  }, [historical?.candles, priceStream.completedCandles]);

  const liveCandle = priceStream.liveCandle;
  const currentValue = priceStream.livePrice || initialPrice || chartData[chartData.length - 1]?.value || 0;

  const referenceLine = useMemo(() => {
    if (!ath || ath <= 0) return undefined;
    const visibleMax = chartData.reduce((m, p) => Math.max(m, p.value), currentValue);
    const visibleMin = chartData.reduce((m, p) => Math.min(m, p.value), currentValue);
    const visibleRange = visibleMax - visibleMin || visibleMax * 0.1;
    if (ath > visibleMax + visibleRange * 2) return undefined;
    return { value: ath, label: `ATH ${formatChartValue(ath)}` };
  }, [ath, chartData, currentValue]);

  const handleWindowChange = useCallback((secs: number) => setWindowSecs(secs), []);
  const handleModeChange = useCallback((mode: 'line' | 'candle') => setChartMode(mode), []);

  const dataWindowSecs = useMemo(() => {
    if (chartData.length < 2) return windowSecs;
    const span = chartData[chartData.length - 1].time - chartData[0].time;
    return Math.min(windowSecs, Math.max(span * 1.05, 30));
  }, [chartData, windowSecs]);

  const isPositive = chartData.length >= 2 ? chartData[chartData.length - 1].value >= chartData[0].value : true;
  const accentColor = isPositive ? '#12AF80' : '#F25461';

  return (
    <div
      className={`h-full w-full rounded-2xl border shadow-2xl overflow-hidden relative flex flex-col pt-3 transition-colors duration-300 ${
        isDarkMode ? 'bg-neutral-900/40 border-white/5' : 'bg-white/80 border-black/5'
      }`}
    >
      <div className="flex-1 min-h-0">
        <Liveline
          data={chartData}
          value={currentValue}
          theme={isDarkMode ? 'dark' : 'light'}
          color={accentColor}
          loading={isLoading}
          degen
          mode={chartMode}
          lineMode={chartMode === 'line'}
          candles={candleData}
          candleWidth={wc.candle}
          liveCandle={liveCandle ?? undefined}
          onModeChange={handleModeChange}
          showValue={false}
          momentum
          scrub
          windows={TIME_WINDOWS}
          window={dataWindowSecs}
          onWindowChange={handleWindowChange}
          windowStyle="rounded"
          orderbook={orderbook}
          referenceLine={referenceLine}
          formatValue={formatChartValue}
          formatTime={formatChartTime}
          badge
          badgeVariant="minimal"
          fill
          grid
          padding={{ top: 4, right: 80, bottom: 100, left: 12 }}
        />
      </div>
    </div>
  );
}

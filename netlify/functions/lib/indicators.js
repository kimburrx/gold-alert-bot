// indicators.js — คำนวณ EMA / RSI / ตรวจจับสัญญาณ BUY-SELL
// พอร์ตมาจากตรรกะเดียวกับ gold_alert_bot.py (เวอร์ชัน Python)

const EMA_FAST = 20;
const EMA_SLOW = 50;
const RSI_PERIOD = 14;

function emaSeries(values, period) {
  const k = 2 / (period + 1);
  const out = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function rsiSeries(values, period) {
  const alpha = 1 / period;
  const gains = new Array(values.length).fill(0);
  const losses = new Array(values.length).fill(0);
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    gains[i] = Math.max(delta, 0);
    losses[i] = Math.max(-delta, 0);
  }

  const avgGain = new Array(values.length);
  const avgLoss = new Array(values.length);
  avgGain[0] = gains[0];
  avgLoss[0] = losses[0];
  for (let i = 1; i < values.length; i++) {
    avgGain[i] = alpha * gains[i] + (1 - alpha) * avgGain[i - 1];
    avgLoss[i] = alpha * losses[i] + (1 - alpha) * avgLoss[i - 1];
  }

  return values.map((_, i) => {
    const rs = avgGain[i] / (avgLoss[i] || 1e-12);
    return 100 - 100 / (1 + rs);
  });
}

// bars: [{ datetime, open, high, low, close }, ...] เรียงจากเก่า -> ใหม่
function computeIndicators(bars) {
  const closes = bars.map((b) => b.close);
  const emaFast = emaSeries(closes, EMA_FAST);
  const emaSlow = emaSeries(closes, EMA_SLOW);
  const rsi = rsiSeries(closes, RSI_PERIOD);
  return bars.map((b, i) => ({
    ...b,
    ema_fast: emaFast[i],
    ema_slow: emaSlow[i],
    rsi: rsi[i],
  }));
}

function signalAt(prev, curr) {
  const crossedUp = prev.ema_fast <= prev.ema_slow && curr.ema_fast > curr.ema_slow;
  const crossedDown = prev.ema_fast >= prev.ema_slow && curr.ema_fast < curr.ema_slow;

  if (crossedUp && curr.rsi >= 45 && curr.rsi <= 70) return "BUY";
  if (crossedDown && curr.rsi >= 30 && curr.rsi <= 55) return "SELL";
  return null;
}

// คืนสัญญาณของแท่งล่าสุดเท่านั้น (ใช้กับการเช็คแบบ real-time)
function detectSignal(bars) {
  const minLen = Math.max(EMA_SLOW, RSI_PERIOD) + 2;
  if (bars.length < minLen) return { signal: null, row: bars[bars.length - 1] };

  const prev = bars[bars.length - 2];
  const curr = bars[bars.length - 1];
  return { signal: signalAt(prev, curr), row: curr };
}

// สแกนทั้งชุดข้อมูล คืนทุกจุดที่เกิดสัญญาณ (ใช้กับ backtest)
function generateAllSignals(bars) {
  const minLen = Math.max(EMA_SLOW, RSI_PERIOD) + 2;
  const signals = [];
  for (let i = minLen; i < bars.length; i++) {
    const s = signalAt(bars[i - 1], bars[i]);
    if (s) signals.push({ index: i, signal: s, price: bars[i].close, datetime: bars[i].datetime });
  }
  return signals;
}

module.exports = { EMA_FAST, EMA_SLOW, RSI_PERIOD, computeIndicators, detectSignal, generateAllSignals };

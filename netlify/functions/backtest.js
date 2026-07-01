// backtest.js — ทดสอบย้อนหลังกลยุทธ์ EMA/RSI ด้วยข้อมูลจริง
// เรียกผ่าน: GET /.netlify/functions/backtest?outputsize=1000

const { fetchOhlc } = require("./lib/twelvedata");
const { computeIndicators, generateAllSignals } = require("./lib/indicators");

function simulateTrades(signals) {
  const trades = [];
  let position = null; // { type: "BUY"|"SELL", price, datetime }

  for (const sig of signals) {
    if (!position) {
      position = sig;
      continue;
    }
    if (position.signal === "BUY" && sig.signal === "SELL") {
      const pnlPct = ((sig.price - position.price) / position.price) * 100;
      trades.push({ type: "LONG", entry: position.price, exit: sig.price, entryTime: position.datetime, exitTime: sig.datetime, pnlPct });
      position = sig;
    } else if (position.signal === "SELL" && sig.signal === "BUY") {
      const pnlPct = ((position.price - sig.price) / position.price) * 100;
      trades.push({ type: "SHORT", entry: position.price, exit: sig.price, entryTime: position.datetime, exitTime: sig.datetime, pnlPct });
      position = sig;
    }
  }
  return trades;
}

function summarize(trades) {
  if (trades.length === 0) {
    return { totalTrades: 0, winRatePct: 0, cumulativeReturnPct: 0, avgPnlPct: 0, maxDrawdownPct: 0 };
  }
  const n = trades.length;
  const wins = trades.filter((t) => t.pnlPct > 0).length;

  let equity = 1;
  const equityCurve = [1];
  for (const t of trades) {
    equity *= 1 + t.pnlPct / 100;
    equityCurve.push(equity);
  }

  let peak = equityCurve[0];
  let maxDd = 0;
  for (const e of equityCurve) {
    peak = Math.max(peak, e);
    maxDd = Math.min(maxDd, ((e - peak) / peak) * 100);
  }

  const avgPnl = trades.reduce((s, t) => s + t.pnlPct, 0) / n;

  return {
    totalTrades: n,
    winRatePct: Number(((wins / n) * 100).toFixed(1)),
    cumulativeReturnPct: Number(((equity - 1) * 100).toFixed(2)),
    avgPnlPct: Number(avgPnl.toFixed(3)),
    maxDrawdownPct: Number(maxDd.toFixed(2)),
  };
}

exports.handler = async (event) => {
  try {
    const outputsize = parseInt((event.queryStringParameters && event.queryStringParameters.outputsize) || "1000", 10);
    const bars = await fetchOhlc({ outputsize });
    const withIndicators = computeIndicators(bars);
    const signals = generateAllSignals(withIndicators);
    const trades = simulateTrades(signals);
    const stats = summarize(trades);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        rangeStart: bars[0].datetime,
        rangeEnd: bars[bars.length - 1].datetime,
        stats,
        recentTrades: trades.slice(-5),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};

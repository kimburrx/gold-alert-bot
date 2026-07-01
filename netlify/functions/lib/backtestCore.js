// backtestCore.js — ตรรกะจำลองเทรดที่ backtest.js และ check-scheduled.js ใช้ร่วมกัน
// (check-scheduled.js ใช้เพื่อคำนวณ "อัตราชนะย้อนหลังของสัญญาณแบบนี้" แนบไปกับข้อความแจ้งเตือน
//  โดยไม่ต้องยิง API ราคาเพิ่ม เพราะใช้ข้อมูลที่ดึงมาแล้วในรอบเดียวกัน)

function simulateTrades(signals) {
  const trades = [];
  let position = null; // { signal, price, datetime }

  for (const sig of signals) {
    if (!position) {
      position = sig;
      continue;
    }
    if (position.signal === "BUY" && sig.signal === "SELL") {
      const pnlPct = ((sig.price - position.price) / position.price) * 100;
      trades.push({ type: "LONG", entrySignal: "BUY", entry: position.price, exit: sig.price, entryTime: position.datetime, exitTime: sig.datetime, pnlPct });
      position = sig;
    } else if (position.signal === "SELL" && sig.signal === "BUY") {
      const pnlPct = ((position.price - sig.price) / position.price) * 100;
      trades.push({ type: "SHORT", entrySignal: "SELL", entry: position.price, exit: sig.price, entryTime: position.datetime, exitTime: sig.datetime, pnlPct });
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

// แยกสถิติเฉพาะไม้ที่เข้าด้วยสัญญาณ BUY กับที่เข้าด้วยสัญญาณ SELL ออกจากกัน
function summarizeByEntrySignal(trades) {
  const buyTrades = trades.filter((t) => t.entrySignal === "BUY");
  const sellTrades = trades.filter((t) => t.entrySignal === "SELL");
  return {
    BUY: summarize(buyTrades),
    SELL: summarize(sellTrades),
  };
}

module.exports = { simulateTrades, summarize, summarizeByEntrySignal };

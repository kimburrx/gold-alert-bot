// analysis.js — บทวิเคราะห์เสริมแนบไปกับสัญญาณเข้าไม้:
//  1) เป้าหมายถัดไป จากแนวรับ-แนวต้านที่มองย้อนหลังไกลกว่าปกติ (จุดอ้างอิงเชิงโครงสร้าง ไม่ใช่การพยากรณ์)
//  2) ระยะเวลาถือครองเฉลี่ย จากไม้จริงในผล backtest ทิศทางเดียวกัน (ข้อมูลจริง ไม่ใช่ตัวเลขที่เดามา)
//  3) ข้อควรระวัง คำนวณจากข้อมูลจริง (ตัวอย่างน้อยไป / winrate ต่ำกว่าครึ่ง / RSI ใกล้สุดขั้ว)
//
// เป้าหมายคือให้บอทมีเหตุผลประกอบ ไม่ใช่แค่ยิงตัวเลข และไม่ฟันธงเกินสิ่งที่ข้อมูลรองรับ

const WIDE_LOOKBACK = 90; // มองไกลกว่าที่ srSignals.js ใช้ตัดสินสัญญาณปกติ (30 แท่ง) เพื่อหาแนวถัดไปที่ไกลออกไป

function formatDuration(ms) {
  if (!ms || ms <= 0) return null;
  const mins = ms / 60000;
  if (mins < 60) return `${Math.round(mins)} นาที`;
  const hours = mins / 60;
  if (hours < 24) return `${hours.toFixed(1)} ชั่วโมง`;
  return `${(hours / 24).toFixed(1)} วัน`;
}

// ระยะเวลาถือครองเฉลี่ยของไม้ที่เข้าด้วยสัญญาณทิศทางเดียวกัน จากผล backtest จริง (ไม่ใช่ตัวเลขสมมติ)
function avgHoldingDuration(trades, signal) {
  const filtered = (trades || []).filter((t) => t.entrySignal === signal);
  if (filtered.length === 0) return null;
  let count = 0;
  const totalMs = filtered.reduce((sum, t) => {
    const entry = new Date(t.entryTime).getTime();
    const exit = new Date(t.exitTime).getTime();
    if (isNaN(entry) || isNaN(exit)) return sum;
    count++;
    return sum + Math.max(0, exit - entry);
  }, 0);
  if (count === 0) return null;
  return totalMs / count;
}

// เป้าหมายถัดไปจากแนวรับ-แนวต้านที่กว้างกว่าปกติ — จุดอ้างอิงเชิงโครงสร้างที่เคยมีนัยสำคัญ ไม่ใช่การพยากรณ์ว่าจะไปถึงจริง
function nextTarget(signal, entryPrice, srLevelsAtFn, bars) {
  const levels = srLevelsAtFn(bars, bars.length - 1, WIDE_LOOKBACK);
  if (!levels) return null;
  if (signal === "BUY" && levels.resistance > entryPrice) return levels.resistance;
  if (signal === "SELL" && levels.support < entryPrice) return levels.support;
  return null;
}

// ข้อควรระวัง — คำนวณจากข้อมูลจริงเท่านั้น (จำนวนตัวอย่าง / winrate / RSI สุดขั้ว) ไม่ใช่ความเห็นลอยๆ
function cautionFlags({ signal, row, backtestStats }) {
  const flags = [];
  if (backtestStats) {
    if (backtestStats.totalTrades > 0 && backtestStats.totalTrades < 5) {
      flags.push(`ข้อมูลย้อนหลังยังน้อย (${backtestStats.totalTrades} ครั้ง) เชื่อสถิตินี้ได้ไม่เต็มที่`);
    } else if (backtestStats.totalTrades >= 5 && backtestStats.winRatePct < 50) {
      flags.push(`สถิติย้อนหลังชนะแค่ ${backtestStats.winRatePct}% (ต่ำกว่าครึ่ง) ระวังเป็นพิเศษ`);
    }
  }
  if (signal === "BUY" && row.rsi >= 65) {
    flags.push(`RSI ${row.rsi.toFixed(1)} เข้าใกล้โซนซื้อมากเกินไปแล้ว มีโอกาสย่อแรงกว่าปกติ`);
  }
  if (signal === "SELL" && row.rsi <= 35) {
    flags.push(`RSI ${row.rsi.toFixed(1)} เข้าใกล้โซนขายมากเกินไปแล้ว มีโอกาสเด้งแรงกว่าปกติ`);
  }
  return flags;
}

module.exports = { formatDuration, avgHoldingDuration, nextTarget, cautionFlags, WIDE_LOOKBACK };

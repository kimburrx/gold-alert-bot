// watchSignals.js — แจ้งเตือน "จับตา" (heads-up) ล่วงหน้า ก่อนสัญญาณเข้าไม้จริงจะเกิด
// ใช้ข้อมูลราคาจริงแบบเดียวกับกลยุทธ์หลัก (real-time ทุกครั้งที่เช็ค ไม่ใช่ภาพนิ่ง)
//
// นี่ไม่ใช่สัญญาณเข้าไม้ ไม่มี SL/TP แนบมา แค่บอกว่า "ตอนนี้ราคา/อินดิเคเตอร์กำลังเข้าใกล้จุดที่อาจเกิดสัญญาณ"
// ให้เตรียมตัว รอสัญญาณจริง (ซึ่งจะมี SL/TP แนบมา) แยกต่างหากอีกข้อความ

const EMA_WATCH_GAP_ATR = 0.6; // EMA20/EMA50 ห่างกันไม่ถึงเท่านี้เท่าของ ATR ถือว่า "ใกล้จะตัดกัน"
const SR_WATCH_MIN_ATR = 0.15; // ไกลกว่าระยะ "แตะ" ที่นับเป็นสัญญาณจริงใน srSignals.js
const SR_WATCH_MAX_ATR = 1.5; // แต่ไม่ไกลเกินไปจนไม่มีความหมาย

// เช็คว่า EMA20/EMA50 กำลังใกล้กันมาก (มีโอกาสตัดกันเร็วๆ นี้) — ไม่ฟันธงทิศทาง เพราะยังไม่ตัดจริง
function watchTrend(bars) {
  const curr = bars[bars.length - 1];
  if (curr.ema_fast == null || curr.ema_slow == null || !curr.atr) return null;
  const gapAtr = Math.abs(curr.ema_fast - curr.ema_slow) / curr.atr;
  if (gapAtr > EMA_WATCH_GAP_ATR) return null;

  return {
    message:
      `EMA20/EMA50 เข้าใกล้กันมาก (ห่างกัน ${gapAtr.toFixed(2)} เท่าของ ATR) มีโอกาสตัดกันเร็วๆ นี้\n` +
      `RSI ปัจจุบัน: ${curr.rsi.toFixed(1)}`,
    row: curr,
  };
}

// เช็คว่าราคาเข้าใกล้แนวรับ/แนวต้าน (แต่ยังไม่ถึงระยะที่นับเป็นสัญญาณจริง)
function watchSr(bars, srLevelsAtFn, lookback) {
  const i = bars.length - 1;
  const curr = bars[i];
  const levels = srLevelsAtFn(bars, i, lookback);
  if (!levels || !curr.atr) return null;
  const { resistance, support } = levels;

  const distToRes = (resistance - curr.close) / curr.atr;
  const distToSup = (curr.close - support) / curr.atr;

  if (distToRes >= SR_WATCH_MIN_ATR && distToRes <= SR_WATCH_MAX_ATR) {
    return {
      message: `ราคาเข้าใกล้แนวต้าน ${resistance.toFixed(2)} (ห่าง ${distToRes.toFixed(2)} เท่าของ ATR) จับตาว่าจะทะลุขึ้นหรือเด้งกลับลง`,
      row: curr,
      level: resistance,
      levelType: "resistance",
    };
  }
  if (distToSup >= SR_WATCH_MIN_ATR && distToSup <= SR_WATCH_MAX_ATR) {
    return {
      message: `ราคาเข้าใกล้แนวรับ ${support.toFixed(2)} (ห่าง ${distToSup.toFixed(2)} เท่าของ ATR) จับตาว่าจะหลุดลงหรือเด้งกลับขึ้น`,
      row: curr,
      level: support,
      levelType: "support",
    };
  }
  return null;
}

module.exports = { watchTrend, watchSr };

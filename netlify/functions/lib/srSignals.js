// srSignals.js — กลยุทธ์ "แนวรับ-แนวต้าน" (Support/Resistance) แบบเทรดตามเทรนด์
// อิสระจากกลยุทธ์ EMA/RSI ในไฟล์ indicators.js แต่ใช้ทิศทางเทรนด์จาก EMA20/EMA50 (ที่ผ่าน computeIndicators() มาแล้ว) มากรองสัญญาณ
//
// ตรวจจับ 2 รูปแบบ แต่ "จะนับเป็นสัญญาณก็ต่อเมื่อไปทางเดียวกับเทรนด์หลักเท่านั้น" (ไม่เทรดสวนเทรนด์):
//  1) ทะลุ (breakout) — ราคาปิดทะลุแนวต้าน/แนวรับของ N แท่งย้อนหลัง ไปทิศทางเดิมต่อ = ยืนยันเทรนด์ต่อเนื่อง
//  2) กลับตัวย่อ (bounce) — ราคาย่อไปแตะแนวรับ (ในเทรนด์ขาขึ้น) หรือแนวต้าน (ในเทรนด์ขาลง) แล้วเด้งกลับไปทางเทรนด์เดิม
//     = จังหวะ "ซื้อตอนย่อ / ขายตอนเด้ง" ไม่ใช่การเดิมพันว่าเทรนด์จะกลับตัว
//
// ทิศทางเทรนด์หลัก: EMA20 > EMA50 = ขาขึ้น (รับสัญญาณ BUY เท่านั้น), EMA20 < EMA50 = ขาลง (รับสัญญาณ SELL เท่านั้น)

const LOOKBACK = 30; // จำนวนแท่งย้อนหลัง (ไม่รวมแท่งปัจจุบัน) ที่ใช้หาแนวรับ-แนวต้าน
const MIN_WINDOW = 10; // อย่างน้อยต้องมีกี่แท่งถึงจะเริ่มคำนวณแนวรับ-แนวต้านได้
const TOUCH_BUFFER_ATR_MULT = 0.15; // ระยะห่างที่ถือว่า "แตะ" แนวรับ/แนวต้าน (คูณด้วย ATR ปัจจุบัน)

function srLevelsAt(bars, i, lookback) {
  const start = Math.max(0, i - lookback);
  const window = bars.slice(start, i); // ไม่รวมแท่งปัจจุบัน กันดูย้อนหลังทับตัวเอง
  if (window.length < Math.min(lookback, MIN_WINDOW)) return null;
  const resistance = Math.max(...window.map((b) => b.high));
  const support = Math.min(...window.map((b) => b.low));
  return { resistance, support };
}

function srSignalAt(bars, i, lookback, hasOpenPosition = false) {
  if (i < 1) return null;
  const levels = srLevelsAt(bars, i, lookback);
  if (!levels) return null;

  const prev = bars[i - 1];
  const curr = bars[i];
  const { resistance, support } = levels;
  const atr = curr.atr || (resistance - support) * 0.05 || 0.01;
  const buffer = atr * TOUCH_BUFFER_ATR_MULT;

  // ทิศทางเทรนด์หลักจาก EMA20 เทียบ EMA50 (แท่งปัจจุบัน) — ใช้กรองไม่ให้เทรดสวนเทรนด์
  const trendUp = curr.ema_fast != null && curr.ema_slow != null && curr.ema_fast > curr.ema_slow;
  const trendDown = curr.ema_fast != null && curr.ema_slow != null && curr.ema_fast < curr.ema_slow;

  let candidate = null;

  // ทะลุแนวต้านขึ้น (breakout ต่อเนื่องเทรนด์ขาขึ้น)
  if (prev.close <= resistance && curr.close > resistance) {
    candidate = { signal: "BUY", type: "breakout", level: resistance };
  }
  // ทะลุแนวรับลง (breakout ต่อเนื่องเทรนด์ขาลง)
  else if (prev.close >= support && curr.close < support) {
    candidate = { signal: "SELL", type: "breakout", level: support };
  }
  // ย่อขึ้นไปแตะแนวต้านแล้วเด้งลงต่อ (ขายตอนเด้ง ในเทรนด์ขาลง) — ไส้บนแตะ/เกินแนวต้านนิดหน่อย แต่ปิดต่ำกว่าแนวต้าน เป็นแท่งแดง
  else if (curr.high >= resistance - buffer && curr.close < resistance && curr.close < curr.open) {
    candidate = { signal: "SELL", type: "bounce", level: resistance };
  }
  // ย่อลงไปแตะแนวรับแล้วเด้งขึ้นต่อ (ซื้อตอนย่อ ในเทรนด์ขาขึ้น) — ไส้ล่างแตะ/หลุดแนวรับนิดหน่อย แต่ปิดสูงกว่าแนวรับ เป็นแท่งเขียว
  else if (curr.low <= support + buffer && curr.close > support && curr.close > curr.open) {
    candidate = { signal: "BUY", type: "bounce", level: support };
  }
  // ยังไม่มีเหตุการณ์สดๆ ในแท่งนี้ — ถ้ายังไม่เคยมีไม้เปิดอยู่เลย ให้เช็คว่าตอนนี้ราคาอยู่เหนือแนวต้าน/ใต้แนวรับ
  // ของช่วงย้อนหลังอยู่แล้วหรือไม่ (คือทะลุไปตั้งแต่ก่อนบอทจะเริ่มดูกรอบนี้) เพื่อไม่ให้พลาดเทรนด์ที่กำลังเกิดอยู่
  else if (!hasOpenPosition) {
    if (curr.close > resistance) candidate = { signal: "BUY", type: "breakout", level: resistance };
    else if (curr.close < support) candidate = { signal: "SELL", type: "breakout", level: support };
  }

  if (!candidate) return null;

  // กรองตามเทรนด์: รับ BUY เฉพาะตอนเทรนด์หลักขาขึ้น, รับ SELL เฉพาะตอนเทรนด์หลักขาลง (ไม่เทรดสวนเทรนด์)
  if (candidate.signal === "BUY" && !trendUp) return null;
  if (candidate.signal === "SELL" && !trendDown) return null;

  return candidate;
}

// คืนสัญญาณของแท่งล่าสุดเท่านั้น (ใช้กับการเช็คแบบ real-time)
// hasOpenPosition: ถ้ายังไม่เคยมีไม้เปิดอยู่ของกรอบ+กลยุทธ์นี้เลย จะเช็คสถานะปัจจุบันด้วย ไม่ใช่แค่เหตุการณ์สดของแท่งนี้ (ดู srSignalAt)
function detectSrSignal(bars, lookback = LOOKBACK, hasOpenPosition = false) {
  const i = bars.length - 1;
  const result = srSignalAt(bars, i, lookback, hasOpenPosition);
  return {
    signal: result ? result.signal : null,
    type: result ? result.type : null,
    level: result ? result.level : null,
    row: bars[i],
  };
}

// สแกนทั้งชุดข้อมูล คืนทุกจุดที่เกิดสัญญาณ (ใช้กับ backtest)
// หมายเหตุ: บังคับ hasOpenPosition=true เสมอ เพื่อปิดโหมด "จับตามทัน" — ตอน backtest เราสแกนต่อเนื่องมีบริบทครบ
// อยู่แล้ว จึงต้องการแค่จุดเหตุการณ์สดๆ (ทะลุ/กลับตัว) เท่านั้น ไม่งั้นจะนับซ้ำทุกแท่งตอนราคายืนเหนือแนวต้านต่อเนื่องนาน
function generateAllSrSignals(bars, lookback = LOOKBACK) {
  const signals = [];
  for (let i = lookback; i < bars.length; i++) {
    const r = srSignalAt(bars, i, lookback, true);
    if (r) {
      signals.push({
        index: i,
        signal: r.signal,
        type: r.type,
        level: r.level,
        price: bars[i].close,
        datetime: bars[i].datetime,
      });
    }
  }
  return signals;
}

module.exports = { detectSrSignal, generateAllSrSignals, srLevelsAt, LOOKBACK };

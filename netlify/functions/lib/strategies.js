// strategies.js — รวมทุกกลยุทธ์ที่บอทเช็คในแต่ละกรอบเวลา
// เพิ่มกลยุทธ์ใหม่ในอนาคตได้ง่ายๆ แค่เพิ่มรายการในอาเรย์นี้ (detect/generateAll ต้องคืนรูปแบบเดียวกัน)

const { detectSignal, generateAllSignals } = require("./indicators");
const { detectSrSignal, generateAllSrSignals } = require("./srSignals");

const STRATEGIES = [
  {
    key: "trend",
    label: "เทรนด์ EMA20/50 + RSI",
    // bars ต้องผ่าน computeIndicators() มาก่อน (มี ema_fast/ema_slow/rsi/atr)
    detect: (bars) => {
      const r = detectSignal(bars);
      return { signal: r.signal, type: null, level: null, row: r.row };
    },
    generateAll: (bars) => generateAllSignals(bars),
  },
  {
    key: "sr",
    label: "แนวรับ-แนวต้าน (ทะลุ/ย่อ ตามเทรนด์)",
    detect: (bars) => detectSrSignal(bars),
    generateAll: (bars) => generateAllSrSignals(bars),
  },
];

module.exports = { STRATEGIES };

// timeframes.js — รายการกรอบเวลาที่บอทเฝ้าพร้อมกัน
// ยิ่งกรอบสั้น สัญญาณยิ่งถี่แต่ยิ่งหลอกง่าย ยิ่งกรอบยาว สัญญาณยิ่งน้อยแต่น่าเชื่อถือกว่า
// outputsize คือจำนวนแท่งย้อนหลังที่ดึงมาคำนวณ backtest stats (ปรับให้ได้ช่วงเวลาย้อนหลังใกล้เคียงกันในแต่ละกรอบ)

const TIMEFRAMES = [
  { key: "1h", interval: "1h", label: "1 ชั่วโมง", outputsize: 3000 }, // ~125 วัน
  { key: "4h", interval: "4h", label: "4 ชั่วโมง", outputsize: 1500 }, // ~250 วัน
];

module.exports = { TIMEFRAMES };

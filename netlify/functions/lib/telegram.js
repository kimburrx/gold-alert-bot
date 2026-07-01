// telegram.js — ส่งข้อความแจ้งเตือนเข้า Telegram (รันฝั่งเซิร์ฟเวอร์เท่านั้น เพราะ Telegram ปิด CORS เช่นกัน)

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) throw new Error("ไม่พบ TELEGRAM_BOT_TOKEN — ตั้งค่าใน Netlify Site settings > Environment variables");
  if (!chatId) throw new Error("ไม่พบ TELEGRAM_CHAT_ID — ตั้งค่าใน Netlify Site settings > Environment variables");

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await resp.json();
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description || "unknown"}`);
  }
  return data;
}

function formatAlert(signal, row) {
  const arrow = signal === "BUY" ? "📈 BUY" : "📉 SELL";
  return (
    `[Gold Alert] ${arrow} สัญญาณใหม่ XAU/USD\n` +
    `กรอบเวลา: 1 ชั่วโมง (1H)\n` +
    `เวลาแท่งเทียน: ${row.datetime}\n` +
    `ราคาเข้า: ${row.close.toFixed(2)}\n` +
    `EMA20: ${row.ema_fast.toFixed(2)} / EMA50: ${row.ema_slow.toFixed(2)}\n` +
    `RSI14: ${row.rsi.toFixed(1)}\n` +
    `-- ตรวจสอบกราฟด้วยตัวเองก่อนตัดสินใจเสมอ ไม่ใช่คำแนะนำการลงทุน --`
  );
}

// สรุปผลไม้ก่อนหน้าตอนที่มีสัญญาณใหม่มาปิดไม้เดิม
function formatCloseAlert(openPos, row) {
  const isLong = openPos.signal === "BUY";
  const pnlPoints = isLong ? row.close - openPos.entryPrice : openPos.entryPrice - row.close;
  const pnlPct = (pnlPoints / openPos.entryPrice) * 100;
  const result = pnlPoints > 0 ? "✅ กำไร (WIN)" : pnlPoints < 0 ? "❌ ขาดทุน (LOSS)" : "➖ เท่าทุน";
  const posLabel = isLong ? "BUY (long)" : "SELL (short)";

  return (
    `[Gold Alert] ปิดไม้ก่อนหน้า — ${result}\n` +
    `ทิศทาง: ${posLabel}\n` +
    `เข้า: ${openPos.entryPrice.toFixed(2)} (${openPos.entryTime})\n` +
    `ออก: ${row.close.toFixed(2)} (${row.datetime})\n` +
    `กำไร/ขาดทุน: ${pnlPoints >= 0 ? "+" : ""}${pnlPoints.toFixed(2)} จุด (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)\n` +
    `-- คำนวณจากราคาซื้อขายจริง ยังไม่รวมสเปรด/ค่าคอมมิชชั่นของโบรกเกอร์ --`
  );
}

module.exports = { sendTelegramMessage, formatAlert, formatCloseAlert };

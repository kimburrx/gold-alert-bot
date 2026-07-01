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
    `[Gold Alert] ${arrow} สัญญาณ XAU/USD\n` +
    `เวลาแท่งเทียน: ${row.datetime}\n` +
    `ราคาปิด: ${row.close.toFixed(2)}\n` +
    `EMA20: ${row.ema_fast.toFixed(2)} / EMA50: ${row.ema_slow.toFixed(2)}\n` +
    `RSI14: ${row.rsi.toFixed(1)}\n` +
    `-- ตรวจสอบกราฟด้วยตัวเองก่อนตัดสินใจเสมอ ไม่ใช่คำแนะนำการลงทุน --`
  );
}

module.exports = { sendTelegramMessage, formatAlert };

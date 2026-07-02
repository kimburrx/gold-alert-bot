// telegram.js — ส่งข้อความ/รูปแจ้งเตือนเข้า Telegram (รันฝั่งเซิร์ฟเวอร์เท่านั้น เพราะ Telegram ปิด CORS เช่นกัน)

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

// ส่งรูปภาพ (เช่นกราฟ) พร้อมคำบรรยายสั้นๆ — Telegram จำกัด caption ไม่เกิน 1024 ตัวอักษร
// ถ้าอยากส่งรายละเอียดเต็ม ให้ส่ง sendTelegramMessage ตามไปอีกข้อความแยกต่างหาก
async function sendTelegramPhoto(photoUrl, caption) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) throw new Error("ไม่พบ TELEGRAM_BOT_TOKEN — ตั้งค่าใน Netlify Site settings > Environment variables");
  if (!chatId) throw new Error("ไม่พบ TELEGRAM_CHAT_ID — ตั้งค่าใน Netlify Site settings > Environment variables");

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption }),
  });

  const data = await resp.json();
  if (!data.ok) {
    throw new Error(`Telegram sendPhoto error: ${data.description || "unknown"}`);
  }
  return data;
}

function formatStatsBlock(title, stats) {
  if (!stats || stats.totalTrades === 0) {
    return `${title}: ยังไม่มีข้อมูลพอ\n`;
  }
  return (
    `${title}: เกิดมาแล้ว ${stats.totalTrades} ครั้ง ชนะ ${stats.winRatePct}% ` +
    `กำไร/ขาดทุนเฉลี่ยต่อไม้ ${stats.avgPnlPct >= 0 ? "+" : ""}${stats.avgPnlPct}%\n`
  );
}

// slTp: { stopLoss, takeProfit } (optional)
// backtestStats: สถิติจากการจำลองย้อนหลัง (backtest) { totalTrades, winRatePct, avgPnlPct } (optional)
// liveStats: สถิติจริงที่บอทเคยส่งสัญญาณแบบนี้ไปแล้วตั้งแต่เริ่มใช้งาน (สะสมไปเรื่อยๆ) (optional)
// timeframeLabel: ข้อความกรอบเวลา เช่น "15 นาที", "1 ชั่วโมง", "4 ชั่วโมง", "1 วัน"
// strategyInfo: { label, type, level } (optional) — บอกว่าสัญญาณนี้มาจากกลยุทธ์ไหน
//   type: "breakout" | "bounce" | null, level: ราคาแนวรับ/แนวต้านที่เกี่ยวข้อง
function formatAlert(signal, row, slTp, backtestStats, liveStats, timeframeLabel, strategyInfo) {
  const arrow = signal === "BUY" ? "📈 BUY" : "📉 SELL";

  const strategyLine = strategyInfo && strategyInfo.label ? `กลยุทธ์: ${strategyInfo.label}\n` : "";

  let patternLine = "";
  if (strategyInfo && strategyInfo.type === "breakout") {
    const levelName = signal === "BUY" ? "แนวต้าน" : "แนวรับ";
    patternLine = `รูปแบบ: ทะลุ${levelName} ${strategyInfo.level.toFixed(2)} ไปต่อทาง ${signal}\n`;
  } else if (strategyInfo && strategyInfo.type === "bounce") {
    const desc = signal === "BUY" ? `ย่อซื้อที่แนวรับ ${strategyInfo.level.toFixed(2)} (ตามเทรนด์ขาขึ้น)` : `เด้งขายที่แนวต้าน ${strategyInfo.level.toFixed(2)} (ตามเทรนด์ขาลง)`;
    patternLine = `รูปแบบ: ${desc}\n`;
  }

  let msg =
    `[Gold Alert] ${arrow} สัญญาณใหม่ XAU/USD\n` +
    strategyLine +
    `กรอบเวลา: ${timeframeLabel || "1 ชั่วโมง"}\n` +
    patternLine +
    `เวลาแท่งเทียน: ${row.datetime}\n` +
    `ราคาเข้า: ${row.close.toFixed(2)}\n` +
    `EMA20: ${row.ema_fast.toFixed(2)} / EMA50: ${row.ema_slow.toFixed(2)}\n` +
    `RSI14: ${row.rsi.toFixed(1)}\n`;

  if (slTp) {
    msg += `🎯 แนะนำ Take-profit: ${slTp.takeProfit.toFixed(2)}\n`;
    msg += `🛑 แนะนำ Stop-loss: ${slTp.stopLoss.toFixed(2)}\n`;
  }

  if (backtestStats || liveStats) {
    msg += `\n📊 สถิติสัญญาณ ${signal} แบบนี้ (กรอบ ${timeframeLabel || ""}):\n`;
    if (backtestStats) msg += formatStatsBlock("• ย้อนหลัง (backtest จำลอง)", backtestStats);
    if (liveStats) msg += formatStatsBlock("• ของจริงตั้งแต่เปิดบอท (forward)", liveStats);
    msg += `(สถิติอดีต ไม่ใช่การการันตีผลในอนาคต)\n`;
  }

  msg += `-- ตรวจสอบกราฟด้วยตัวเองก่อนตัดสินใจเสมอ ไม่ใช่คำแนะนำการลงทุน --`;

  return msg;
}

// สรุปผลไม้ก่อนหน้าตอนที่มีสัญญาณใหม่มาปิดไม้เดิม
// strategyLabel: ชื่อกลยุทธ์ (optional) ต่อท้ายในหัวข้อความให้รู้ว่าไม้นี้มาจากกลยุทธ์ไหน
function formatCloseAlert(openPos, row, timeframeLabel, strategyLabel) {
  const isLong = openPos.signal === "BUY";
  const pnlPoints = isLong ? row.close - openPos.entryPrice : openPos.entryPrice - row.close;
  const pnlPct = (pnlPoints / openPos.entryPrice) * 100;
  const result = pnlPoints > 0 ? "✅ กำไร (WIN)" : pnlPoints < 0 ? "❌ ขาดทุน (LOSS)" : "➖ เท่าทุน";
  const posLabel = isLong ? "BUY (long)" : "SELL (short)";
  const stratSuffix = strategyLabel ? ` · ${strategyLabel}` : "";

  return (
    `[Gold Alert] ปิดไม้ก่อนหน้า (กรอบ ${timeframeLabel || ""}${stratSuffix}) — ${result}\n` +
    `ทิศทาง: ${posLabel}\n` +
    `เข้า: ${openPos.entryPrice.toFixed(2)} (${openPos.entryTime})\n` +
    `ออก: ${row.close.toFixed(2)} (${row.datetime})\n` +
    `กำไร/ขาดทุน: ${pnlPoints >= 0 ? "+" : ""}${pnlPoints.toFixed(2)} จุด (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)\n` +
    `-- คำนวณจากราคาซื้อขายจริง ยังไม่รวมสเปรด/ค่าคอมมิชชั่นของโบรกเกอร์ --`
  );
}

module.exports = { sendTelegramMessage, sendTelegramPhoto, formatAlert, formatCloseAlert };

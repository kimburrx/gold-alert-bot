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
  if (!stats || stats.totalTrades === 0) return `${title} ข้อมูลน้อยไป\n`;
  return `${title} ${stats.totalTrades} ครั้ง ชนะ ${stats.winRatePct}% เฉลี่ย ${stats.avgPnlPct >= 0 ? "+" : ""}${stats.avgPnlPct}%\n`;
}

// slTp: { stopLoss, takeProfit } (optional)
// backtestStats: สถิติจากการจำลองย้อนหลัง (backtest) { totalTrades, winRatePct, avgPnlPct } (optional)
// liveStats: สถิติจริงที่บอทเคยส่งสัญญาณแบบนี้ไปแล้วตั้งแต่เริ่มใช้งาน (สะสมไปเรื่อยๆ) (optional)
// timeframeLabel: ข้อความกรอบเวลา เช่น "1 ชั่วโมง", "4 ชั่วโมง"
// strategyInfo: { label, type, level } (optional) — บอกว่าสัญญาณนี้มาจากกลยุทธ์ไหน
//   type: "breakout" | "bounce" | null, level: ราคาแนวรับ/แนวต้านที่เกี่ยวข้อง
// analysis: { nextTargetPrice, avgHoldDuration, cautionFlags } (optional) — บทวิเคราะห์เสริม จาก lib/analysis.js
// ข้อความแบบกระชับ: เอาแต่ตัวเลข/เหตุผลที่ตัดสินใจได้จริง ตัดส่วนอธิบายซ้ำ/ฟุ่มเฟือยออก
function formatAlert(signal, row, slTp, backtestStats, liveStats, timeframeLabel, strategyInfo, analysis) {
  const arrow = signal === "BUY" ? "📈 BUY" : "📉 SELL";

  let patternLine = "";
  if (strategyInfo && strategyInfo.type === "breakout") {
    const levelName = signal === "BUY" ? "แนวต้าน" : "แนวรับ";
    patternLine = `ทะลุ${levelName} ${strategyInfo.level.toFixed(2)}\n`;
  } else if (strategyInfo && strategyInfo.type === "bounce") {
    const desc = signal === "BUY" ? `ย่อซื้อที่แนวรับ ${strategyInfo.level.toFixed(2)}` : `เด้งขายที่แนวต้าน ${strategyInfo.level.toFixed(2)}`;
    patternLine = `${desc}\n`;
  }

  let msg =
    `[Gold Alert] ${arrow} XAU/USD (${timeframeLabel || "1 ชั่วโมง"}${strategyInfo && strategyInfo.label ? " · " + strategyInfo.label : ""})\n` +
    patternLine +
    `เข้า: ${row.close.toFixed(2)} | EMA20/50: ${row.ema_fast.toFixed(2)}/${row.ema_slow.toFixed(2)} | RSI: ${row.rsi.toFixed(1)}\n`;

  if (slTp) {
    msg += `🎯 TP ${slTp.takeProfit.toFixed(2)}  🛑 SL ${slTp.stopLoss.toFixed(2)}\n`;
  }

  if (backtestStats || liveStats) {
    msg += `\n📊 สถิติ ${signal} แบบนี้:\n`;
    if (backtestStats) msg += formatStatsBlock("• ย้อนหลัง:", backtestStats);
    if (liveStats) msg += formatStatsBlock("• ของจริง:", liveStats);
  }

  if (analysis && (analysis.nextTargetPrice != null || analysis.avgHoldDuration)) {
    const parts = [];
    if (analysis.nextTargetPrice != null) parts.push(`เป้าถัดไป ${analysis.nextTargetPrice.toFixed(2)}`);
    if (analysis.avgHoldDuration) parts.push(`ถือเฉลี่ย ${analysis.avgHoldDuration}`);
    msg += `📐 ${parts.join(" | ")}\n`;
  }

  if (analysis && analysis.cautionFlags && analysis.cautionFlags.length > 0) {
    msg += `⚠️ ${analysis.cautionFlags.join(" / ")}\n`;
  }

  msg += `-- เช็คกราฟเองก่อนเข้า ไม่ใช่คำแนะนำการลงทุน --`;

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
    `[Gold Alert] ปิดไม้ (${timeframeLabel || ""}${stratSuffix}) ${result}\n` +
    `${posLabel} | เข้า ${openPos.entryPrice.toFixed(2)} → ออก ${row.close.toFixed(2)}\n` +
    `${pnlPoints >= 0 ? "+" : ""}${pnlPoints.toFixed(2)} จุด (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%) — ยังไม่รวมสเปรด/ค่าคอมฯ`
  );
}

module.exports = { sendTelegramMessage, sendTelegramPhoto, formatAlert, formatCloseAlert };

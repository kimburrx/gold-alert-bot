// check.js — endpoint สำหรับหน้าเว็บเรียกดูสถานะราคาปัจจุบัน (ไม่ส่ง Telegram อัตโนมัติ)
// เรียกผ่าน: GET /.netlify/functions/check
// ถ้าอยากทดสอบส่งข้อความจริง: GET /.netlify/functions/check?sendTest=1

const { getStore } = require("@netlify/blobs");
const { fetchOhlc } = require("./lib/twelvedata");
const { computeIndicators, detectSignal } = require("./lib/indicators");
const { sendTelegramMessage, formatAlert } = require("./lib/telegram");

exports.handler = async (event) => {
  try {
    const bars = await fetchOhlc({ outputsize: 200 });
    const withIndicators = computeIndicators(bars);
    const { signal, row } = detectSignal(withIndicators);

    let testMessageResult = null;
    const sendTest = event.queryStringParameters && event.queryStringParameters.sendTest;
    if (sendTest) {
      const message = signal
        ? formatAlert(signal, row)
        : `[Gold Alert] ทดสอบการเชื่อมต่อ — ยังไม่มีสัญญาณตอนนี้\nราคาปิดล่าสุด: ${row.close.toFixed(2)}`;
      await sendTelegramMessage(message);
      testMessageResult = "sent";
    }

    // ดึงไม้ที่เปิดอยู่ (ถ้ามี) มาโชว์กำไร/ขาดทุนที่ยังไม่ปิดให้ดูด้วย
    let openPosition = null;
    try {
      const store = getStore("gold-bot-state");
      const raw = await store.get("open_position");
      if (raw) {
        const pos = JSON.parse(raw);
        const pnlPoints = pos.signal === "BUY" ? row.close - pos.entryPrice : pos.entryPrice - row.close;
        const pnlPct = (pnlPoints / pos.entryPrice) * 100;
        openPosition = {
          signal: pos.signal,
          entryPrice: pos.entryPrice,
          entryTime: pos.entryTime,
          unrealizedPnlPoints: Number(pnlPoints.toFixed(2)),
          unrealizedPnlPct: Number(pnlPct.toFixed(2)),
        };
      }
    } catch (e) {
      // ไม่มี Blobs หรืออ่านไม่ได้ ไม่เป็นไร แค่ไม่โชว์ส่วนนี้
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        checkedAt: new Date().toISOString(),
        price: Number(row.close.toFixed(2)),
        emaFast: Number(row.ema_fast.toFixed(2)),
        emaSlow: Number(row.ema_slow.toFixed(2)),
        rsi: Number(row.rsi.toFixed(1)),
        signal,
        testMessageResult,
        openPosition,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};

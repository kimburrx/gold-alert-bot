// check.js — endpoint สำหรับหน้าเว็บเรียกดูสถานะราคาปัจจุบันของทุกกรอบเวลา (ไม่ส่ง Telegram อัตโนมัติ)
// เรียกผ่าน: GET /.netlify/functions/check
// ถ้าอยากทดสอบส่งข้อความจริง (เฉพาะกรอบ 1h): GET /.netlify/functions/check?sendTest=1

const { getStore } = require("@netlify/blobs");
const { fetchOhlc } = require("./lib/twelvedata");
const { computeIndicators, detectSignal } = require("./lib/indicators");
const { sendTelegramMessage, formatAlert } = require("./lib/telegram");
const { TIMEFRAMES } = require("./lib/timeframes");

exports.handler = async (event) => {
  try {
    const store = getStore("gold-bot-state");
    const timeframeResults = [];
    let testMessageResult = null;
    const sendTest = event.queryStringParameters && event.queryStringParameters.sendTest;

    for (const tf of TIMEFRAMES) {
      const bars = await fetchOhlc({ interval: tf.interval, outputsize: 200 });
      const withIndicators = computeIndicators(bars);
      const { signal, row } = detectSignal(withIndicators);

      if (sendTest && tf.key === "1h") {
        const message = signal
          ? formatAlert(signal, row, null, null, null, tf.label)
          : `[Gold Alert] ทดสอบการเชื่อมต่อ — ยังไม่มีสัญญาณตอนนี้ (กรอบ ${tf.label})\nราคาปิดล่าสุด: ${row.close.toFixed(2)}`;
        await sendTelegramMessage(message);
        testMessageResult = "sent";
      }

      // ดึงไม้ที่เปิดอยู่ของกรอบนี้ (ถ้ามี) มาโชว์กำไร/ขาดทุนที่ยังไม่ปิดให้ดูด้วย
      let openPosition = null;
      try {
        const raw = await store.get(`open_position_${tf.key}`);
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

      timeframeResults.push({
        key: tf.key,
        label: tf.label,
        price: Number(row.close.toFixed(2)),
        emaFast: Number(row.ema_fast.toFixed(2)),
        emaSlow: Number(row.ema_slow.toFixed(2)),
        rsi: Number(row.rsi.toFixed(1)),
        signal,
        openPosition,
      });
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        checkedAt: new Date().toISOString(),
        timeframes: timeframeResults,
        testMessageResult,
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

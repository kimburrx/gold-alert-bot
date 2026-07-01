// check.js — endpoint สำหรับหน้าเว็บเรียกดูสถานะราคาปัจจุบัน (ไม่ส่ง Telegram อัตโนมัติ)
// เรียกผ่าน: GET /.netlify/functions/check
// ถ้าอยากทดสอบส่งข้อความจริง: GET /.netlify/functions/check?sendTest=1

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

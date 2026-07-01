// check-scheduled.js — รันอัตโนมัติทุกชั่วโมงตามที่ตั้งไว้ใน netlify.toml (schedule = "@hourly")
// เช็คราคา + สัญญาณ แล้วส่ง Telegram เฉพาะตอนสัญญาณเปลี่ยนจากครั้งก่อน (กันแจ้งเตือนซ้ำ)
// เก็บ "ไม้ที่เปิดอยู่" (open_position) ไว้ใน Netlify Blobs เพราะ Function เป็น stateless คนละ instance กันทุกครั้งที่รัน
// พอมีสัญญาณใหม่มาสวนทางกับไม้เดิม จะสรุปผลไม้เดิม (กำไร/ขาดทุน) ก่อน แล้วค่อยเปิดไม้ใหม่

const { getStore } = require("@netlify/blobs");
const { fetchOhlc } = require("./lib/twelvedata");
const { computeIndicators, detectSignal } = require("./lib/indicators");
const { sendTelegramMessage, formatAlert, formatCloseAlert } = require("./lib/telegram");

exports.handler = async () => {
  try {
    const bars = await fetchOhlc({ outputsize: 200 });
    const withIndicators = computeIndicators(bars);
    const { signal, row } = detectSignal(withIndicators);

    if (!signal) {
      return { statusCode: 200, body: "no signal" };
    }

    const store = getStore("gold-bot-state");
    const openPosRaw = await store.get("open_position");
    const openPos = openPosRaw ? JSON.parse(openPosRaw) : null;

    if (openPos && openPos.signal === signal) {
      return { statusCode: 200, body: `signal ${signal} already notified, position still open` };
    }

    // ถ้ามีไม้เปิดอยู่แล้วสัญญาณใหม่สวนทาง ให้สรุปผลไม้เดิมก่อน
    if (openPos) {
      const closeMessage = formatCloseAlert(openPos, row);
      await sendTelegramMessage(closeMessage);
    }

    // เปิดไม้ใหม่ตามสัญญาณล่าสุด
    const entryMessage = formatAlert(signal, row);
    await sendTelegramMessage(entryMessage);

    await store.set(
      "open_position",
      JSON.stringify({ signal, entryPrice: row.close, entryTime: row.datetime })
    );

    return { statusCode: 200, body: `sent ${signal} alert` };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: err.message };
  }
};

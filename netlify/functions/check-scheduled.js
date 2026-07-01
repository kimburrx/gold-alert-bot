// check-scheduled.js — รันอัตโนมัติทุกชั่วโมงตามที่ตั้งไว้ใน netlify.toml (schedule = "@hourly")
// เช็คราคา + สัญญาณ แล้วส่ง Telegram เฉพาะตอนสัญญาณเปลี่ยนจากครั้งก่อน (กันแจ้งเตือนซ้ำ)
// ใช้ Netlify Blobs เก็บ "สัญญาณล่าสุดที่แจ้งไปแล้ว" เพราะ Function เป็น stateless คนละ instance กันทุกครั้งที่รัน

const { getStore } = require("@netlify/blobs");
const { fetchOhlc } = require("./lib/twelvedata");
const { computeIndicators, detectSignal } = require("./lib/indicators");
const { sendTelegramMessage, formatAlert } = require("./lib/telegram");

exports.handler = async () => {
  try {
    const bars = await fetchOhlc({ outputsize: 200 });
    const withIndicators = computeIndicators(bars);
    const { signal, row } = detectSignal(withIndicators);

    if (!signal) {
      return { statusCode: 200, body: "no signal" };
    }

    const store = getStore("gold-bot-state");
    const lastSignal = await store.get("last_signal");

    if (signal === lastSignal) {
      return { statusCode: 200, body: `signal ${signal} already notified` };
    }

    const message = formatAlert(signal, row);
    await sendTelegramMessage(message);
    await store.set("last_signal", signal);

    return { statusCode: 200, body: `sent ${signal} alert` };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: err.message };
  }
};

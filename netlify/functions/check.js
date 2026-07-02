// check.js — endpoint สำหรับหน้าเว็บเรียกดูสถานะราคาปัจจุบันของทุกกรอบเวลา x ทุกกลยุทธ์ (ไม่ส่ง Telegram อัตโนมัติ)
// เรียกผ่าน: GET /.netlify/functions/check
// ถ้าอยากทดสอบส่งข้อความจริง (เฉพาะกรอบ 1h กลยุทธ์เทรนด์): GET /.netlify/functions/check?sendTest=1

const { getBotStore } = require("./lib/store");
const { fetchOhlc } = require("./lib/twelvedata");
const { computeIndicators } = require("./lib/indicators");
const { sendTelegramMessage, formatAlert } = require("./lib/telegram");
const { TIMEFRAMES } = require("./lib/timeframes");
const { STRATEGIES } = require("./lib/strategies");
const { watchTrend, watchSr } = require("./lib/watchSignals");
const { srLevelsAt, LOOKBACK } = require("./lib/srSignals");

exports.handler = async (event) => {
  try {
    const store = getBotStore();
    const timeframeResults = [];
    let testMessageResult = null;
    const sendTest = event.queryStringParameters && event.queryStringParameters.sendTest;

    for (const tf of TIMEFRAMES) {
      const bars = await fetchOhlc({ interval: tf.interval, outputsize: 200 });
      const withIndicators = computeIndicators(bars);
      const lastRow = withIndicators[withIndicators.length - 1];

      const strategyResults = [];
      for (const strategy of STRATEGIES) {
        // ดึงไม้ที่เปิดอยู่ของกรอบ+กลยุทธ์นี้ก่อน (ถ้ามี) ทั้งเพื่อโชว์กำไร/ขาดทุนที่ยังไม่ปิด
        // และเพื่อบอก strategy.detect() ว่ายังไม่เคยมีไม้เปิดมาก่อนหรือเปล่า (ใช้เปิดโหมด "จับตามทัน")
        let openPosition = null;
        let hasOpenPosition = false;
        try {
          const raw = await store.get(`open_position_${tf.key}_${strategy.key}`);
          if (raw) {
            hasOpenPosition = true;
            const pos = JSON.parse(raw);
            const pnlPoints = pos.signal === "BUY" ? withIndicators[withIndicators.length - 1].close - pos.entryPrice : pos.entryPrice - withIndicators[withIndicators.length - 1].close;
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

        const { signal, type, level, row } = strategy.detect(withIndicators, hasOpenPosition);

        if (sendTest && tf.key === "1h" && strategy.key === "trend") {
          const message = signal
            ? formatAlert(signal, row, null, null, null, tf.label, { label: strategy.label, type, level })
            : `[Gold Alert] ทดสอบการเชื่อมต่อ — ยังไม่มีสัญญาณตอนนี้ (กรอบ ${tf.label})\nราคาปิดล่าสุด: ${row.close.toFixed(2)}`;
          await sendTelegramMessage(message);
          testMessageResult = "sent";
        }

        strategyResults.push({
          key: strategy.key,
          label: strategy.label,
          signal,
          type,
          level: level != null ? Number(level.toFixed(2)) : null,
          openPosition,
        });
      }

      const trendWatch = watchTrend(withIndicators);
      const srWatch = watchSr(withIndicators, srLevelsAt, LOOKBACK);

      timeframeResults.push({
        key: tf.key,
        label: tf.label,
        price: Number(lastRow.close.toFixed(2)),
        emaFast: Number(lastRow.ema_fast.toFixed(2)),
        emaSlow: Number(lastRow.ema_slow.toFixed(2)),
        rsi: Number(lastRow.rsi.toFixed(1)),
        strategies: strategyResults,
        watch: {
          trend: trendWatch ? trendWatch.message : null,
          sr: srWatch ? srWatch.message : null,
        },
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

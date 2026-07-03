// check-scheduled.js — รันอัตโนมัติทุก 15 นาทีตามที่ตั้งไว้ใน netlify.toml
// เช็คทีละกรอบเวลา (15min, 1h, 4h, 1day) x ทีละกลยุทธ์ (เทรนด์ EMA/RSI, แนวรับ-แนวต้าน) แยกจากกันอิสระ
// แต่ละกรอบเวลา+กลยุทธ์ มี "ไม้ที่เปิดอยู่" ของตัวเอง ดึงราคาแค่ครั้งเดียวต่อกรอบเวลาแล้วเอาไปเช็คทุกกลยุทธ์ (ประหยัด API credit)
// ส่ง Telegram เฉพาะตอนสัญญาณของกรอบ+กลยุทธ์นั้นเปลี่ยนจากครั้งก่อน (กันแจ้งเตือนซ้ำ)

const { getBotStore } = require("./lib/store");
const { fetchOhlc } = require("./lib/twelvedata");
const { computeIndicators, computeSlTp } = require("./lib/indicators");
const { simulateTrades, summarizeByEntrySignal } = require("./lib/backtestCore");
const { sendTelegramMessage, sendTelegramPhoto, formatAlert, formatCloseAlert } = require("./lib/telegram");
const { buildChartImageUrl } = require("./lib/chart");
const { TIMEFRAMES } = require("./lib/timeframes");
const { STRATEGIES } = require("./lib/strategies");
const { watchTrend, watchSr } = require("./lib/watchSignals");
const { srLevelsAt, LOOKBACK } = require("./lib/srSignals");
const { formatDuration, avgHoldingDuration, nextTarget, cautionFlags } = require("./lib/analysis");

const MAX_LIVE_HISTORY = 500; // กันไม่ให้ Blobs โตไม่มีที่สิ้นสุด

// แจ้งเตือน "จับตา" ล่วงหน้า ก่อนสัญญาณจริงจะเกิด — ส่งครั้งเดียวต่อรอบที่เข้าเงื่อนไข (ไม่สแปมทุก 15 นาที)
// ใช้ flag ใน Blobs เก็บว่ากำลัง "จับตาอยู่" หรือไม่ พอเงื่อนไขหายไป (ไกลออกจากจุดนั้นแล้ว) จะรีเซ็ต ให้เตือนใหม่ได้รอบหน้า
// จำกัดไว้เฉพาะกรอบ 4H เท่านั้น (เดิมมีทั้ง 1H/4H แต่รก+ถี่เกินไป) เพราะเป็นกรอบเดียวที่ระยะเวลาก่อนแท่งปิด
// ยาวพอจะให้ "เตือนล่วงหน้าจริง" มีความหมาย โดยไม่แจ้งถี่จนกวนใจ
async function processWatch(tf, withIndicators, store) {
  if (tf.key !== "4h") return [];
  const messages = [];

  const trendKey = `watch_trend_${tf.key}`;
  const trendWatch = watchTrend(withIndicators);
  const trendFlag = await store.get(trendKey);
  if (trendWatch && !trendFlag) {
    await sendTelegramMessage(`[Gold Watch] 👀 (${tf.label}·เทรนด์) ${trendWatch.message} | ราคา ${trendWatch.row.close.toFixed(2)}`);
    await store.set(trendKey, "1");
    messages.push(`[${tf.key}/trend] watch sent`);
  } else if (!trendWatch && trendFlag) {
    await store.set(trendKey, "");
  }

  const srKey = `watch_sr_${tf.key}`;
  const srWatch = watchSr(withIndicators, srLevelsAt, LOOKBACK);
  const srFlag = await store.get(srKey);
  if (srWatch && !srFlag) {
    await sendTelegramMessage(`[Gold Watch] 👀 (${tf.label}·แนวรับ-แนวต้าน) ${srWatch.message} | ราคา ${srWatch.row.close.toFixed(2)}`);
    await store.set(srKey, "1");
    messages.push(`[${tf.key}/sr] watch sent`);
  } else if (!srWatch && srFlag) {
    await store.set(srKey, "");
  }

  return messages;
}

async function processStrategy(tf, strategy, withIndicators, store) {
  const posKey = `open_position_${tf.key}_${strategy.key}`;
  const historyKey = `live_trade_history_${tf.key}_${strategy.key}`;

  const openPosRaw = await store.get(posKey);
  const openPos = openPosRaw ? JSON.parse(openPosRaw) : null;

  const { signal, type, level, row } = strategy.detect(withIndicators, !!openPos);

  if (!signal) {
    return `[${tf.key}/${strategy.key}] no signal`;
  }

  if (openPos && openPos.signal === signal) {
    return `[${tf.key}/${strategy.key}] signal ${signal} already notified, position still open`;
  }

  const liveHistoryRaw = await store.get(historyKey);
  let liveHistory = liveHistoryRaw ? JSON.parse(liveHistoryRaw) : [];

  // ถ้ามีไม้เปิดอยู่แล้วสัญญาณใหม่สวนทาง ให้สรุปผลไม้เดิมก่อน แล้วบันทึกผลจริงลงประวัติสะสม
  if (openPos) {
    const closeMessage = formatCloseAlert(openPos, row, tf.label, strategy.label);
    await sendTelegramMessage(closeMessage);

    const isLong = openPos.signal === "BUY";
    const pnlPct = isLong
      ? ((row.close - openPos.entryPrice) / openPos.entryPrice) * 100
      : ((openPos.entryPrice - row.close) / openPos.entryPrice) * 100;

    liveHistory.push({
      type: isLong ? "LONG" : "SHORT",
      entrySignal: openPos.signal,
      entry: openPos.entryPrice,
      exit: row.close,
      entryTime: openPos.entryTime,
      exitTime: row.datetime,
      pnlPct,
    });
    if (liveHistory.length > MAX_LIVE_HISTORY) {
      liveHistory = liveHistory.slice(-MAX_LIVE_HISTORY);
    }
    await store.set(historyKey, JSON.stringify(liveHistory));
  }

  // คำนวณจุด stop-loss / take-profit แนะนำ จาก ATR ปัจจุบัน (ใช้สูตรเดียวกันทุกกลยุทธ์)
  const slTp = computeSlTp(signal, row.close, row.atr);

  // สถิติ backtest ของกลยุทธ์นี้ (จำลองย้อนหลังจากข้อมูลชุดที่เพิ่งดึงมา ไม่ต้องยิง API เพิ่ม)
  const allSignals = strategy.generateAll(withIndicators);
  const backtestTrades = simulateTrades(allSignals);
  const backtestStatsByType = summarizeByEntrySignal(backtestTrades);

  // สถิติของจริงที่บอทเคยส่งสัญญาณแบบนี้ไปแล้ว สะสมตั้งแต่เริ่มใช้งาน (แยกตามกรอบเวลา+กลยุทธ์)
  const liveStatsByType = summarizeByEntrySignal(liveHistory);

  const strategyInfo = { label: strategy.label, type, level };

  // บทวิเคราะห์เสริม: เป้าหมายถัดไปจากแนวรับ-แนวต้านที่กว้างกว่า, ระยะเวลาถือครองเฉลี่ยจาก backtest จริง, ข้อควรระวัง
  const analysis = {
    nextTargetPrice: nextTarget(signal, row.close, srLevelsAt, withIndicators),
    avgHoldDuration: formatDuration(avgHoldingDuration(backtestTrades, signal)),
    cautionFlags: cautionFlags({ signal, row, backtestStats: backtestStatsByType[signal] }),
  };

  const entryMessage = formatAlert(
    signal,
    row,
    slTp,
    backtestStatsByType[signal],
    liveStatsByType[signal],
    tf.label,
    strategyInfo,
    analysis
  );

  // สร้างรูปกราฟตอนเกิดสัญญาณ แล้วส่งเป็นรูปก่อน ตามด้วยข้อความรายละเอียด
  try {
    const chartLabel = `${tf.label} · ${strategy.label}`;
    const chartUrl = await buildChartImageUrl(withIndicators, signal, row.close, chartLabel);
    const shortCaption = `${signal === "BUY" ? "📈 BUY" : "📉 SELL"} XAU/USD (${chartLabel}) ที่ ${row.close.toFixed(2)}`;
    await sendTelegramPhoto(chartUrl, shortCaption);
  } catch (chartErr) {
    console.error(`[${tf.key}/${strategy.key}] สร้าง/ส่งรูปกราฟไม่สำเร็จ:`, chartErr.message);
    // ไม่ให้ทั้งฟังก์ชันล้มเหลวแค่เพราะรูปกราฟมีปัญหา ยังส่งข้อความหลักต่อได้
  }

  await sendTelegramMessage(entryMessage);

  await store.set(posKey, JSON.stringify({ signal, entryPrice: row.close, entryTime: row.datetime }));

  return `[${tf.key}/${strategy.key}] sent ${signal} alert`;
}

async function processTimeframe(tf, store) {
  const bars = await fetchOhlc({ interval: tf.interval, outputsize: tf.outputsize });
  const withIndicators = computeIndicators(bars);

  const results = [];
  for (const strategy of STRATEGIES) {
    try {
      const r = await processStrategy(tf, strategy, withIndicators, store);
      results.push(r);
    } catch (err) {
      console.error(`[${tf.key}/${strategy.key}] error:`, err);
      results.push(`[${tf.key}/${strategy.key}] error: ${err.message}`);
    }
  }

  try {
    const watchResults = await processWatch(tf, withIndicators, store);
    results.push(...(watchResults.length ? watchResults : [`[${tf.key}] watch: nothing new`]));
  } catch (err) {
    console.error(`[${tf.key}] watch error:`, err);
    results.push(`[${tf.key}] watch error: ${err.message}`);
  }

  return results.join(" | ");
}

exports.handler = async () => {
  const store = getBotStore();
  const results = [];

  for (const tf of TIMEFRAMES) {
    try {
      const r = await processTimeframe(tf, store);
      results.push(r);
    } catch (err) {
      console.error(`[${tf.key}] error:`, err);
      results.push(`[${tf.key}] error: ${err.message}`);
    }
  }

  return { statusCode: 200, body: results.join(" | ") };
};

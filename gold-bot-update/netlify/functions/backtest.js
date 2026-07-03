// backtest.js — ทดสอบย้อนหลังกลยุทธ์ EMA/RSI ด้วยข้อมูลจริง
// เรียกผ่าน: GET /.netlify/functions/backtest?outputsize=3000

const { fetchOhlc } = require("./lib/twelvedata");
const { computeIndicators, generateAllSignals } = require("./lib/indicators");
const { simulateTrades, summarize, summarizeByEntrySignal } = require("./lib/backtestCore");

exports.handler = async (event) => {
  try {
    const outputsize = parseInt((event.queryStringParameters && event.queryStringParameters.outputsize) || "3000", 10);
    const bars = await fetchOhlc({ outputsize });
    const withIndicators = computeIndicators(bars);
    const signals = generateAllSignals(withIndicators);
    const trades = simulateTrades(signals);
    const stats = summarize(trades);
    const statsByType = summarizeByEntrySignal(trades);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        rangeStart: bars[0].datetime,
        rangeEnd: bars[bars.length - 1].datetime,
        stats,
        statsByType,
        recentTrades: trades.slice(-5),
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

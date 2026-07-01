// chart.js — สร้างรูปกราฟแท่งเทียน (candlestick) + EMA20/EMA50 ตอนที่เกิดสัญญาณ ผ่าน QuickChart.io (บริการฟรี)
// คืนค่าเป็น URL รูปภาพที่ส่งให้ Telegram แสดงเป็นรูปได้เลย

async function buildChartImageUrl(bars, signal, entryPrice, timeframeLabel) {
  // เอาแค่ N แท่งล่าสุด ไม่งั้นกราฟจะรกและ config ใหญ่เกินไป
  const N = 60;
  const recent = bars.slice(-N);

  const config = {
    type: "candlestick",
    data: {
      datasets: [
        {
          label: "XAU/USD",
          type: "candlestick",
          data: recent.map((b) => ({
            x: b.datetime,
            o: Number(b.open.toFixed(2)),
            h: Number(b.high.toFixed(2)),
            l: Number(b.low.toFixed(2)),
            c: Number(b.close.toFixed(2)),
          })),
        },
        {
          label: "EMA20",
          type: "line",
          data: recent.map((b) => ({ x: b.datetime, y: Number(b.ema_fast.toFixed(2)) })),
          borderColor: "#2563eb",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
        {
          label: "EMA50",
          type: "line",
          data: recent.map((b) => ({ x: b.datetime, y: Number(b.ema_slow.toFixed(2)) })),
          borderColor: "#dc2626",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `XAU/USD (${timeframeLabel || "1H"}) — สัญญาณ ${signal} ที่ ${entryPrice.toFixed(2)}`,
        },
        legend: { display: true, position: "bottom" },
      },
      scales: {
        x: { type: "timeseries", ticks: { maxTicksLimit: 8 } },
        y: {},
      },
    },
  };

  const resp = await fetch("https://quickchart.io/chart/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: "3", chart: config, width: 900, height: 450, backgroundColor: "white" }),
  });

  const data = await resp.json();
  if (!data.success) {
    throw new Error("QuickChart error: " + JSON.stringify(data));
  }
  return data.url;
}

module.exports = { buildChartImageUrl };

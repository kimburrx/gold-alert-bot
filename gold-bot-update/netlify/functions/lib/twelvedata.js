// twelvedata.js — ดึงราคาทองคำ (XAU/USD) จาก TwelveData
// รันฝั่งเซิร์ฟเวอร์ (ใน Netlify Function) เท่านั้น เพราะ TwelveData ปิด CORS ไม่ให้เบราว์เซอร์เรียกตรง

async function fetchOhlc({ symbol = "XAU/USD", interval = "1h", outputsize = 1000 } = {}) {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    throw new Error("ไม่พบ TWELVEDATA_API_KEY — ตั้งค่าใน Netlify Site settings > Environment variables");
  }

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(outputsize));
  url.searchParams.set("order", "ASC");
  url.searchParams.set("apikey", apiKey);

  const resp = await fetch(url.toString());
  const data = await resp.json();

  if (data.status === "error") {
    throw new Error(`TwelveData API error: ${data.message}`);
  }
  if (!data.values) {
    throw new Error("TwelveData ไม่คืนข้อมูลราคามาให้ (ตรวจสอบ API key / เครดิตคงเหลือ)");
  }

  return data.values
    .map((v) => ({
      datetime: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }))
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
}

module.exports = { fetchOhlc };

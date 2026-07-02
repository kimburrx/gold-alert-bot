// store.js — เปิด Netlify Blobs store สำหรับเก็บสถานะบอท (ไม้ที่เปิดอยู่ / ประวัติสะสม)
//
// ปกติ @netlify/blobs ควรตั้งค่าตัวเองอัตโนมัติเมื่อรันใน Netlify Functions
// แต่บางเว็บ (โดยเฉพาะที่เพิ่ง deploy ใหม่ หรือ Blobs ยังไม่ได้เปิดใช้ในโปรเจกต์) จะเจอ error
// "The environment has not been configured to use Netlify Blobs"
// วิธีแก้คือใส่ siteID + token ให้ตรงๆ ผ่าน environment variables (ไม่บังคับ ใส่เฉพาะตอนเจอ error นี้)
//
// วิธีหาค่า:
//   BLOB_SITE_ID  = Netlify > Project configuration > General > Project information > Project ID
//   BLOB_AUTH_TOKEN = Netlify > User settings > Applications > Personal access tokens > New access token

const { getStore } = require("@netlify/blobs");

function getBotStore() {
  const siteID = process.env.BLOB_SITE_ID;
  const token = process.env.BLOB_AUTH_TOKEN;

  if (siteID && token) {
    return getStore({ name: "gold-bot-state", siteID, token });
  }

  // โหมดอัตโนมัติ (ใช้ได้กับ Netlify ส่วนใหญ่ ถ้าไม่ error ก็ไม่ต้องตั้งค่าเพิ่ม)
  return getStore("gold-bot-state");
}

module.exports = { getBotStore };

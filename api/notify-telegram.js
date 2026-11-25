const admin = require("firebase-admin");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_DEV_CHAT_ID = process.env.TELEGRAM_DEV_CHAT_ID;
const OCR_API_KEY = process.env.OCR_API_KEY;

let _app;
function getApp() {
  if (_app) return _app;
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  _app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(sa) });
  return _app;
}
function getDb() { getApp(); return admin.firestore(); }

async function sendTelegram(payload) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  return res.json();
}

async function sendTelegramPhoto(payload) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  return res.json();
}

async function processOCR(fileUrl) {
  const formData = new URLSearchParams();
  formData.append("apikey", OCR_API_KEY);
  formData.append("url", fileUrl);
  formData.append("language", "eng");
  
  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST", body: formData
  });
  const data = await res.json();
  if (data.IsErroredOnProcessing) throw new Error("OCR gagal");
  return data.ParsedResults[0].ParsedText.toLowerCase();
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  
  try {
    const { transactionId, photoUrl } = req.body || {};
    if (!transactionId) return res.status(400).json({ error: "transactionId required" });
    
    const db = getDb();
    const txRef = db.collection("transactions").doc(transactionId);
    const txSnap = await txRef.get();
    if (!txSnap.exists) return res.status(404).json({ error: "Transaction not found" });
    const tx = txSnap.data();

    let isAutoAccepted = false;
    let reason = "No Photo URL provided";

    if (photoUrl && OCR_API_KEY) {
      try {
        const ocrText = await processOCR(photoUrl);
        const cleanRef = (tx.transactionRef || "").toLowerCase().replace(/\s/g, "");
        const cleanDate = (tx.transactionDate || "").replace(/-/g, "/");
        
        const dateParts = cleanDate.split("/");
        const dateStr1 = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        const dateStr2 = `${dateParts[1]}/${dateParts[2]}/${dateParts[0]}`;
        
        const refMatch = ocrText.includes(cleanRef);
        const dateMatch = ocrText.includes(dateStr1) || ocrText.includes(dateStr2);

        if (refMatch && dateMatch) {
          isAutoAccepted = true;
          reason = "Auto ACC: Tanggal & Ref cocok";
        } else {
          reason = "Butuh Manual: OCR teks tidak cocok";
        }
      } catch (err) {
        reason = "Butuh Manual: OCR Error (" + err.message + ")";
      }
    } else {
      reason = "Butuh Manual: Tanpa foto / API OCR kosong";
    }

    const baseMsg = `🔔 *TRANSAKSI BARU*\n\n👤 User: \`${tx.username || "-"}\`\n🆔 appuid: \`${tx.appuid || tx.uid || "-"}\`\n💸 Nama: ${tx.senderName || "-"}\n📅 Tanggal: ${tx.transactionDate || "-"}\n🔢 Ref: \`${tx.transactionRef || "-"}\`\n💰 Nominal: ${tx.amount || "-"}`;

    if (isAutoAccepted) {
      const batch = db.batch();
      batch.update(txRef, { status: "approved", approvedAt: admin.firestore.FieldValue.serverTimestamp(), autoApproved: true });
      batch.update(db.collection("users").doc(tx.uid), { role: "vip", status: "active" });
      await batch.commit();

      if (photoUrl) {
        await sendTelegramPhoto({ chat_id: TELEGRAM_DEV_CHAT_ID, photo: photoUrl, caption: baseMsg + `\n\n✅ *AUTO-ACCEPTED*\nTeks OCR cocok.`, parse_mode: "Markdown" });
      } else {
        await sendTelegram({ chat_id: TELEGRAM_DEV_CHAT_ID, text: baseMsg + `\n\n✅ *AUTO-ACCEPTED*`, parse_mode: "Markdown" });
      }
      return res.status(200).json({ ok: true, status: "auto_approved" });
      
    } else {
      if (photoUrl) {
        await sendTelegramPhoto({ 
          chat_id: TELEGRAM_DEV_CHAT_ID, photo: photoUrl, caption: baseMsg + `\n\n⚠️ *PERLU CEK MANUAL*\nAlasan: ${reason}`, parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "✅ ACC VIP", callback_data: `approve:${transactionId}:${tx.uid}` }, { text: "❌ Tolak", callback_data: `reject:${transactionId}:${tx.uid}` }]] }
        });
      } else {
        await sendTelegram({ 
          chat_id: TELEGRAM_DEV_CHAT_ID, text: baseMsg + `\n\n⚠️ *PERLU CEK MANUAL*\nAlasan: ${reason}`, parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "✅ ACC VIP", callback_data: `approve:${transactionId}:${tx.uid}` }, { text: "❌ Tolak", callback_data: `reject:${transactionId}:${tx.uid}` }]] }
        });
      }
      return res.status(200).json({ ok: true, status: "manual_review", reason });
    }
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

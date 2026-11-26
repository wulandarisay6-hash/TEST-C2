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
  formData.append("isOverlayRequired", "false");
  
  const res = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: formData });
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
    let reason = "Tanpa foto / OCR gagal";

    if (photoUrl && OCR_API_KEY) {
      try {
        const ocrText = await processOCR(photoUrl);
        
        // LOGIKA BARU: Cari kata kunci sukses transfer
        const keywords = ["berhasil", "sukses", "transfer", "diterima", "success", "completed"];
        const hasKeyword = keywords.some(k => ocrText.includes(k));
        
        // Cari nominal (50.000, 50rb, 50000, rp50)
        const hasAmount = ocrText.includes("50.000") || ocrText.includes("50000") || ocrText.includes("50rb") || ocrText.includes("rp 50") || ocrText.includes("rp50");

        if (hasKeyword && hasAmount) {
          isAutoAccepted = true;
          reason = "Auto ACC: Terdeteksi kata transfer & nominal.";
        } else {
          reason = `Manual: ${!hasKeyword ? "Kata transfer ga ada " : ""}${!hasAmount ? "Nominal ga cocok" : ""}`;
        }
      } catch (err) {
        reason = "OCR Error: " + err.message;
      }
    }

    const baseMsg = `🔔 *PENDAFTARAN VIP BARU*\n\n👤 User: \`${tx.username || "-"}\`\n🆔 appuid: \`${tx.appuid || tx.uid || "-"}\`\n💸 Nama Pengirim: ${tx.senderName || "-"}\n💰 Nominal: ${tx.amount || "Rp 50.000"}`;

    if (isAutoAccepted) {
      const batch = db.batch();
      batch.update(txRef, { status: "approved", approvedAt: admin.firestore.FieldValue.serverTimestamp(), autoApproved: true });
      batch.update(db.collection("users").doc(tx.uid), { role: "vip", status: "active" });
      await batch.commit();

      await sendTelegramPhoto({ chat_id: TELEGRAM_DEV_CHAT_ID, photo: photoUrl, caption: baseMsg + `\n\n✅ *AUTO-ACCEPTED*\nSistem mendeteksi struk transfer valid.`, parse_mode: "Markdown" });
      return res.status(200).json({ ok: true, status: "auto_approved" });
      
    } else {
      await sendTelegramPhoto({ 
        chat_id: TELEGRAM_DEV_CHAT_ID, photo: photoUrl, caption: baseMsg + `\n\n⚠️ *PERLU CEK MANUAL*\nAlasan: ${reason}`, parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "✅ ACC VIP", callback_data: `approve:${transactionId}:${tx.uid}` }, { text: "❌ Tolak", callback_data: `reject:${transactionId}:${tx.uid}` }]] }
      });
      return res.status(200).json({ ok: true, status: "manual_review", reason });
    }
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

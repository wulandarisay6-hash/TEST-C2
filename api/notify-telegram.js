const admin = require("firebase-admin");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8624483756:AAGyRfUIkc6bySmh8ZxIvEiyooF-sHQflQI";
const TELEGRAM_DEV_CHAT_ID = process.env.TELEGRAM_DEV_CHAT_ID || "8475372258";

let _app;
function getApp() {
  if (_app) return _app;
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const credential = admin.credential.cert(sa);
  _app = admin.apps.length ? admin.app() : admin.initializeApp({ credential });
  return _app;
}
function getDb() { getApp(); return admin.firestore(); }

async function sendTelegram(payload) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  return res.json();
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { transactionId } = req.body || {};
    if (!transactionId) return res.status(400).json({ error: "transactionId required" });
    const db = getDb();
    const txRef = db.collection("transactions").doc(transactionId);
    const txSnap = await txRef.get();
    if (!txSnap.exists) return res.status(404).json({ error: "Transaction not found" });
    const tx = txSnap.data();
    const today = new Date().toISOString().slice(0, 10);
    const senderOk = tx.senderName && tx.senderName.trim().length >= 2;
    const dateOk = tx.transactionDate === today;
    const refOk = tx.transactionRef && tx.transactionRef.trim().length >= 4;
    const baseMsg = `🔔 *TRANSAKSI BARU*\n\n👤 User: \`${tx.username || "-"}\`\n🆔 appuid: \`${tx.appuid || tx.uid || "-"}\`\n💸 Nama QRIS: ${tx.senderName || "-"}\n📅 Tanggal: ${tx.transactionDate || "-"}\n🔢 Ref: \`${tx.transactionRef || "-"}\`\n💰 Nominal: ${tx.amount || "-"}\n🆔 TxID: \`${transactionId}\``;
    if (senderOk && dateOk && refOk) {
      const batch = db.batch();
      batch.update(txRef, { status: "approved", approvedAt: admin.firestore.FieldValue.serverTimestamp(), autoApproved: true });
      batch.update(db.collection("users").doc(tx.uid), { role: "vip", status: "active" });
      await batch.commit();
      await sendTelegram({ chat_id: TELEGRAM_DEV_CHAT_ID, text: baseMsg + `\n\n✅ *AUTO-APPROVED*`, parse_mode: "Markdown" });
      return res.status(200).json({ ok: true, autoApproved: true });
    }
    await sendTelegram({ chat_id: TELEGRAM_DEV_CHAT_ID, text: baseMsg + `\n\n⚠️ *PERLU CEK MANUAL*`, parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "✅ ACC VIP", callback_data: `approve:${transactionId}:${tx.uid}` }, { text: "❌ Tolak", callback_data: `reject:${transactionId}:${tx.uid}` }]] } });
    return res.status(200).json({ ok: true, autoApproved: false });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

const admin = require("firebase-admin");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_DEV_CHAT_ID = process.env.TELEGRAM_DEV_CHAT_ID;

let _app;
function getApp() {
  if (_app) return _app;
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  _app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(sa) });
  return _app;
}
function getDb() { getApp(); return admin.firestore(); }

async function tg(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  return res.json();
}

module.exports = async (req, res) => {
  if (req.method === "GET") return res.status(200).json({ ok: true, message: "Webhook alive." });
  try {
    const update = req.body || {};
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = msg.text || "";
      const isAdmin = String(chatId) === String(TELEGRAM_DEV_CHAT_ID);

      if (text.startsWith("/setqris") && isAdmin) {
        await tg("sendMessage", { chat_id: chatId, text: "🖼 Kirimkan foto QRIS lo sekarang." });
        return res.status(200).json({ ok: true });
      }
      if (text === "/start" && isAdmin) {
        await tg("sendMessage", { chat_id: chatId, text: "⛧ *SECTKUR ADMIN BOT* ⛧\n\n`/setqris` - Ganti gambar QRIS", parse_mode: "Markdown" });
        return res.status(200).json({ ok: true });
      }
    }

    // Handle FOTO (Simpen sebagai Base64)
    if (update.message && update.message.photo && String(update.message.chat.id) === String(TELEGRAM_DEV_CHAT_ID)) {
      const msg = update.message;
      await tg("sendMessage", { chat_id: msg.chat.id, text: "⏳ Memproses gambar QRIS..." });
      
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileRes = await tg("getFile", { file_id: fileId });
      const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileRes.result.file_path}`;
      
      const imgRes = await fetch(fileUrl);
      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Img = buffer.toString('base64');

      // Simpan format: data:image/jpeg;base64,xxxxx
      const dataUri = `data:image/jpeg;base64,${base64Img}`;
      
      await getDb().collection("settings").doc("qris").set({ 
        imageUrl: dataUri, 
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });
      
      await tg("sendMessage", { chat_id: msg.chat.id, text: `✅ *QRIS BERHASIL DI-SET!* (Mode Base64)` , parse_mode: "Markdown" });
      return res.status(200).json({ ok: true });
    }

    // Handle CALLBACK (ACC/Tolak)
    const cb = update.callback_query;
    if (cb) {
      const [action, transactionId, uid] = (cb.data || "").split(":");
      if (action && transactionId && uid) {
        const db = getDb();
        const txRef = db.collection("transactions").doc(transactionId);
        if (action === "approve") {
          const batch = db.batch();
          batch.update(txRef, { status: "approved", approvedAt: admin.firestore.FieldValue.serverTimestamp() });
          batch.update(db.collection("users").doc(uid), { role: "vip", status: "active" });
          await batch.commit();
          await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "✅ VIP diaktifkan" });
          await tg("editMessageText", { chat_id: cb.message.chat.id, message_id: cb.message.message_id, text: cb.message.text + `\n\n✅ *VIP DIAKTIFKAN*`, parse_mode: "Markdown" });
        } else if (action === "reject") {
          await txRef.update({ status: "rejected" });
          await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "❌ Ditolak" });
          await tg("editMessageText", { chat_id: cb.message.chat.id, message_id: cb.message.message_id, text: cb.message.text + `\n\n❌ *DITOLAK*`, parse_mode: "Markdown" });
        }
      }
      return res.status(200).json({ ok: true });
    }
    return res.status(200).json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

const admin = require("firebase-admin");
let _app;
function getApp() {
  if (_app) return _app;
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  _app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(sa) });
  return _app;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const appuid = req.query.appuid;
    if (!appuid) return res.status(400).json({ valid: false, error: "appuid required" });
    const db = getApp().firestore();
    const userSnap = await db.collection("users").doc(appuid).get();
    if (!userSnap.exists) return res.status(200).json({ valid: false, reason: "not_found" });
    const u = userSnap.data();
    if (u.status === "banned") return res.status(200).json({ valid: false, reason: "banned" });
    let role = u.role || "trial";
    if (role === "trial" && u.trialExpiresAt) {
      const exp = u.trialExpiresAt.toDate ? u.trialExpiresAt.toDate() : new Date(u.trialExpiresAt);
      if (Date.now() > exp.getTime()) {
        role = "expired";
        await db.collection("users").doc(appuid).update({ role: "expired" });
      }
    }
    return res.status(200).json({ valid: role === "vip" || role === "developer", role, username: u.username || null });
  } catch (err) { return res.status(500).json({ valid: false, error: err.message }); }
};

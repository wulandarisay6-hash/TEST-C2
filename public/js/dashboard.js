import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let unsubUser = null, timerInterval = null;
const $ = id => document.getElementById(id);

document.getElementById("sidebar-toggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("collapsed");
});
function showToast(msg, type = "info") { const t = $("toast"); t.textContent = msg; t.className = "toast show " + type; setTimeout(() => t.className = "toast", 3000); }
function openQRIS() { $("modal-qris").classList.add("active"); }
function closeQRIS() { $("modal-qris").classList.remove("active"); }

$("modal-close").addEventListener("click", closeQRIS);
$("nav-upgrade").addEventListener("click", e => { e.preventDefault(); openQRIS(); });
$("btn-upgrade-top").addEventListener("click", openQRIS);
$("nav-logout").addEventListener("click", async e => { e.preventDefault(); await signOut(auth); window.location.href = "/login"; });

onSnapshot(doc(db, "settings", "qris"), snap => {
  if (snap.exists() && snap.data().imageUrl) {
    const url = snap.data().imageUrl;
    $("qris-img-wrap").outerHTML = `<img src="${url}" alt="QRIS" style="max-width:100%;border-radius:4px;border:1px solid var(--border);" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMxNDE0MTQiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZmlsbD0iI2RjMjYyNiIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UVJJUyBHYWdhbCBkaS1sb2FkPC90ZXh0Pjwvc3ZnPg=='">`;
  }
});

onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = "/login"; return; }
  if (unsubUser) unsubUser();
  unsubUser = onSnapshot(doc(db, "users", user.uid), snap => { if (snap.exists()) renderDashboard(user, snap.data()); });
});

function renderDashboard(user, data) {
  $("user-name").textContent = data.username || user.email;
  const role = data.role || "trial";
  $("banned-overlay").classList.toggle("active", data.status === "banned");
  if (data.status === "banned") return;
  
  $("nav-dev").classList.toggle("hidden", role !== "developer");
  $("role-display").innerHTML = `<span class="role-badge ${role}">${role.toUpperCase()}</span>`;
  
  $("appuid-value").textContent = role === "expired" ? "APPUID DINONAKTIFKAN" : user.uid;
  $("appuid-value").classList.toggle("locked", role === "expired");
  $("btn-copy-appuid").disabled = role === "expired";

  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (role === "trial") {
    const expires = data.trialExpiresAt?.toDate ? data.trialExpiresAt.toDate() : new Date(data.trialExpiresAt);
    timerInterval = setInterval(() => {
      const diff = expires.getTime() - Date.now();
      if (diff <= 0) { $("timer-value").textContent = "00:00:00"; location.reload(); } 
      else {
        const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
        const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
        const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
        $("timer-value").textContent = `${h}:${m}:${s}`;
      }
    }, 1000);
    $("trial-box").classList.remove("hidden");
  } else { $("trial-box").classList.add("hidden"); }

  document.querySelectorAll(".feature-btn").forEach(btn => {
    btn.classList.toggle("locked", !(role === "vip" || role === "developer"));
  });
}

// SUBMIT FORM VIP (Upload gambar via Web -> API -> Telegram & OCR)
$("form-qris").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const auth_user = auth.currentUser;
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (!auth_user) { showToast("Sesi habis.", "error"); return; }
  
  const file = fd.get("proof_image");
  if (!file || file.size === 0) { showToast("Upload bukti transfer!", "error"); return; }

  const originalText = submitBtn.textContent;
  submitBtn.textContent = "MEMPROSES BUKTI (OCR)...";
  submitBtn.disabled = true;
  
  try {
    // 1. Bikin dokumen transaksi di Firestore
    const ref = await addDoc(collection(db, "transactions"), {
      uid: auth_user.uid, appuid: auth_user.uid, username: $("user-name").textContent,
      senderName: fd.get("sender_name").trim(), transactionDate: fd.get("transaction_date"),
      transactionRef: fd.get("transaction_ref").trim(), amount: "Rp 50.000",
      status: "pending", createdAt: serverTimestamp()
    });

    // 2. Upload gambar ke ImgBB dulu biar dapet direct URL (buat di-OCR & Telegram)
    const formData = new URLSearchParams();
    const base64Img = await new Promise(r => {
      const reader = new FileReader();
      reader.onload = () => r(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });
    formData.append("image", base64Img);
    
    // Upload ke ImgBB lewat API Vercel biar API Key ImgBB ga bocor di frontend
    // *Kita tembak pake endpoint verify atau buat endpoint baru, pake endpoint notify aja
    const imgbbRes = await fetch(`/api/upload-imgbb`, { // Gua bikinin function khusus buat ini di bawah
      method: "POST", body: formData
    });
    const imgbbData = await imgbbRes.json();
    
    if (!imgbbData.url) throw new Error("Gagal upload gambar");
    const photoUrl = imgbbData.url;

    // 3. Tembak API Notify (yang udah berisi logic OCR Auto-ACC)
    await fetch("/api/notify-telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: ref.id, photoUrl: photoUrl })
    });

    closeQRIS();
    showToast("Konfirmasi terkirim. Tunggu proses Auto-ACC.", "success");
    e.target.reset();
  } catch (err) {
    console.error(err);
    showToast("Gagal kirim: " + err.message, "error");
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

$("btn-copy-appuid").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("appuid-value").textContent);
  showToast("appuid disalin!", "success");
});

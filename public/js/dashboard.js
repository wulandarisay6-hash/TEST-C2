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

function showToast(msg, type = "info") {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show " + type;
  setTimeout(() => t.className = "toast", 3000);
}

function openQRIS() { $("modal-qris").classList.add("active"); }
function closeQRIS() { $("modal-qris").classList.remove("active"); }
$("modal-close").addEventListener("click", closeQRIS);
$("nav-upgrade").addEventListener("click", e => { e.preventDefault(); openQRIS(); });
$("btn-upgrade-top").addEventListener("click", openQRIS);
$("nav-logout").addEventListener("click", async e => { e.preventDefault(); await signOut(auth); window.location.href = "/login"; });

// Tarik QRIS dari Firestore
onSnapshot(doc(db, "settings", "qris"), snap => {
  if (snap.exists() && snap.data().imageUrl) {
    const url = snap.data().imageUrl;
    // Pastiin format URL ImgBB bener (i.ibb.co)
    $("qris-img-wrap").outerHTML = `<img src="${url}" alt="QRIS" style="max-width:100%;border-radius:4px;border:1px solid var(--border);" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMxNDE0MTQiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZmlsbD0iI2RjMjYyNiIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UVJJUyBHYWdhbCBkaS1sb2FkPC90ZXh0Pjwvc3ZnPg=='">`;
  }
});

onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = "/login"; return; }
  if (unsubUser) unsubUser();
  unsubUser = onSnapshot(doc(db, "users", user.uid), snap => {
    if (!snap.exists()) return;
    renderDashboard(user, snap.data());
  });
});

function renderDashboard(user, data) {
  $("user-name").textContent = data.username || user.email;
  const isBanned = data.status === "banned";
  const role = data.role || "trial";
  
  $("banned-overlay").classList.toggle("active", isBanned);
  if (isBanned) return;
  
  $("nav-dev").classList.toggle("hidden", role !== "developer");
  $("role-display").innerHTML = `<span class="role-badge ${role}">${role.toUpperCase()}</span>`;
  
  const appuidEl = $("appuid-value");
  const copyBtn = $("btn-copy-appuid");
  if (role === "expired") {
    appuidEl.textContent = "APPUID DINONAKTIFKAN — Upgrade ke VIP";
    appuidEl.classList.add("locked");
    copyBtn.disabled = true;
  } else {
    appuidEl.textContent = user.uid;
    appuidEl.classList.remove("locked");
    copyBtn.disabled = false;
  }

  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  const trialBox = $("trial-box");
  if (role === "trial") {
    const expires = data.trialExpiresAt?.toDate ? data.trialExpiresAt.toDate() : new Date(data.trialExpiresAt);
    timerInterval = setInterval(() => {
      const diff = expires.getTime() - Date.now();
      if (diff <= 0) {
        clearInterval(timerInterval); timerInterval = null;
        trialBox.classList.add("expired");
        $("timer-value").textContent = "00:00:00";
        setTimeout(() => location.reload(), 1500);
      } else {
        const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
        const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
        const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
        $("timer-value").textContent = `${h}:${m}:${s}`;
      }
    }, 1000);
    trialBox.classList.remove("hidden");
  } else {
    trialBox.classList.add("hidden");
  }

  const isVIP = role === "vip" || role === "developer";
  document.querySelectorAll(".feature-btn").forEach(btn => {
    if (isVIP) btn.classList.remove("locked");
    else btn.classList.add("locked");
  });
}

$("btn-copy-appuid").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("appuid-value").textContent);
    showToast("appuid berhasil disalin!", "success");
  } catch { showToast("Gagal salin.", "error"); }
});

// BENERIN BUG TOMBOL STUCK
$("form-qris").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const auth_user = auth.currentUser;
  const submitBtn = e.target.querySelector('button[type="submit"]');
  
  if (!auth_user) { showToast("Sesi habis. Login ulang.", "error"); return; }
  
  // Ubah teks tombol jadi loading
  const originalText = submitBtn.textContent;
  submitBtn.textContent = "MENGIRIM...";
  submitBtn.disabled = true;
  
  try {
    const ref = await addDoc(collection(db, "transactions"), {
      uid: auth_user.uid,
      appuid: auth_user.uid,
      username: $("user-name").textContent,
      senderName: fd.get("sender_name").trim(),
      transactionDate: fd.get("transaction_date"),
      transactionRef: fd.get("transaction_ref").trim(),
      amount: "Rp 50.000",
      status: "pending",
      createdAt: serverTimestamp()
    });
    
    // Tembak API Telegram
    await fetch("/api/notify-telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: ref.id })
    });
    
    closeQRIS();
    showToast("Konfirmasi terkirim. Menunggu ACC Developer.", "success");
    e.target.reset();
  } catch (err) {
    console.error(err);
    showToast("Gagal kirim konfirmasi. Cek koneksi.", "error");
  } finally {
    // Balikin tombol ke normal (apapun hasilnya)
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

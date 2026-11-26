import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, addDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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

function openQRIS() { 
  $("modal-qris").classList.add("active"); 
  window.location.hash = "upgrade";
}
function closeQRIS() { 
  $("modal-qris").classList.remove("active"); 
  history.replaceState(null, null, window.location.pathname); 
}

if (window.location.hash === "#upgrade") { openQRIS(); }

$("modal-close").addEventListener("click", closeQRIS);
$("nav-upgrade").addEventListener("click", e => { e.preventDefault(); openQRIS(); });
$("btn-upgrade-top").addEventListener("click", openQRIS);
$("nav-logout").addEventListener("click", async e => { e.preventDefault(); await signOut(auth); window.location.href = "/login"; });

onSnapshot(doc(db, "settings", "qris"), snap => {
  if (snap.exists() && snap.data().imageUrl) {
    const url = snap.data().imageUrl;
    const imgWrap = $("qris-img-wrap");
    if (imgWrap) imgWrap.outerHTML = `<img src="${url}" alt="QRIS" style="max-width:100%;border-radius:4px;border:1px solid var(--border);">`;
  }
});

onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = "/login"; return; }
  if (unsubUser) unsubUser();
  
  unsubUser = onSnapshot(doc(db, "users", user.uid), snap => {
    if (snap.exists()) {
      renderDashboard(user, snap.data());
    } else {
      const trialExpires = new Date(Date.now() + 60 * 60 * 1000);
      setDoc(doc(db, "users", user.uid), {
        uid: user.uid, email: user.email, username: user.email.split("@")[0],
        role: "trial", status: "active", createdAt: serverTimestamp(), trialExpiresAt: trialExpires
      }).then(() => showToast("Profil dipulihkan otomatis!", "success"))
        .catch(err => console.error("Auto-heal gagal:", err));
    }
  }, err => {
    console.error("Firestore Error:", err);
    $("appuid-value").textContent = "Gagal load data";
    $("appuid-value").classList.add("locked");
  });
});

function renderDashboard(user, data) {
  $("user-name").textContent = data.username || user.email;
  let role = data.role || "trial";
  
  if (role === "trial" && data.trialExpiresAt) {
    const exp = data.trialExpiresAt.toDate ? data.trialExpiresAt.toDate() : new Date(data.trialExpiresAt);
    if (Date.now() > exp.getTime()) role = "expired";
  }

  $("banned-overlay").classList.toggle("active", data.status === "banned");
  if (data.status === "banned") return;
  
  $("nav-dev").classList.toggle("hidden", role !== "developer");
  $("role-display").innerHTML = `<span class="role-badge ${role}">${role.toUpperCase()}</span>`;
  
  $("appuid-value").textContent = role === "expired" ? "APPUID DINONAKTIFKAN — Upgrade ke VIP" : user.uid;
  $("appuid-value").classList.toggle("locked", role === "expired");
  $("btn-copy-appuid").disabled = role === "expired";

  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  
  if (role === "trial" && data.trialExpiresAt) {
    const expires = data.trialExpiresAt?.toDate ? data.trialExpiresAt.toDate() : new Date(data.trialExpiresAt);
    timerInterval = setInterval(() => {
      const diff = expires.getTime() - Date.now();
      if (diff <= 0) { 
        $("timer-value").textContent = "00:00:00"; 
        $("trial-box").classList.add("expired");
        document.querySelectorAll(".feature-btn").forEach(btn => btn.classList.add("locked"));
        $("appuid-value").textContent = "APPUID DINONAKTIFKAN — Upgrade ke VIP";
        $("appuid-value").classList.add("locked");
        $("btn-copy-appuid").disabled = true;
        $("role-display").innerHTML = `<span class="role-badge expired">EXPIRED</span>`;
      } else {
        const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
        const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
        const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
        $("timer-value").textContent = `${h}:${m}:${s}`;
      }
    }, 1000);
    $("trial-box").classList.remove("hidden");
  } else { 
    $("trial-box").classList.add("hidden"); 
  }

  const isUnlocked = role === "trial" || role === "vip" || role === "developer";
  document.querySelectorAll(".feature-btn").forEach(btn => {
    btn.classList.toggle("locked", !isUnlocked);
  });
}


document.querySelectorAll(".feature-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.classList.contains("locked")) {
      showToast("Fitur terkunci. Upgrade ke VIP.", "error");
    } else {
      window.location.href = "/c2-panel";
    }
  });
});


$("btn-copy-appuid").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("appuid-value").textContent);
    showToast("appuid disalin!", "success");
  } catch { showToast("Gagal salin.", "error"); }
});

// SUBMIT FORM VIP (Hanya butuh Nama dan Foto)
$("form-qris").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const auth_user = auth.currentUser;
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (!auth_user) { showToast("Sesi habis.", "error"); return; }
  
  const file = fd.get("proof_image");
  if (!file || file.size === 0) { showToast("Upload bukti transfer!", "error"); return; }

  const originalText = submitBtn.textContent;
  submitBtn.textContent = "MEMPROSES BUKTI...";
  submitBtn.disabled = true;
  
  try {
    // Simpan transaksi tanpa tanggal & ref
    const ref = await addDoc(collection(db, "transactions"), {
      uid: auth_user.uid, 
      appuid: auth_user.uid, 
      username: $("user-name").textContent,
      senderName: fd.get("sender_name").trim(), 
      amount: "Rp 50.000",
      status: "pending", 
      createdAt: serverTimestamp()
    });

    const base64Img = await new Promise(r => {
      const reader = new FileReader();
      reader.onload = () => r(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });
    
    const formData = new URLSearchParams();
    formData.append("image", base64Img);
    
    const imgbbRes = await fetch(`/api/upload-imgbb`, { method: "POST", body: formData });
    const imgbbData = await imgbbRes.json();
    if (!imgbbData.url) throw new Error("Gagal upload gambar");
    
    await fetch("/api/notify-telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: ref.id, photoUrl: imgbbData.url })
    });

    closeQRIS();
    showToast("Konfirmasi terkirim. Bot sedang mengecek gambar.", "success");
    e.target.reset();
  } catch (err) {
    console.error(err);
    showToast("Gagal: " + err.message, "error");
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

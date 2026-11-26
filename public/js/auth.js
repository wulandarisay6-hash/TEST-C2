import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const tabs = document.querySelectorAll(".auth-tab");
const forms = { login: document.getElementById("login-form"), register: document.getElementById("register-form") };
const errorEl = document.getElementById("form-error");

// Fungsi cek IP Banned
async function checkIpBan() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    const ip = data.ip;
    
    // Cek di Firestore
    const ipSnap = await getDoc(doc(db, "banned_ips", ip));
    if (ipSnap.exists()) {
      errorEl.textContent = "Akses Ditolak: IP Address Anda telah diblokir oleh Developer.";
      return false;
    }
    // Simpan IP ke session storage buat disimpen ke user document
    sessionStorage.setItem("current_ip", ip);
    return true;
  } catch (e) {
    console.warn("Gagal cek IP:", e);
    return true; // Lanjut aja kalau API ipify down
  }
}

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    Object.values(forms).forEach(f => f.classList.add("hidden"));
    forms[tab.dataset.tab].classList.remove("hidden");
    errorEl.textContent = "";
  });
});

forms.login.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  const isNotBanned = await checkIpBan();
  if (!isNotBanned) return;

  try {
    await signInWithEmailAndPassword(auth, forms.login.email.value.trim(), forms.login.password.value);
  } catch (err) { errorEl.textContent = translateError(err.code); }
});

forms.register.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  const username = forms.register.username.value.trim();
  const email = forms.register.email.value.trim();
  const password = forms.register.password.value;
  if (password.length < 6) { errorEl.textContent = "Password minimal 6 karakter."; return; }
  if (username.length < 3) { errorEl.textContent = "Username minimal 3 karakter."; return; }

  const isNotBanned = await checkIpBan();
  if (!isNotBanned) return;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    const trialExpires = new Date(Date.now() + 60 * 60 * 1000);
    const ip = sessionStorage.getItem("current_ip") || "unknown";
    
    // Simpan data user sekalian IP-nya
    await setDoc(doc(db, "users", uid), {
      uid, email, username, lastIp: ip, 
      role: (email === "naufaloktavianto72@gmail.com" ? "developer" : "trial"), 
      status: "active", createdAt: serverTimestamp(), trialExpiresAt: trialExpires
    });
  } catch (err) { errorEl.textContent = translateError(err.code); }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists() && snap.data().role === "developer") window.location.href = "/dev-dashboard";
    else window.location.href = "/dashboard";
  } catch { window.location.href = "/dashboard"; }
});

function translateError(code) {
  const map = {
    "auth/email-already-in-use": "Email sudah terdaftar.",
    "auth/invalid-email": "Format email tidak valid.",
    "auth/weak-password": "Password terlalu lemah (min 6 karakter).",
    "auth/user-not-found": "Akun tidak ditemukan.",
    "auth/wrong-password": "Password salah.",
    "auth/invalid-credential": "Email atau password salah.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti."
  };
  return map[code] || "Terjadi kesalahan. Coba lagi.";
}

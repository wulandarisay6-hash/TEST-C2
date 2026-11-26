import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);
let allTransactions = []; // Simpan data biar bisa difilter
let currentFilter = "all";

function showToast(msg, type = "info") {
  const t = $("toast"); t.textContent = msg; t.className = "toast show " + type;
  setTimeout(() => t.className = "toast", 3000);
}
function logLine(msg, type = "info") {
  const log = $("telegram-log");
  const now = new Date().toLocaleTimeString("id-ID", { hour12: false });
  const div = document.createElement("div");
  div.className = "log-line " + type;
  div.innerHTML = `<span class="timestamp">[${now}]</span>${msg}`;
  log.appendChild(div); log.scrollTop = log.scrollHeight;
}

// Sidebar
document.getElementById("sidebar-toggle").addEventListener("click", () => {
  const sidebar = document.getElementById("sidebar");
  if (window.innerWidth <= 768) { sidebar.classList.toggle("open"); } 
  else { sidebar.classList.toggle("collapsed"); }
});
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth <= 768) document.getElementById("sidebar").classList.remove("open");
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
  });
});
$("nav-logout").addEventListener("click", async e => { e.preventDefault(); await signOut(auth); window.location.href = "/login"; });

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = "/login"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || snap.data().role !== "developer") {
    $("dev-error").textContent = "Akses ditolak. Hanya developer.";
    setTimeout(() => window.location.href = "/dashboard", 2000);
    return;
  }
  logLine("Developer panel loaded. Auth OK.", "success");
  loadUsers(); loadTransactions();
});

// === USERS (DENGAN IP BANNED) ===
function loadUsers() {
  onSnapshot(collection(db, "users"), snap => {
    const tbody = $("users-tbody");
    if (snap.empty) { tbody.innerHTML = `<tr><td colspan="6" class="text-center text-dim">Belum ada user.</td></tr>`; return; }
    tbody.innerHTML = "";
    snap.forEach(d => {
      const u = d.data(); const id = d.id;
      const role = u.role || "trial"; 
      const status = u.status || "active";
      const ip = u.lastIp || "-";
      
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.email || "-"}</td>
        <td>${u.username || "-"}</td>
        <td style="font-family:monospace;">${ip}</td>
        <td><span class="role-badge ${role}">${role.toUpperCase()}</span></td>
        <td>${status === "banned" ? '<span class="role-badge banned">BANNED</span>' : 'ACTIVE'}</td>
        <td>
          <button class="action-btn gold" data-action="vip" data-id="${id}">${role === "vip" ? "Cabut VIP" : "Set VIP"}</button>
          <button class="action-btn danger" data-action="ban" data-id="${id}">${status === "banned" ? "Unban" : "Ban"}</button>
          ${ip !== "-" ? `<button class="action-btn danger" data-action="ban_ip" data-ip="${ip}">Ban IP</button>` : ""}
          <button class="action-btn danger" data-action="delete" data-id="${id}">Hapus</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", (e) => handleUserAction(e.target.dataset.action, e.target.dataset.id, e.target.dataset.ip, e.target));
    });
  });
}

async function handleUserAction(action, id, ip, btnElement) {
  const originalText = btnElement.textContent;
  btnElement.textContent = "..."; btnElement.disabled = true;
  
  try {
    if (action === "ban_ip") {
      if (!confirm(`Ban IP ${ip}? Semua akun dari IP ini ga akan bisa login/daftar.`)) {
        btnElement.textContent = originalText; btnElement.disabled = false; return;
      }
      await setDoc(doc(db, "banned_ips", ip), { ip: ip, bannedAt: serverTimestamp() });
      logLine(`BANNED IP: ${ip}`, "error"); showToast("IP berhasil di-ban.", "success");
    } else {
      const ref = doc(db, "users", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const u = snap.data();
      
      if (action === "vip") {
        await updateDoc(ref, { role: u.role === "vip" ? "expired" : "vip", status: "active" });
      } else if (action === "ban") {
        await updateDoc(ref, { status: u.status === "banned" ? "active" : "banned" });
      } else if (action === "delete") {
        if (!confirm("Hapus user permanen?")) { btnElement.textContent = originalText; btnElement.disabled = false; return; }
        await deleteDoc(ref);
      }
      logLine(`Action ${action}: ${u.email}`, "info");
    }
  } catch (err) { console.error(err); showToast("Gagal: " + err.message, "error"); }
  finally { btnElement.textContent = originalText; btnElement.disabled = false; }
}

// === TRANSACTIONS (DENGAN FILTER) ===
function loadTransactions() {
  const q = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    allTransactions = [];
    snap.forEach(d => { allTransactions.push({ id: d.id, ...d.data() }); });
    renderTransactions();
  });
}

function renderTransactions() {
  const tbody = $("tx-tbody");
  const filtered = currentFilter === "all" ? allTransactions : allTransactions.filter(tx => (tx.status || "pending") === currentFilter);
  
  if (filtered.length === 0) { 
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-dim">Tidak ada data untuk filter ini.</td></tr>`; 
    return; 
  }
  tbody.innerHTML = "";
  filtered.forEach(tx => {
    const date = tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString("id-ID") : "-";
    const status = tx.status || "pending";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${date}</td>
      <td>${tx.username || "-"}</td>
      <td>${tx.senderName || "-"}</td>
      <td><span class="role-badge ${status === "approved" ? "vip" : status === "rejected" ? "banned" : "trial"}">${status.toUpperCase()}</span></td>
      <td>${status === "pending" ? `<button class="action-btn gold" data-tx="approve" data-id="${tx.id}" data-uid="${tx.uid}">ACC</button><button class="action-btn danger" data-tx="reject" data-id="${tx.id}">Tolak</button>` : "-"}</td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("button[data-tx]").forEach(btn => {
    btn.addEventListener("click", (e) => handleTx(e.target.dataset.tx, e.target.dataset.id, e.target.dataset.uid, e.target));
  });
}

// Event Listener buat tombol Filter
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderTransactions();
  });
});

async function handleTx(action, id, uid, btnElement) {
  const originalText = btnElement.textContent;
  btnElement.textContent = "..."; btnElement.disabled = true;
  try {
    if (action === "approve") {
      await updateDoc(doc(db, "transactions", id), { status: "approved", approvedAt: serverTimestamp() });
      if (uid) await updateDoc(doc(db, "users", uid), { role: "vip", status: "active" });
      logLine(`ACC VIP: ${id}`, "success"); showToast("ACC berhasil.", "success");
    } else {
      await updateDoc(doc(db, "transactions", id), { status: "rejected", rejectedAt: serverTimestamp() });
      logLine(`TOLAK: ${id}`, "warn"); showToast("Ditolak.", "info");
    }
  } catch (err) { showToast("Gagal: " + err.message, "error"); }
  finally { btnElement.textContent = originalText; btnElement.disabled = false; }
}

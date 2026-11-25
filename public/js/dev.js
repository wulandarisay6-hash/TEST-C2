import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);
let currentUser = null;
function showToast(msg, type = "info") {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show " + type;
  setTimeout(() => t.className = "toast", 3000);
}
function logLine(msg, type = "info") {
  const log = $("telegram-log");
  const now = new Date().toLocaleTimeString("id-ID", { hour12: false });
  const div = document.createElement("div");
  div.className = "log-line " + type;
  div.innerHTML = `<span class="timestamp">[${now}]</span>${msg}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}
$("sidebar-toggle").addEventListener("click", () => $("sidebar").classList.toggle("collapsed"));
$("nav-logout").addEventListener("click", async e => { e.preventDefault(); await signOut(auth); window.location.href = "/login"; });
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = "/login"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || snap.data().role !== "developer") {
    $("dev-error").textContent = "Akses ditolak. Hanya developer.";
    setTimeout(() => window.location.href = "/dashboard", 2000);
    return;
  }
  currentUser = user;
  logLine("Developer panel loaded. Auth OK.", "success");
  loadUsers();
  loadTransactions();
  loadTelegramStatus();
});
function loadUsers() {
  onSnapshot(collection(db, "users"), snap => {
    const tbody = $("users-tbody");
    if (snap.empty) { tbody.innerHTML = `<tr><td colspan="6" class="text-center text-dim">Belum ada user.</td></tr>`; return; }
    tbody.innerHTML = "";
    snap.forEach(d => {
      const u = d.data();
      const id = d.id;
      const role = u.role || "trial";
      const status = u.status || "active";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.email || "-"}</td>
        <td>${u.username || "-"}</td>
        <td style="font-family:monospace;font-size:0.7rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;" title="${id}">${id.slice(0,8)}...${id.slice(-4)}</td>
        <td><span class="role-badge ${role}">${role.toUpperCase()}</span></td>
        <td>${status === "banned" ? '<span class="role-badge banned">BANNED</span>' : 'ACTIVE'}</td>
        <td>
          <button class="action-btn gold" data-action="vip" data-id="${id}">${role === "vip" ? "Cabut VIP" : "Set VIP"}</button>
          <button class="action-btn danger" data-action="ban" data-id="${id}">${status === "banned" ? "Unban" : "Ban"}</button>
          <button class="action-btn danger" data-action="delete" data-id="${id}">Hapus</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleUserAction(btn.dataset.action, btn.dataset.id));
    });
  });
}
async function handleUserAction(action, id) {
  const ref = doc(db, "users", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const u = snap.data();
  try {
    if (action === "vip") {
      if (u.role === "vip") {
        await updateDoc(ref, { role: "expired" });
        logLine(`Cabut VIP: ${u.email}`, "warn");
        showToast("VIP dicabut.", "info");
      } else {
        await updateDoc(ref, { role: "vip", status: "active" });
        logLine(`Set VIP: ${u.email}`, "success");
        showToast("User di-set VIP.", "success");
      }
    } else if (action === "ban") {
      await updateDoc(ref, { status: u.status === "banned" ? "active" : "banned" });
      logLine(`${u.status === "banned" ? "Unban" : "Ban"}: ${u.email}`, "error");
      showToast("Status updated.", "info");
    } else if (action === "delete") {
      if (!confirm("Hapus user permanen? Tindakan tidak bisa dibatalkan.")) return;
      await deleteDoc(ref);
      logLine(`HAPUS USER: ${u.email}`, "error");
      showToast("User dihapus.", "info");
    }
  } catch (err) { console.error(err); showToast("Gagal: " + err.message, "error"); }
}
function loadTransactions() {
  const q = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    const tbody = $("tx-tbody");
    if (snap.empty) { tbody.innerHTML = `<tr><td colspan="7" class="text-center text-dim">Belum ada transaksi.</td></tr>`; return; }
    tbody.innerHTML = "";
    snap.forEach(d => {
      const tx = d.data();
      const id = d.id;
      const date = tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString("id-ID") : "-";
      const status = tx.status || "pending";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${date}</td>
        <td>${tx.username || "-"}</td>
        <td style="font-family:monospace;font-size:0.7rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;">${(tx.appuid || tx.uid || "-").slice(0,10)}...</td>
        <td>${tx.senderName || "-"}</td>
        <td>${tx.transactionRef || "-"}</td>
        <td><span class="role-badge ${status === "approved" ? "vip" : status === "rejected" ? "banned" : "trial"}">${status.toUpperCase()}</span></td>
        <td>
          ${status === "pending" ? `<button class="action-btn gold" data-tx="approve" data-id="${id}" data-uid="${tx.uid}">ACC</button><button class="action-btn danger" data-tx="reject" data-id="${id}">Tolak</button>` : "-"}
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("button[data-tx]").forEach(btn => {
      btn.addEventListener("click", () => handleTx(btn.dataset.tx, btn.dataset.id, btn.dataset.uid));
    });
  });
}
async function handleTx(action, id, uid) {
  try {
    if (action === "approve") {
      await updateDoc(doc(db, "transactions", id), { status: "approved", approvedAt: serverTimestamp() });
      if (uid) await updateDoc(doc(db, "users", uid), { role: "vip", status: "active" });
      logLine(`ACC VIP via dashboard: tx ${id}`, "success");
      showToast("ACC VIP berhasil.", "success");
    } else {
      await updateDoc(doc(db, "transactions", id), { status: "rejected", rejectedAt: serverTimestamp() });
      logLine(`TOLAK transaksi ${id}`, "warn");
      showToast("Transaksi ditolak.", "info");
    }
  } catch (err) { showToast("Gagal: " + err.message, "error"); }
}
function loadTelegramStatus() {
  fetch("/api/telegram-webhook").then(r => {
    if (r.ok) logLine("Webhook endpoint reachable.", "success");
    else logLine("Webhook endpoint error " + r.status, "error");
  }).catch(e => logLine("Webhook unreachable: " + e.message, "error"));
}

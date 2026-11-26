const { io } = require("socket.io-client");
const APPUID = "OlQTuT6f22hjB9k4wzzmwhsnudh2"; // UID Lo
const socket = io("http://localhost:8080");

socket.on("connect", () => {
  console.log("[+] Terhubung ke C2 Server. Mendaftarkan device...");
  socket.emit("register_device", { appuid: APPUID, deviceInfo: { model: "Fake Android" } });
});

socket.on("registered", () => console.log("[+] Device berhasil didaftarkan!"));

socket.on("execute_command", (data) => {
  console.log(`[CMD] ${data.command} -> ${data.args}`);
  setTimeout(() => {
    if (data.command === "shell") {
      socket.emit("command_output", { appuid: APPUID, type: "shell", output: `Hasil dari perintah '${data.args}': Sukses!` });
    } else if (data.command === "device_info") {
      socket.emit("command_output", { appuid: APPUID, type: "device_info", info: { Model: "Fake HP", Android: "14", Status: "Rooted" } });
    }
  }, 1000);
});

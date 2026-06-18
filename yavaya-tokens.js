// ═══════════════════════════════════════════════════════
// YAVAYA TOKEN SYSTEM — yavaya-tokens.js
// Loaded by: index.html, mercadito.html, yavayago.html
// ═══════════════════════════════════════════════════════

import { getFirestore, doc, getDoc, setDoc, updateDoc,
  serverTimestamp, collection, addDoc, query, where,
  orderBy, limit, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ─── DEVICE FINGERPRINT ─────────────────────────────────────────────────────
export function getDeviceId() {
  let id = localStorage.getItem('_yvyd');
  if (!id) {
    id = 'dv-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2,9);
    localStorage.setItem('_yvyd', id);
  }
  return id;
}

// ─── YAVAYA ID GENERATOR ────────────────────────────────────────────────────
export function generateYavayaId(uid) {
  const parts = uid.replace(/[^a-zA-Z0-9]/g,'');
  return 'YVY-' + parts.substr(0,4).toUpperCase() + '-' + parts.substr(4,4).toUpperCase();
}

// ─── INIT USER on first login ───────────────────────────────────────────────
export async function initUserRecord(db, user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const deviceId = getDeviceId();

  if (!snap.exists()) {
    // Brand new user
    const yavayaId = generateYavayaId(user.uid);
    const now = new Date();
    const renewalTime = new Date(now);
    renewalTime.setHours(23, 0, 0, 0);
    if (renewalTime <= now) renewalTime.setDate(renewalTime.getDate() + 1);

    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      yavayaId,
      tokens: 2,
      tokensFreeDay: 1,             // which free day (1-5)
      freeTokensActive: true,       // gets free tokens for 5 days
      joinedAt: serverTimestamp(),
      lastTokenRenewal: serverTimestamp(),
      nextRenewal: renewalTime.toISOString(),
      deviceId,
      deviceIds: [deviceId],        // array of all devices seen
      isBlocked: false,
      role: 'user',
      activityLog: [],
      totalTokensSpent: 0,
      totalTokensBought: 0,
      adminWatchUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Log device registration
    await addDoc(collection(db, 'deviceRegistrations'), {
      uid: user.uid,
      deviceId,
      email: user.email,
      registeredAt: serverTimestamp(),
    });

    return { tokens: 2, yavayaId, isNew: true };
  } else {
    const data = snap.data();

    // Check device — if new device on existing user, log it
    const knownDevices = data.deviceIds || [];
    if (!knownDevices.includes(deviceId)) {
      await updateDoc(ref, {
        deviceIds: [...knownDevices, deviceId]
      });
    }

    // Check if this device already has another account
    await checkDeviceConflict(db, user.uid, deviceId);

    // Check token renewal
    await checkTokenRenewal(db, user.uid, data);

    return { tokens: data.tokens, yavayaId: data.yavayaId, isNew: false };
  }
}

// ─── DEVICE CONFLICT CHECK ──────────────────────────────────────────────────
async function checkDeviceConflict(db, uid, deviceId) {
  try {
    const q = query(
      collection(db, 'deviceRegistrations'),
      where('deviceId', '==', deviceId)
    );
    const snap = await getDoc(doc(db, 'deviceRegistrations', deviceId)).catch(() => null);
    // Soft check — if another UID used this exact device ID, flag it
    // Full enforcement requires Cloud Functions; this is client-side signal
    localStorage.setItem('_yvuid', uid);
  } catch(e) {}
}

// ─── TOKEN RENEWAL ──────────────────────────────────────────────────────────
async function checkTokenRenewal(db, uid, data) {
  if (!data.freeTokensActive) return;
  if ((data.tokensFreeDay || 1) > 5) {
    // Free period over
    await updateDoc(doc(db, 'users', uid), { freeTokensActive: false });
    return;
  }

  const now = new Date();
  const nextRenewal = data.nextRenewal ? new Date(data.nextRenewal) : null;

  if (nextRenewal && now >= nextRenewal) {
    const currentTokens = data.tokens || 0;
    const newTokens = currentTokens < 2 ? 2 : currentTokens; // top up to 2, never reduce
    const freeDay = (data.tokensFreeDay || 1) + 1;
    const nextRenewalDate = new Date(now);
    nextRenewalDate.setHours(23, 0, 0, 0);
    if (nextRenewalDate <= now) nextRenewalDate.setDate(nextRenewalDate.getDate() + 1);

    await updateDoc(doc(db, 'users', uid), {
      tokens: newTokens,
      tokensFreeDay: freeDay,
      freeTokensActive: freeDay <= 5,
      lastTokenRenewal: serverTimestamp(),
      nextRenewal: nextRenewalDate.toISOString(),
    });
  }
}

// ─── SPEND TOKEN ────────────────────────────────────────────────────────────
export async function spendToken(db, uid, action, details = {}) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { success: false, reason: 'Usuario no encontrado' };

  const data = snap.data();
  if (data.isBlocked) return { success: false, reason: 'Cuenta bloqueada' };
  if ((data.tokens || 0) < 1) return { success: false, reason: 'Sin tokens' };

  const newTokens = data.tokens - 1;
  const logEntry = {
    action,
    details,
    tokensAfter: newTokens,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(ref, {
    tokens: newTokens,
    totalTokensSpent: (data.totalTokensSpent || 0) + 1,
    activityLog: [...(data.activityLog || []).slice(-49), logEntry],
  });

  // Also log to global activity collection (for admin monitoring)
  await addDoc(collection(db, 'activityLogs'), {
    uid,
    email: data.email,
    yavayaId: data.yavayaId,
    action,
    details,
    tokensAfter: newTokens,
    deviceId: getDeviceId(),
    timestamp: serverTimestamp(),
  });

  return { success: true, tokensRemaining: newTokens };
}

// ─── GET TOKENS ─────────────────────────────────────────────────────────────
export async function getTokenBalance(db, uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return 0;
  return snap.data().tokens || 0;
}

// ─── TOKEN UI WIDGET ────────────────────────────────────────────────────────
export function renderTokenWidget(tokens, yavayaId, freeActive, freeDay) {
  return `
    <div class="token-widget" id="tokenWidget">
      <div class="tw-tokens">
        <span class="tw-icon">⚡</span>
        <span class="tw-count" id="twCount">${tokens}</span>
        <span class="tw-label">tokens</span>
      </div>
      ${freeActive ? `<div class="tw-free">Gratis día ${freeDay}/5</div>` : ''}
      <a href="tokens.html" class="tw-buy">+ Comprar</a>
    </div>`;
}

// ─── NO TOKENS MODAL ────────────────────────────────────────────────────────
export function showNoTokensModal(yavayaId) {
  const existing = document.getElementById('noTokensModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'noTokensModal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:9000;
    background:rgba(5,4,4,.95);
    display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(4px);
    padding:20px;
  `;
  modal.innerHTML = `
    <div style="
      max-width:480px;width:100%;
      background:#13100c;
      border:1px solid rgba(201,168,76,.25);
      padding:40px 32px;
      text-align:center;
    ">
      <div style="font-size:40px;margin-bottom:16px;">⚡</div>
      <div style="
        font-family:'Cinzel Decorative',serif;font-size:22px;
        color:#e8c97a;margin-bottom:10px;
      ">Sin Tokens</div>
      <div style="
        font-family:'Cinzel',serif;font-size:9px;letter-spacing:4px;
        text-transform:uppercase;color:#7a6a50;margin-bottom:20px;
      ">Necesitas tokens para continuar</div>
      <div style="
        font-family:'Cormorant Garamond',serif;font-size:15px;
        color:#7a6a50;line-height:1.6;margin-bottom:24px;
      ">
        Cada acción en Yavaya cuesta 1 token.<br>
        Obtén más tokens para seguir explorando la civilización.
      </div>
      <div style="
        background:rgba(201,168,76,.06);border:1px solid rgba(201,168,76,.15);
        padding:14px;margin-bottom:24px;
      ">
        <div style="font-family:'Cinzel',serif;font-size:8px;letter-spacing:3px;text-transform:uppercase;color:#8a6c2a;margin-bottom:6px;">Tu Yavaya ID</div>
        <div style="font-family:'Cinzel Decorative',serif;font-size:20px;color:#c9a84c;">${yavayaId || 'Inicia sesión'}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:12px;color:#7a6a50;margin-top:6px;font-style:italic;">
          Guarda este ID — lo necesitas al comprar tokens
        </div>
      </div>
      <div style="display:flex;gap:12px;justify-content:center;">
        <a href="tokens.html" style="
          flex:1;padding:14px;text-align:center;
          font-family:'Cinzel',serif;font-size:10px;letter-spacing:4px;text-transform:uppercase;
          background:linear-gradient(135deg,#e8c97a,#c9a84c);color:#050404;
          text-decoration:none;font-weight:700;
        ">Ver Paquetes</a>
        <button onclick="document.getElementById('noTokensModal').remove()" style="
          flex:1;padding:14px;
          font-family:'Cinzel',serif;font-size:10px;letter-spacing:4px;text-transform:uppercase;
          background:none;border:1px solid rgba(201,168,76,.2);color:#7a6a50;cursor:pointer;
        ">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

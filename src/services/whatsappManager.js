const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  BufferJSON,
} = require('@whiskeysockets/baileys');
const pino   = require('pino');
const path   = require('path');
const fs     = require('fs');
const QRCode = require('qrcode');
const db     = require('../db/database');
const { encrypt, decrypt } = require('../utils/crypto');

const logger = pino({ level: 'silent' });
const DATA_DIR    = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

class WhatsAppManager {
  constructor() {
    this.sessions = new Map(); // sessionId → { sock, status, phone }
    this.io = null;
  }

  setIO(io) { this.io = io; }

  emit(event, data) { this.io?.emit(event, data); }

  sessPath(id) {
    const p = path.join(SESSIONS_DIR, id);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
  }

  async loadAllSessions() {
    const rows = db.prepare(
      "SELECT id, creds_data FROM sessions WHERE status != 'disconnected' AND creds_data IS NOT NULL"
    ).all();
    for (const row of rows) {
      try { await this.startSession(row.id, false, null); }
      catch (e) { console.error('Oturum yüklenemedi:', row.id, e.message); }
    }
  }

  async startSession(sessionId, usePairing, phoneNumber) {
    const existing = this.sessions.get(sessionId);
    if (existing?.status === 'connected') return;
    if (existing) {
      try { existing.sock.end(undefined); } catch (_) {}
      this.sessions.delete(sessionId);
    }

    const sp = this.sessPath(sessionId);

    // DB'den creds yükle
    const row = db.prepare('SELECT creds_data FROM sessions WHERE id = ?').get(sessionId);
    if (row?.creds_data) {
      try {
        const parsed = JSON.parse(decrypt(row.creds_data));
        fs.writeFileSync(path.join(sp, 'creds.json'), JSON.stringify(parsed, BufferJSON.replacer));
      } catch (_) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(sp);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      browser: ['WA Panel', 'Chrome', '1.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      getMessage: async () => undefined,
    });

    const phone = phoneNumber ? phoneNumber.replace(/\D/g, '') : null;
    this.sessions.set(sessionId, { sock, status: 'connecting', phone });
    this._updateStatus(sessionId, 'connecting');

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      try {
        const raw  = fs.readFileSync(path.join(sp, 'creds.json'), 'utf8');
        const enc  = encrypt(raw);
        db.prepare('UPDATE sessions SET creds_data=?, updated_at=datetime("now") WHERE id=?').run(enc, sessionId);
      } catch (_) {}
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (usePairing && phone) {
          try {
            this._updateStatus(sessionId, 'pairing_pending');
            const code = await sock.requestPairingCode(phone);
            const fmt  = code.match(/.{1,4}/g)?.join('-') ?? code;
            this.emit('pairing_code', { sessionId, code: fmt });
          } catch (e) {
            this.emit('auth_error', { sessionId, error: e.message });
            // fallback to QR
            const url = await QRCode.toDataURL(qr, { width: 300 });
            this.emit('qr_code', { sessionId, qr: url });
            this._updateStatus(sessionId, 'qr_pending');
          }
        } else {
          const url = await QRCode.toDataURL(qr, { width: 300 });
          this.emit('qr_code', { sessionId, qr: url });
          this._updateStatus(sessionId, 'qr_pending');
        }
      }

      if (connection === 'open') {
        const ph   = sock.user?.id?.split(':')[0] ?? '';
        const name = sock.user?.name ?? '';
        this.sessions.set(sessionId, { sock, status: 'connected', phone: ph });
        db.prepare('UPDATE sessions SET status=?, phone=?, name=COALESCE(NULLIF(?,""),name), updated_at=datetime("now") WHERE id=?')
          .run('connected', ph, name, sessionId);
        this.emit('session_connected', { sessionId, phone: ph, name });
        setTimeout(() => this.syncGroups(sessionId), 3000);
      }

      if (connection === 'close') {
        const code     = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut || code === 401;
        this.sessions.delete(sessionId);
        this._updateStatus(sessionId, 'disconnected');
        this.emit('session_disconnected', { sessionId, loggedOut });

        if (loggedOut) {
          fs.rmSync(sp, { recursive: true, force: true });
          db.prepare('UPDATE sessions SET creds_data=NULL WHERE id=?').run(sessionId);
        } else {
          setTimeout(() => this.startSession(sessionId, false, null), 15_000);
        }
      }
    });
  }

  async syncGroups(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s || s.status !== 'connected') return;
    try {
      const groups  = await s.sock.groupFetchAllParticipating();
      const entries = Object.values(groups);
      const stmt    = db.prepare(`
        INSERT INTO groups_cache (session_id, group_jid, group_name, participant_count, is_admin, last_synced_at)
        VALUES (?,?,?,?,?,datetime('now'))
        ON CONFLICT(session_id, group_jid) DO UPDATE SET
          group_name=excluded.group_name,
          participant_count=excluded.participant_count,
          is_admin=excluded.is_admin,
          last_synced_at=datetime('now')
      `);
      const tx = db.transaction(() => {
        for (const g of entries) {
          const isAdmin = g.participants.some(
            p => p.id === s.sock.user?.id && (p.admin === 'admin' || p.admin === 'superadmin')
          );
          stmt.run(sessionId, g.id, g.subject, g.participants.length, isAdmin ? 1 : 0);
        }
      });
      tx();
      this.emit('groups_synced', { sessionId, count: entries.length });
      console.log(`[${sessionId}] ${entries.length} grup senkronize edildi`);
    } catch (e) {
      console.error(`[${sessionId}] Grup sync hatası:`, e.message);
    }
  }

  async sendMessage(sessionId, jid, message, media) {
    const s = this.sessions.get(sessionId);
    if (!s || s.status !== 'connected') throw new Error('Oturum bağlı değil: ' + sessionId);

    if (media && fs.existsSync(media.path)) {
      const content = { caption: message || '' };
      if (media.type === 'image')    content.image    = { url: media.path };
      else if (media.type === 'video') content.video  = { url: media.path };
      else { content.document = { url: media.path }; content.fileName = media.name; content.mimetype = 'application/octet-stream'; }
      await s.sock.sendMessage(jid, content);
    } else {
      await s.sock.sendMessage(jid, { text: message });
    }
  }

  isAdmin(sessionId, jid) {
    const r = db.prepare('SELECT is_admin FROM groups_cache WHERE session_id=? AND group_jid=?').get(sessionId, jid);
    return r?.is_admin === 1;
  }

  async disconnect(sessionId) {
    const s = this.sessions.get(sessionId);
    if (s) { try { await s.sock.logout(); } catch (_) {} this.sessions.delete(sessionId); }
    const sp = path.join(SESSIONS_DIR, sessionId);
    fs.rmSync(sp, { recursive: true, force: true });
    db.prepare('UPDATE sessions SET status=?,creds_data=NULL WHERE id=?').run('disconnected', sessionId);
  }

  getConnected() {
    return [...this.sessions.entries()].filter(([, s]) => s.status === 'connected').map(([id]) => id);
  }

  _updateStatus(sessionId, status) {
    db.prepare('UPDATE sessions SET status=?,updated_at=datetime("now") WHERE id=?').run(status, sessionId);
    this.emit('session_status', { sessionId, status });
  }
}

module.exports = new WhatsAppManager();

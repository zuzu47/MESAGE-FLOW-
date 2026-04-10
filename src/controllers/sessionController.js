const { v4: uuidv4 } = require('uuid');
const db  = require('../db/database');
const wam = require('../services/whatsappManager');

exports.getSessions = (req, res) => {
  const rows = db.prepare('SELECT id,name,phone,status,created_at FROM sessions ORDER BY created_at DESC').all();
  res.json(rows);
};

exports.createSession = async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'İsim gerekli' });
  const id = uuidv4();
  db.prepare('INSERT INTO sessions (id,name,status) VALUES (?,?,?)').run(id, name.trim(), 'disconnected');
  res.json({ id, name: name.trim(), status: 'disconnected' });
};

exports.connectQR = async (req, res) => {
  const { id } = req.params;
  const s = db.prepare('SELECT id FROM sessions WHERE id=?').get(id);
  if (!s) return res.status(404).json({ error: 'Oturum bulunamadı' });
  wam.startSession(id, false, null).catch(console.error);
  res.json({ message: 'QR oluşturuluyor…', sessionId: id });
};

exports.connectPairing = async (req, res) => {
  const { id } = req.params;
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Telefon numarası gerekli' });
  const clean = phoneNumber.replace(/\D/g, '');
  if (clean.length < 10) return res.status(400).json({ error: 'Geçersiz numara' });
  const s = db.prepare('SELECT id FROM sessions WHERE id=?').get(id);
  if (!s) return res.status(404).json({ error: 'Oturum bulunamadı' });
  wam.startSession(id, true, clean).catch(console.error);
  res.json({ message: 'Pairing kodu isteniyor…', sessionId: id });
};

exports.deleteSession = async (req, res) => {
  const { id } = req.params;
  await wam.disconnect(id);
  db.prepare('DELETE FROM sessions WHERE id=?').run(id);
  res.json({ message: 'Silindi' });
};

exports.getGroups = (req, res) => {
  const rows = db.prepare(`
    SELECT id,group_jid,group_name,participant_count,is_admin,last_synced_at
    FROM groups_cache WHERE session_id=? AND is_active=1 ORDER BY group_name
  `).all(req.params.id);
  res.json(rows);
};

exports.syncGroups = async (req, res) => {
  await wam.syncGroups(req.params.id);
  res.json({ message: 'Senkronizasyon başlatıldı' });
};

exports.getAllGroups = (req, res) => {
  const rows = db.prepare(`
    SELECT g.id, g.group_jid, g.group_name, g.participant_count, g.is_admin,
           g.session_id, s.name as session_name, s.phone as session_phone
    FROM groups_cache g JOIN sessions s ON g.session_id=s.id
    WHERE g.is_active=1 AND s.status='connected'
    ORDER BY g.group_name
  `).all();
  res.json(rows);
};

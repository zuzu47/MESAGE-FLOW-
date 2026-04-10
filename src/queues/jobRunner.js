const db  = require('../db/database');
const wam = require('../services/whatsappManager');
const fs  = require('fs');

let io = null;
let running = false;
const queue = [];

function setIO(socketIO) { io = socketIO; }
function emit(e, d) { io?.emit(e, d); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randDelay() { return 3000 + Math.floor(Math.random() * 2000); }

let rrIndex = 0;
function pickSession(sessions) {
  const s = sessions[rrIndex % sessions.length];
  rrIndex++;
  return s;
}

function enqueue(payload) {
  queue.push(payload);
  if (!running) processNext();
}

async function processNext() {
  if (queue.length === 0) { running = false; return; }
  running = true;
  const payload = queue.shift();
  try { await runJob(payload); }
  catch (e) { console.error('Job hatası:', e.message); }
  processNext();
}

async function runJob({ jobId, groupJids, message, mediaPath, mediaType, mediaName, scheduledAt }) {
  // Zamanlanmış ise bekle
  if (scheduledAt) {
    const wait = new Date(scheduledAt).getTime() - Date.now();
    if (wait > 0) {
      console.log(`[Job ${jobId}] ${Math.round(wait/1000)}s sonra gönderilecek`);
      await sleep(wait);
    }
  }

  db.prepare('UPDATE jobs SET status=?,started_at=datetime("now") WHERE id=?').run('running', jobId);
  emit('job_started', { jobId });

  const connected = wam.getConnected();
  if (!connected.length) {
    db.prepare('UPDATE jobs SET status=?,completed_at=datetime("now") WHERE id=?').run('failed', jobId);
    emit('job_completed', { jobId, sent: 0, failed: groupJids.length, total: groupJids.length });
    return;
  }

  let sent = 0, failed = 0;
  const total = groupJids.length;

  for (let i = 0; i < groupJids.length; i++) {
    const jid = groupJids[i];
    const groupRow = db.prepare('SELECT group_name, session_id FROM groups_cache WHERE group_jid=? AND is_active=1 LIMIT 1').get(jid);
    const groupName = groupRow?.group_name ?? jid;

    // Session seç: önce grubun kendi session'ı, yoksa round-robin
    const preferred = groupRow?.session_id;
    const sessionId = preferred && connected.includes(preferred) ? preferred : pickSession(connected);

    // Admin kontrolü
    if (!wam.isAdmin(sessionId, jid)) {
      failed++;
      db.prepare('INSERT INTO job_logs (job_id,session_id,group_jid,group_name,status,error_msg) VALUES (?,?,?,?,?,?)').run(jobId, sessionId, jid, groupName, 'failed_admin', 'Admin değil');
      emit('job_progress', { jobId, groupJid: jid, groupName, sessionId, status: 'failed_admin', sent, failed, total });
      continue;
    }

    try {
      const media = mediaPath ? { path: mediaPath, type: mediaType, name: mediaName } : undefined;
      await wam.sendMessage(sessionId, jid, message, media);
      sent++;
      db.prepare('INSERT INTO job_logs (job_id,session_id,group_jid,group_name,status) VALUES (?,?,?,?,?)').run(jobId, sessionId, jid, groupName, 'sent');
      emit('job_progress', { jobId, groupJid: jid, groupName, sessionId, status: 'sent', sent, failed, total });

      if (i < groupJids.length - 1) await sleep(randDelay());
    } catch (e) {
      failed++;
      db.prepare('INSERT INTO job_logs (job_id,session_id,group_jid,group_name,status,error_msg) VALUES (?,?,?,?,?,?)').run(jobId, sessionId, jid, groupName, 'failed_error', e.message);
      emit('job_progress', { jobId, groupJid: jid, groupName, sessionId, status: 'failed_error', sent, failed, total, error: e.message });
    }

    db.prepare('UPDATE jobs SET sent_count=?,failed_count=? WHERE id=?').run(sent, failed, jobId);
  }

  // Medyayı sil
  if (mediaPath && fs.existsSync(mediaPath)) fs.unlinkSync(mediaPath);

  db.prepare('UPDATE jobs SET status=?,completed_at=datetime("now"),sent_count=?,failed_count=? WHERE id=?').run('completed', sent, failed, jobId);
  emit('job_completed', { jobId, sent, failed, total });
  console.log(`[Job ${jobId}] Tamamlandı: ${sent}/${total}`);
}

module.exports = { enqueue, setIO };

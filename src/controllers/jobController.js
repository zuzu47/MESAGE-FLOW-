const { v4: uuidv4 } = require('uuid');
const db     = require('../db/database');
const runner = require('../queues/jobRunner');

exports.createJob = (req, res) => {
  let groupJids;
  try { groupJids = JSON.parse(req.body.groupJids); } catch { groupJids = req.body.groupJids; }
  if (!Array.isArray(groupJids) || !groupJids.length) return res.status(400).json({ error: 'Grup seçin' });

  const { message, scheduledAt, name } = req.body;
  if (!message?.trim() && !req.file) return res.status(400).json({ error: 'Mesaj veya medya gerekli' });

  let mediaPath, mediaType, mediaName;
  if (req.file) {
    mediaPath = req.file.path;
    mediaName = req.file.originalname;
    mediaType = req.file.mimetype.startsWith('image/') ? 'image' : req.file.mimetype.startsWith('video/') ? 'video' : 'document';
  }

  const jobId  = uuidv4();
  const jobName = name || `Görev ${new Date().toLocaleString('tr-TR')}`;

  db.prepare('INSERT INTO jobs (id,name,status,total_groups,scheduled_at) VALUES (?,?,?,?,?)').run(jobId, jobName, 'pending', groupJids.length, scheduledAt || null);

  runner.enqueue({ jobId, groupJids, message: message || '', mediaPath, mediaType, mediaName, scheduledAt });

  res.json({ jobId, name: jobName, status: 'pending', total_groups: groupJids.length, created_at: new Date().toISOString() });
};

exports.getJobs = (req, res) => {
  const rows = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50').all();
  res.json(rows);
};

exports.getJobLogs = (req, res) => {
  const rows = db.prepare(`
    SELECT jl.*, s.name as session_name
    FROM job_logs jl LEFT JOIN sessions s ON jl.session_id=s.id
    WHERE jl.job_id=? ORDER BY jl.sent_at
  `).all(req.params.id);
  res.json(rows);
};

exports.deleteJob = (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id=?').run(req.params.id);
  res.json({ message: 'Silindi' });
};

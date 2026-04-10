const crypto = require('crypto');
const ALGO = 'aes-256-gcm';

function getKey() {
  const k = (process.env.SESSION_ENCRYPTION_KEY || 'changeme32characterslongkey12345');
  return Buffer.from(k.padEnd(32, '0').slice(0, 32));
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(data) {
  const buf = Buffer.from(data, 'base64');
  const iv = buf.slice(0, 16), tag = buf.slice(16, 32), enc = buf.slice(32);
  const d = crypto.createDecipheriv(ALGO, getKey(), iv);
  d.setAuthTag(tag);
  return d.update(enc) + d.final('utf8');
}

module.exports = { encrypt, decrypt };

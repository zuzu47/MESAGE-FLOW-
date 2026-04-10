require('dotenv').config();

const express  = require('express');
const http     = require('http');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const cron     = require('node-cron');
const { Server } = require('socket.io');

const routes = require('./routes');
const wam    = require('./services/whatsappManager');
const runner = require('./queues/jobRunner');

const PORT = process.env.PORT || 3000;
const app  = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

wam.setIO(io);
runner.setIO(io);

// API
app.use('/api', routes);
app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Serve React frontend
const DIST = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_, res) => res.sendFile(path.join(DIST, 'index.html')));
  console.log('✅ Frontend statik dosyalar servis ediliyor');
} else {
  console.warn('⚠️  Frontend dist klasörü bulunamadı');
}

io.on('connection', (socket) => {
  console.log('[Socket]', socket.id, 'bağlandı');
});

// Her 6 saatte bir grup senkronizasyonu
cron.schedule('0 */6 * * *', async () => {
  const sessions = wam.getConnected();
  for (const id of sessions) await wam.syncGroups(id);
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ✅  WA Toplu Mesaj Paneli`);
  console.log(`  🌐  http://0.0.0.0:${PORT}`);
  console.log(`  🗄️   SQLite (Chrome gerekmez)`);
  console.log(`${'═'.repeat(50)}\n`);

  await wam.loadAllSessions();
});

['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, () => { server.close(() => process.exit(0)); });
});

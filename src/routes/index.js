const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const { v4: uuidv4 } = require('uuid');
const sc = require('../controllers/sessionController');
const jc = require('../controllers/jobController');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const fs = require('fs');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

router.get   ('/sessions',                      sc.getSessions);
router.post  ('/sessions',                      sc.createSession);
router.post  ('/sessions/:id/connect/qr',       sc.connectQR);
router.post  ('/sessions/:id/connect/pairing',  sc.connectPairing);
router.delete('/sessions/:id',                  sc.deleteSession);
router.get   ('/sessions/:id/groups',           sc.getGroups);
router.post  ('/sessions/:id/groups/sync',      sc.syncGroups);
router.get   ('/groups',                        sc.getAllGroups);

router.post  ('/jobs',          upload.single('media'), jc.createJob);
router.get   ('/jobs',                                  jc.getJobs);
router.get   ('/jobs/:id/logs',                         jc.getJobLogs);
router.delete('/jobs/:id',                              jc.deleteJob);

module.exports = router;

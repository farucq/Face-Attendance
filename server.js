const express = require('express');
const http = require('http');
const https = require('https');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;

const keyPath = path.join(__dirname, 'private-key.pem');
const certPath = path.join(__dirname, 'certificate.pem');
const useSSL = fs.existsSync(keyPath) && fs.existsSync(certPath);

let sslOptions;
if (useSSL) {
  sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
}

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static('public'));
app.use('/models', express.static('models'));

const DATA_DIR = path.join(__dirname, 'data');
const FACES_DIR = path.join(__dirname, 'public', 'faces');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FACES_DIR)) fs.mkdirSync(FACES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FACES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

function loadJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/attendance', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'attendance.html'));
});

app.post('/api/register', upload.single('image'), (req, res) => {
  const { name, id: userId, descriptor } = req.body;
  if (!name || !userId || !req.file) {
    return res.status(400).json({ error: 'Name, ID, and photo are required' });
  }

  if (!descriptor) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Face descriptor is required. Ensure your face is visible.' });
  }

  const users = loadJSON(USERS_FILE, []);
  const exists = users.find(u => u.id === userId);
  if (exists) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'User ID already exists' });
  }

  let parsedDescriptor;
  try {
    parsedDescriptor = JSON.parse(descriptor);
  } catch (e) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Invalid face descriptor' });
  }

  const user = {
    id: userId,
    name,
    photo: `/faces/${req.file.filename}`,
    descriptor: parsedDescriptor,
    registeredAt: new Date().toISOString()
  };

  users.push(user);
  saveJSON(USERS_FILE, users);
  res.json({ success: true, message: `${name} registered successfully`, user });
});

app.get('/api/users', (req, res) => {
  const users = loadJSON(USERS_FILE, []);
  res.json(users);
});

app.post('/api/attendance/mark', (req, res) => {
  const { userId, name } = req.body;
  if (!userId || !name) {
    return res.status(400).json({ error: 'userId and name are required' });
  }

  const records = loadJSON(ATTENDANCE_FILE, []);
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const alreadyMarked = records.find(
    r => r.userId === userId && r.timestamp.startsWith(today)
  );

  if (alreadyMarked) {
    return res.json({ success: true, message: `${name} already marked present today`, alreadyMarked: true });
  }

  const record = {
    id: uuidv4(),
    userId,
    name,
    timestamp: now.toISOString(),
    status: 'Present'
  };

  records.push(record);
  saveJSON(ATTENDANCE_FILE, records);
  res.json({ success: true, message: `Attendance marked for ${name}`, record });
});

app.get('/api/attendance', (req, res) => {
  const records = loadJSON(ATTENDANCE_FILE, []);
  res.json(records.reverse());
});

app.get('/api/attendance/today', (req, res) => {
  const records = loadJSON(ATTENDANCE_FILE, []);
  const today = new Date().toISOString().split('T')[0];
  const todayRecords = records.filter(r => r.timestamp.startsWith(today));
  res.json(todayRecords.reverse());
});

app.get('/api/stats', (req, res) => {
  const users = loadJSON(USERS_FILE, []);
  const records = loadJSON(ATTENDANCE_FILE, []);
  const today = new Date().toISOString().split('T')[0];
  const todayRecords = records.filter(r => r.timestamp.startsWith(today));
  const presentToday = new Set(todayRecords.map(r => r.userId));

  res.json({
    totalRegistered: users.length,
    presentToday: presentToday.size,
    totalRecords: records.length
  });
});

app.get('/api/export/csv', (req, res) => {
  const records = loadJSON(ATTENDANCE_FILE, []);
  let csv = 'Timestamp,Name,User ID,Status\n';
  records.forEach(r => {
    csv += `${r.timestamp},${r.name},${r.userId},${r.status}\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=attendance_${new Date().toISOString().split('T')[0]}.csv`);
  res.send(csv);
});

if (useSSL) {
  https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`Face Attendance System running at https://0.0.0.0:${PORT}`);
  });
} else {
  http.createServer(app).listen(PORT, '0.0.0.0', () => {
    console.log(`Face Attendance System running at http://0.0.0.0:${PORT}`);
  });
}

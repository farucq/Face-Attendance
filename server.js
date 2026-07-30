const express = require('express');
const http = require('http');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI environment variable is not set');
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_STATIC_URL;
const CLIENT_DIST = path.join(__dirname, 'client', 'dist');

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

mongoose.connect(MONGODB_URI, {
  bufferCommands: false,
  serverSelectionTimeoutMS: 5000
}).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err.message);
  process.exit(1);
});

mongoose.connection.on('error', err => {
  console.error('MongoDB runtime error:', err.message);
});

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  photo: { type: String },
  descriptors: { type: Array, default: [] },
  descriptor: { type: Array, default: [] },
  registeredAt: { type: Date, default: Date.now }
});

const attendanceSchema = new mongoose.Schema({
  id: { type: String, required: true },
  userId: { type: String, required: true },
  name: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: 'Present' }
});

const User = mongoose.model('User', userSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);

const DATA_DIR = path.join(__dirname, 'data');
const FACES_DIR = path.join(__dirname, 'data', 'faces');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FACES_DIR)) fs.mkdirSync(FACES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FACES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  }
});

app.post('/api/register', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError || err.message?.includes('Only JPEG')) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { name, id: userId, descriptor, descriptors } = req.body;
    if (!name || !userId || !req.file) {
      return res.status(400).json({ error: 'Name, ID, and photo are required' });
    }

    if (!descriptor && !descriptors) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Face descriptor is required. Ensure your face is visible.' });
    }

    const exists = await User.findOne({ id: userId });
    if (exists) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'User ID already exists' });
    }

    let parsedDescriptors = [];
    try {
      if (descriptors) {
        parsedDescriptors = JSON.parse(descriptors);
      } else if (descriptor) {
        const single = JSON.parse(descriptor);
        if (!Array.isArray(single)) throw new Error('Invalid descriptor');
        parsedDescriptors = [single];
      }
      if (!Array.isArray(parsedDescriptors) || parsedDescriptors.length === 0) {
        throw new Error('No valid descriptors');
      }
      for (const d of parsedDescriptors) {
        if (!Array.isArray(d) || d.length !== 128) {
          throw new Error('Invalid descriptor format');
        }
      }
    } catch (e) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid face descriptor' });
    }

    const user = await User.create({
      id: userId,
      name,
      photo: `/api/faces/${req.file.filename}`,
      descriptors: parsedDescriptors,
      descriptor: parsedDescriptors[0],
      registeredAt: new Date()
    });

    res.json({ success: true, message: `${name} registered successfully (${parsedDescriptors.length} samples)`, user });
  } catch (err) {
    console.error('Register error:', err);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: `Registration failed: ${err.message}` });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().sort({ registeredAt: -1 }).lean();
    res.json(users);
  } catch (err) {
    console.error('Fetch users error:', err.message);
    res.json([]);
  }
});

app.post('/api/attendance/mark', async (req, res) => {
  try {
    const { userId, name } = req.body;
    if (!userId || !name) {
      return res.status(400).json({ error: 'userId and name are required' });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const alreadyMarked = await Attendance.findOne({
      userId,
      timestamp: { $gte: todayStart, $lt: todayEnd }
    });

    if (alreadyMarked) {
      return res.json({ success: true, message: `${name} already marked present today`, alreadyMarked: true });
    }

    const record = await Attendance.create({
      id: uuidv4(),
      userId,
      name,
      timestamp: new Date(),
      status: 'Present'
    });

    res.json({ success: true, message: `Attendance marked for ${name}`, record });
  } catch (err) {
    console.error('Mark attendance error:', err.message);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

app.get('/api/attendance', async (req, res) => {
  try {
    const records = await Attendance.find().sort({ timestamp: -1 }).lean();
    res.json(records);
  } catch (err) {
    console.error('Fetch attendance error:', err.message);
    res.json([]);
  }
});

app.get('/api/attendance/today', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const records = await Attendance.find({
      timestamp: { $gte: todayStart, $lt: todayEnd }
    }).sort({ timestamp: -1 }).lean();

    res.json(records);
  } catch (err) {
    console.error('Fetch today attendance error:', err.message);
    res.json([]);
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const totalRegistered = await User.countDocuments();
    const totalRecords = await Attendance.countDocuments();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todayUserIds = await Attendance.find({
      timestamp: { $gte: todayStart, $lt: todayEnd }
    }).distinct('userId');

    res.json({
      totalRegistered,
      presentToday: todayUserIds.length,
      totalRecords
    });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.json({ totalRegistered: 0, presentToday: 0, totalRecords: 0 });
  }
});

app.get('/api/export/csv', async (req, res) => {
  try {
    const records = await Attendance.find().sort({ timestamp: -1 }).lean();
    let csv = 'Timestamp,Name,User ID,Status\n';
    records.forEach(r => {
      csv += `${new Date(r.timestamp).toISOString()},${r.name},${r.userId},${r.status}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('Export CSV error:', err.message);
    res.status(500).send('Export failed');
  }
});

app.use('/api/faces', express.static(FACES_DIR));
app.use('/models', express.static(path.join(__dirname, 'models')));

if (isProduction && fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.use(express.static('public'));
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
  app.get('/attendance', (req, res) => res.sendFile(path.join(__dirname, 'public', 'attendance.html')));
}

http.createServer(app).listen(PORT, '0.0.0.0', () => {
  console.log(`FaceTrack running at http://0.0.0.0:${PORT} [${isProduction ? 'production' : 'development'}]`);
});

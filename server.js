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
}).then(async () => {
  console.log('MongoDB connected');
  try {
    await mongoose.connection.db.collection('users').dropIndex('email_1');
    console.log('Dropped stale email_1 index');
  } catch (e) {
    if (e.code !== 27) console.error('Index cleanup:', e.message);
  }
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
  age: { type: Number },
  gender: { type: String },
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

function euclideanDistance(a, b) {
  if (a.length !== b.length) return Infinity;
  return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
}

async function findMatchingUser(descriptor) {
  const users = await User.find({
    $or: [
      { descriptors: { $exists: true, $not: { $size: 0 } } },
      { descriptor: { $exists: true, $not: { $size: 0 } } }
    ]
  }).lean();
  const THRESHOLD = 0.5;
  let bestMatch = null;
  let bestDist = THRESHOLD;
  for (const user of users) {
    const samples = user.descriptors && user.descriptors.length > 0
      ? user.descriptors
      : user.descriptor
        ? [user.descriptor]
        : [];
    for (const sample of samples) {
      if (!Array.isArray(sample) || sample.length !== 128) continue;
      const dist = euclideanDistance(descriptor, sample);
      if (dist < bestDist) {
        bestDist = dist;
        bestMatch = user;
      }
    }
  }
  return bestMatch;
}

async function getNextEmpId() {
  const lastUser = await User.findOne().sort({ registeredAt: -1 }).lean();
  let nextNum = 1;
  if (lastUser && lastUser.id) {
    const m = lastUser.id.match(/EMP(\d+)/i);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }
  return `EMP${String(nextNum).padStart(2, '0')}`;
}

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
    const { name, age, gender, descriptor, descriptors } = req.body;
    if (!name || !req.file) {
      return res.status(400).json({ error: 'Name and photo are required' });
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

    const match = await findMatchingUser(parsedDescriptors[0]);
    if (match) {
      fs.unlinkSync(req.file.path);
      return res.json({
        matched: true,
        user: { id: match.id, name: match.name, photo: match.photo, registeredAt: match.registeredAt }
      });
    }

    const newId = await getNextEmpId();

    const user = await User.create({
      id: newId,
      name,
      age: age ? Number(age) : undefined,
      gender: gender || undefined,
      photo: `/api/faces/${req.file.filename}`,
      descriptors: parsedDescriptors,
      descriptor: parsedDescriptors[0],
      registeredAt: new Date()
    });

    res.json({ success: true, message: `${name} registered as ${newId}`, user });
  } catch (err) {
    console.error('Register error:', err);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: `Registration failed: ${err.message}` });
  }
});

app.put('/api/users/:id', (req, res, next) => {
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
    const existing = await User.findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const { name, age, gender, descriptor, descriptors } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (age) updateData.age = Number(age);
    if (gender) updateData.gender = gender;

    let parsedDescriptors = [];
    try {
      if (descriptors) {
        parsedDescriptors = JSON.parse(descriptors);
      } else if (descriptor) {
        const single = JSON.parse(descriptor);
        if (!Array.isArray(single)) throw new Error('Invalid');
        parsedDescriptors = [single];
      }
      for (const d of parsedDescriptors) {
        if (!Array.isArray(d) || d.length !== 128) throw new Error('Invalid');
      }
      if (parsedDescriptors.length > 0) {
        updateData.descriptors = parsedDescriptors;
        updateData.descriptor = parsedDescriptors[0];
      }
    } catch (e) {
      if (!req.file) {
        return res.status(400).json({ error: 'Invalid face descriptor' });
      }
    }

    if (req.file) {
      if (existing.photo) {
        const oldPath = path.join(FACES_DIR, path.basename(existing.photo));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updateData.photo = `/api/faces/${req.file.filename}`;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const updated = await User.findOneAndUpdate({ id: req.params.id }, updateData, { new: true }).lean();
    res.json({ success: true, message: `${updated.name} updated successfully`, user: updated });
  } catch (err) {
    console.error('Update error:', err);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Update failed' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.photo) {
      const photoPath = path.join(FACES_DIR, path.basename(user.photo));
      if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
    }

    await User.deleteOne({ id: req.params.id });
    res.json({ success: true, message: `${user.name} deleted successfully` });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: 'Delete failed' });
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

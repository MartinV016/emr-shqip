/**
 * 🏥 EMR Shqip - Backend Server
 */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'EMR_SHQIP_SECURE_2026';
const DB_PATH = path.join(__dirname, 'emr.db');

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Database
if (!fs.existsSync(DB_PATH)) console.log('🗄️ Krijimi i bazës së të dhënave...');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
console.log('📋 Inicializimi i tabelave...');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT DEFAULT 'doctor',
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    has_subscription INTEGER DEFAULT 0,
    subscription_end TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS patients (
    patient_id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth TEXT,
    gender TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS doctors (
    doctor_id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    specialization TEXT,
    license_number TEXT UNIQUE,
    contact_phone TEXT,
    contact_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS appointments (
    appointment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER REFERENCES patients(patient_id),
    doctor_id INTEGER REFERENCES doctors(doctor_id),
    appointment_date TEXT NOT NULL,
    reason_for_visit TEXT,
    status TEXT DEFAULT 'scheduled',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS visits (
    visit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER REFERENCES patients(patient_id),
    doctor_id INTEGER REFERENCES doctors(doctor_id),
    appointment_id INTEGER REFERENCES appointments(appointment_id),
    visit_date TEXT NOT NULL,
    diagnosis TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS prescriptions (
    prescription_id INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id INTEGER REFERENCES visits(visit_id),
    patient_id INTEGER REFERENCES patients(patient_id),
    doctor_id INTEGER REFERENCES doctors(doctor_id),
    medication_name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    instructions TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS billing (
    bill_id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER REFERENCES patients(patient_id),
    visit_id INTEGER REFERENCES visits(visit_id),
    amount REAL NOT NULL,
    status TEXT DEFAULT 'unpaid',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(user_id),
    action TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    sub_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(user_id),
    plan TEXT DEFAULT 'pro',
    amount REAL,
    payment_method TEXT,
    status TEXT DEFAULT 'completed',
    expires_at TEXT
  );
`);

// Create admin if not exists
const adminExists = db.prepare('SELECT user_id FROM users WHERE email = ?').get('admin@emr.al');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (email, password_hash, role, has_subscription, subscription_end) VALUES (?, ?, ?, ?, ?)').run(
    'admin@emr.al', hash, 'admin', 1, new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0]
  );
  console.log('👤 Admin i krijuar: admin@emr.al / admin123');
}

// Auth middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token mungon' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    const u = db.prepare('SELECT has_subscription, subscription_end FROM users WHERE user_id = ?').get(req.user.user_id);
    if (!u?.has_subscription || (u.subscription_end && new Date(u.subscription_end) < new Date())) {
      return res.status(403).json({ error: 'Abonimi ka skaduar', needsSubscription: true });
    }
    next();
  } catch { res.status(403).json({ error: 'Token i pavlefshëm' }); }
};

// === API ROUTES ===
app.post('/api/register', (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || password.length < 6) return res.status(400).json({ error: 'Plotëso email dhe password (min 6 karaktere)' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email.toLowerCase().trim(), hash);
    res.json({ success: true, message: 'Regjistrimi i suksesshëm!' });
  } catch (e) { res.status(400).json({ error: 'Email ekziston tashmë' }); }
});

app.post('/api/login', (req, res) => {
  const { identifier, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(identifier?.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Kredenciale të gabim' });
  if (!user.has_subscription || (user.subscription_end && new Date(user.subscription_end) < new Date())) {
    return res.status(403).json({ error: 'Abonimi ka skaduar', needsSubscription: true });
  }
  const token = jwt.sign({ user_id: user.user_id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.user_id, role: user.role, email: user.email } });
});

app.post('/api/subscribe', (req, res) => {
  const { email, plan, amount } = req.body;
  const user = db.prepare('SELECT user_id FROM users WHERE email = ?').get(email?.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'User-i nuk u gjet' });
  const exp = new Date(); exp.setMonth(exp.getMonth() + (plan === 'basic' ? 1 : plan === 'pro' ? 3 : 12));
  db.prepare('UPDATE users SET has_subscription = 1, subscription_end = ? WHERE user_id = ?').run(exp.toISOString().split('T')[0], user.user_id);
  db.prepare('INSERT INTO subscriptions (user_id, plan, amount, expires_at) VALUES (?, ?, ?, ?)').run(user.user_id, plan, amount, exp.toISOString().split('T')[0]);
  res.json({ success: true, expires_at: exp.toISOString().split('T')[0] });
});

app.get('/api/dashboard', authenticate, (req, res) => {
  const p = db.prepare('SELECT COUNT(*) c FROM patients').get().c;
  const a = db.prepare('SELECT COUNT(*) c FROM appointments').get().c;
  const b = db.prepare('SELECT COUNT(*) c FROM billing WHERE status = ?', 'unpaid').get().c;
  res.json({ metrics: { patients: p, appointments: a, unpaid_bills: b }, recent: [{action:'Sistem', desc:'Përditësuar', time: new Date().toISOString()}] });
});

// Dynamic module routes
const modules = { patients: 'patients', doctors: 'doctors', appointments: 'appointments', visits: 'visits', prescriptions: 'prescriptions', billing: 'billing' };
Object.entries(modules).forEach(([route, table]) => {
  app.get(`/api/${route}`, authenticate, (req, res) => res.json(db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`).all()));
  app.post(`/api/${route}`, authenticate, (req, res) => {
    const cols = Object.keys(req.body).join(', ');
    const vals = Object.values(req.body);
    const ph = vals.map(()=>'?').join(', ');
    try { db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${ph})`).run(...vals); res.json({ success: true }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
});

// Notifications & CRM
app.get('/api/notifications', authenticate, (req, res) => res.json([{id:1, title:'Mirë se erdhe', desc:'Sistemi u nis me sukses', read:0, time: new Date().toISOString()}]));
app.get('/api/crm', authenticate, (req, res) => res.json([{id:1, patient:'Test', type:'Telefon', notes:'Konfirmim takimi', time: new Date().toISOString()}]));

// ✅ SERVE FRONTEND - ZGJIDHJA PËR ROUTING (PA *)
const frontendPath = path.join(__dirname, '../frontend');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  
  // ✅ RUTA E SAKTË PËR FALLBACK (zëvendëson '*')
  app.get(/^\/(?!api\/).*/, (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ error: 'Gabim i brendshëm në server' });
});

app.use((req, res) => {
  if (!req.path.startsWith('/api/')) return;
  res.status(404).json({ error: 'Ruga nuk u gjet' });
});

// Start server
process.on('SIGINT', () => { db.close(); process.exit(0); });
app.listen(PORT, () => console.log(`\n✅ EMR Backend po punon në http://localhost:${PORT}\n👤 Admin: admin@emr.al / admin123\n`));
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'avfc-print-stock-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// Passwords
const STAFF_PASSWORD = 'AVFC';
const ADMIN_PASSWORD = 'AVFCADMIN';

// Data file
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'stock.json');

// Initialize stock data
function initializeStock() {
  if (fs.existsSync(DATA_FILE)) return;

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const numbers = '0123456789'.split('');
  const kits = ['home', 'away', 'third'];
  const stock = {};

  // Prem and Club fonts — full sizes
  for (const font of ['prem', 'club']) {
    stock[font] = {};
    for (const kit of kits) {
      stock[font][kit] = {
        letters: {
          adult: {},
          baby: {}
        },
        numbers: {
          adult: {},
          youth: {},
          short: {}
        }
      };
      letters.forEach(l => {
        stock[font][kit].letters.adult[l] = 'green';
        stock[font][kit].letters.baby[l] = 'green';
      });
      numbers.forEach(n => {
        stock[font][kit].numbers.adult[n] = 'green';
        stock[font][kit].numbers.youth[n] = 'green';
        stock[font][kit].numbers.short[n] = 'green';
      });
    }
  }

  // WSL font — adult only
  stock['wsl'] = {};
  for (const kit of kits) {
    stock['wsl'][kit] = {
      letters: {
        adult: {}
      },
      numbers: {
        adult: {}
      }
    };
    letters.forEach(l => {
      stock['wsl'][kit].letters.adult[l] = 'green';
    });
    numbers.forEach(n => {
      stock['wsl'][kit].numbers.adult[n] = 'green';
    });
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(stock, null, 2));
  console.log('Stock data initialized.');
}

function readStock() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeStock(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Auth middleware
function requireStaff(req, res, next) {
  if (req.session && (req.session.role === 'staff' || req.session.role === 'admin')) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  res.status(401).json({ error: 'Admin access required' });
}

// ─── AUTH ROUTES ───
app.post('/api/login', (req, res) => {
  const { password, role } = req.body;
  if (role === 'staff' && password === STAFF_PASSWORD) {
    req.session.role = 'staff';
    return res.json({ success: true, role: 'staff' });
  }
  if (role === 'admin' && password === ADMIN_PASSWORD) {
    req.session.role = 'admin';
    return res.json({ success: true, role: 'admin' });
  }
  res.status(401).json({ error: 'Invalid password' });
});

app.get('/api/auth', (req, res) => {
  if (req.session && req.session.role) {
    return res.json({ authenticated: true, role: req.session.role });
  }
  res.json({ authenticated: false });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ─── STOCK ROUTES ───
app.get('/api/stock', requireStaff, (req, res) => {
  const stock = readStock();
  res.json(stock);
});

app.get('/api/stock/:font/:kit', requireStaff, (req, res) => {
  const stock = readStock();
  const { font, kit } = req.params;
  if (stock[font] && stock[font][kit]) {
    return res.json(stock[font][kit]);
  }
  res.status(404).json({ error: 'Not found' });
});

// Update single item status
app.put('/api/stock', requireAdmin, (req, res) => {
  const { font, kit, category, size, item, status } = req.body;
  if (!['green', 'yellow', 'red'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const stock = readStock();
  try {
    stock[font][kit][category][size][item] = status;
    writeStock(stock);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Invalid path' });
  }
});

// Bulk update for a size group
app.put('/api/stock/bulk', requireAdmin, (req, res) => {
  const { font, kit, category, size, status } = req.body;
  if (!['green', 'yellow', 'red'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const stock = readStock();
  try {
    const items = stock[font][kit][category][size];
    for (const key of Object.keys(items)) {
      items[key] = status;
    }
    writeStock(stock);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Invalid path' });
  }
});

// ─── SERVE PAGES ───
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Initialize and start
initializeStock();
app.listen(PORT, () => {
  console.log(`Print Stock app running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin`);
});

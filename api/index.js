// 93 Coffee Shop - Vercel Serverless Entry Point
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = '93coffee_jwt_s3cr3t_2026!';
const TOKEN_EXPIRY = '24h';
const CODES = { owner: 'owner@123', admin: 'admin@123' };

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Rate limiter
const rateMap = new Map();
function rateLimit(key, max = 5, windowMs = 60000) {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now - entry.start > windowMs) {
    rateMap.set(key, { count: 1, start: now });
    return false;
  }
  entry.count++;
  return entry.count > max;
}
// Cleanup old entries
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap) if (now - v.start > 300000) rateMap.delete(k);
}, 300000);

// Auth middleware
function authRequired(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: '❌ غير مصرح' });
    try {
      const decoded = jwt.verify(header.slice(7), JWT_SECRET);
      if (roles.length && !roles.includes(decoded.role)) return res.status(403).json({ ok: false, error: '❌ صلاحية غير كافية' });
      req.user = decoded;
      next();
    } catch (e) { return res.status(401).json({ ok: false, error: '❌ توكن غير صالح' }); }
  };
}

// Sanitize helpers
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function esc(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/'/g, "''");
}

// Database
let db = null;
let initPromise = null;

async function initDB() {
  if (db) return;
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    try {
      const SQL = await initSqlJs();
      const dbPath = '/tmp/shop.db';
      if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
      } else {
        db = new SQL.Database();
      }
      
      db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, desc TEXT, price REAL, img TEXT,
        cat TEXT, featured INTEGER, created_at TEXT
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT, items TEXT, total REAL,
        status TEXT, created_at TEXT
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT, text TEXT, admin INTEGER,
        read INTEGER, created_at TEXT
      )`);
      
      // Seed if empty
      const count = db.exec("SELECT COUNT(*) FROM products");
      if (!count.length || !count[0].values.length || count[0].values[0][0] === 0) {
        const seeds = [
          ["☕ قهوة تركية أصلي", "قهوة تركية فاخرة مطحونة ناعم", 5.5, "https://images.unsplash.com/photo-1559496417-e7f25cb247f3?w=200&h=200&fit=crop", "coffee", 1],
          ["☕ كابتشينو إيطالي", "كابتشينو برغوة كثيفة بنسبة 100%", 4.75, "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=200&h=200&fit=crop", "coffee", 1],
          ["☕ إسبريسو مكثّف", "إسبريسو إيطالي غني بالنكهة", 3.5, "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=200&h=200&fit=crop", "coffee", 0],
          ["☕ موكا مثلجة", "موكا باردة مع شوكولاتة فاخرة", 6, "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=200&h=200&fit=crop", "coffee", 0],
          ["☕ لاتيه بارد", "لاتيه مثلج بحليب طازج", 5.25, "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=200&h=200&fit=crop", "coffee", 0],
          ["🔧 أداة V60", "أداة تحضير قهوة V60 يدوية", 22, "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=200&h=200&fit=crop", "tools", 1],
          ["🔧 مكبس فرنسي", "مكبس فرنسي زجاجي 500 مل", 18, "https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?w=200&h=200&fit=crop", "tools", 0],
          ["🔧 مطحنة يدوية", "مطحنة قهوة يدوية ستانلس ستيل", 35, "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=200&h=200&fit=crop", "tools", 1],
          ["🔧 إبريق سيراميك", "إبريق سيراميك لتقديم القهوة 600 مل", 14, "https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?w=200&h=200&fit=crop", "tools", 0],
          ["☕ قهوة فرنسية", "قهوة فرنسية محمصة درجة متوسطة", 7, "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=200&h=200&fit=crop", "coffee", 0]
        ];
        for (const s of seeds) {
          db.run(`INSERT INTO products (name, desc, price, img, cat, featured, created_at) 
                  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`, s);
        }
      }
      
      // Save periodically
      setInterval(() => {
        if (db) {
          const data = db.export();
          const buffer = Buffer.from(data);
          fs.writeFileSync('/tmp/shop.db', buffer);
        }
      }, 10000);
    } catch (err) {
      console.error('DB init error:', err);
      throw err;
    }
  })();
  
  return initPromise;
}

function query(sql) {
  if (!db) return [];
  try {
    const res = db.exec(sql);
    return res.length && res[0].values ? res[0].values : [];
  } catch (e) { return []; }
}

// ============== API ROUTES ==============

// GET /api/products - public
app.get('/api/products', (req, res) => {
  const rows = query("SELECT * FROM products ORDER BY id");
  const products = rows.map(r => ({
    id: r[0], name: r[1], desc: r[2], price: r[3],
    img: r[4], cat: r[5], featured: !!r[6], created_at: r[7]
  }));
  res.json(products);
});

// POST /api/auth - login
app.post('/api/auth', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (rateLimit('auth_' + ip)) {
    return res.json({ ok: false, error: '❌ محاولات كثيرة جداً. انتظر دقيقة.' });
  }
  const { role, code } = req.body;
  if (!role || !code) return res.json({ ok: false, error: 'الرجاء إدخال الكود' });
  if (CODES[role] && CODES[role] === code) {
    const token = jwt.sign({ role, iat: Date.now() }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    return res.json({ ok: true, role, token });
  }
  res.json({ ok: false, error: '❌ كود خاطئ' });
});

// GET /api/auth/verify - verify token
app.get('/api/auth/verify', authRequired(), (req, res) => {
  res.json({ ok: true, role: req.user.role });
});

// POST /api/products - add product (owner only)
app.post('/api/products', authRequired('owner'), (req, res) => {
  const { name, desc, price, img, cat, featured } = req.body;
  if (!name || !desc || !price) return res.json({ ok: false, error: '❌ املأ الاسم والوصف والسعر' });
  const pname = sanitize(name.slice(0, 100));
  const pdesc = sanitize(desc.slice(0, 500));
  const pprice = parseFloat(price);
  if (isNaN(pprice) || pprice <= 0) return res.json({ ok: false, error: '❌ سعر غير صحيح' });
  const placeholder = 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200&h=200&fit=crop';
  const pimg = img && typeof img === 'string' ? img.slice(0, 5000) : placeholder;
  const pcat = cat === 'tools' ? 'tools' : 'coffee';
  db.run(`INSERT INTO products (name, desc, price, img, cat, featured, created_at) 
          VALUES ('${esc(pname)}', '${esc(pdesc)}', ${pprice}, '${esc(pimg)}', '${pcat}', ${featured ? 1 : 0}, datetime('now'))`);
  const rows = query(`SELECT * FROM products ORDER BY id DESC LIMIT 1`);
  if (rows.length) {
    const r = rows[0];
    const prod = { id: r[0], name: r[1], desc: r[2], price: r[3], img: r[4], cat: r[5], featured: !!r[6] };
    res.json({ ok: true, product: prod });
  } else res.json({ ok: false, error: '❌ فشل الإضافة' });
});

// DELETE /api/products/:id - delete product (owner only)
app.delete('/api/products/:id', authRequired('owner'), (req, res) => {
  db.run(`DELETE FROM products WHERE id=${parseInt(req.params.id) || 0}`);
  res.json({ ok: true });
});

// DELETE /api/products - delete all (owner only)
app.delete('/api/products', authRequired('owner'), (req, res) => {
  db.run('DELETE FROM products');
  res.json({ ok: true });
});

// POST /api/orders - create order (public)
app.post('/api/orders', (req, res) => {
  const { phone, items } = req.body;
  if (!phone || !items || !items.length) return res.json({ ok: false, error: '❌ البيانات ناقصة' });
  const pphone = sanitize(phone.slice(0, 20));
  const total = items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.qty) || 1), 0);
  const pItems = items.map(i => ({ name: sanitize(i.name.slice(0, 100)), price: parseFloat(i.price) || 0, qty: parseInt(i.qty) || 1 }));
  db.run(`INSERT INTO orders (phone, items, total, status, created_at) 
          VALUES ('${esc(pphone)}', '${esc(JSON.stringify(pItems))}', ${total}, 'جديد', datetime('now'))`);
  const rows = query('SELECT last_insert_rowid()');
  const id = rows.length && rows[0].length ? rows[0][0] : 0;
  res.json({ ok: true, id, phone: pphone, total, status: 'جديد' });
});

// GET /api/orders - list orders (auth required)
app.get('/api/orders', authRequired(), (req, res) => {
  const rows = query("SELECT * FROM orders ORDER BY id DESC");
  const orders = rows.map(r => ({
    id: r[0], phone: r[1], items: safeJson(r[2]), total: r[3], status: r[4], created_at: r[5]
  }));
  res.json(orders);
});

// GET /api/orders/track/:id/:phone - track order (public)
app.get('/api/orders/track/:id/:phone', (req, res) => {
  const rows = query(`SELECT * FROM orders WHERE id=${parseInt(req.params.id) || 0} AND phone='${esc(req.params.phone)}'`);
  if (!rows.length) return res.json({ ok: false, error: '❌ طلب غير موجود' });
  const r = rows[0];
  res.json({ ok: true, id: r[0], phone: r[1], items: safeJson(r[2]), total: r[3], status: r[4], created_at: r[5] });
});

// PATCH /api/orders/:id/status - update status
app.patch('/api/orders/:id/status', authRequired(), (req, res) => {
  const { status } = req.body;
  const valid = ['جديد', 'قيد التحضير', 'جاهز', 'تم التسليم', 'ملغي'];
  if (!valid.includes(status)) return res.json({ ok: false, error: '❌ حالة غير صحيحة' });
  db.run(`UPDATE orders SET status='${esc(status)}' WHERE id=${parseInt(req.params.id) || 0}`);
  res.json({ ok: true });
});

// DELETE /api/orders/:id - delete order
app.delete('/api/orders/:id', authRequired(), (req, res) => {
  db.run(`DELETE FROM orders WHERE id=${parseInt(req.params.id) || 0}`);
  res.json({ ok: true });
});

// POST /api/messages - send message
app.post('/api/messages', (req, res) => {
  const { phone, text, admin } = req.body;
  if (!text) return res.json({ ok: false, error: '❌ اكتب رسالة' });
  db.run(`INSERT INTO messages (phone, text, admin, read, created_at) 
          VALUES ('${esc(sanitize((phone||'').slice(0,20)))}', '${esc(sanitize(text.slice(0,500)))}', ${admin ? 1 : 0}, 0, datetime('now'))`);
  const rows = query('SELECT last_insert_rowid()');
  const id = rows.length && rows[0].length ? rows[0][0] : 0;
  res.json({ ok: true, id });
});

// GET /api/messages - all messages
app.get('/api/messages', authRequired(), (req, res) => {
  const rows = query("SELECT * FROM messages ORDER BY id DESC");
  const msgs = rows.map(r => ({
    id: r[0], phone: r[1], text: r[2], admin: !!r[3], read: !!r[4], created_at: r[5]
  }));
  res.json(msgs);
});

// GET /api/messages/:phone - messages by phone
app.get('/api/messages/:phone', (req, res) => {
  const rows = query(`SELECT * FROM messages WHERE phone='${esc(req.params.phone)}' ORDER BY id`);
  const msgs = rows.map(r => ({
    id: r[0], phone: r[1], text: r[2], admin: !!r[3], read: !!r[4], created_at: r[5]
  }));
  res.json(msgs);
});

// PATCH /api/messages/:id/read - mark read
app.patch('/api/messages/:id/read', authRequired(), (req, res) => {
  db.run(`UPDATE messages SET read=1 WHERE id=${parseInt(req.params.id) || 0}`);
  res.json({ ok: true });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), db: !!db });
});

// Helper
function safeJson(str) {
  try { return JSON.parse(str || '[]'); } catch (e) { return []; }
}

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ============== VERCEL HANDLER ==============
let ready = false;

module.exports = async (req, res) => {
  if (!ready) {
    try {
      await initDB();
      ready = true;
      console.log('✅ DB ready for Vercel');
    } catch (err) {
      console.error('❌ Init failed:', err);
      return res.status(500).json({ ok: false, error: '❌ فشل تحميل قاعدة البيانات', details: err.message });
    }
  }
  return app(req, res);
};

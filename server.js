const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const DB_PATH = path.join(__dirname, 'data', 'shop.db');
const app = express();
const PORT = process.env.PORT || 3456;
const JWT_SECRET = '93coffee_jwt_s3cr3t_2026!';
const TOKEN_EXPIRY = '24h';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== SECURITY HEADERS =====
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ===== RATE LIMITER (per IP) =====
const rateMap = new Map();
function rateLimit(key, maxAttempts = 5, windowMs = 60000) {
  const now = Date.now();
  if (!rateMap.has(key)) rateMap.set(key, []);
  const attempts = rateMap.get(key).filter(t => now - t < windowMs);
  if (attempts.length >= maxAttempts) return true; // blocked
  attempts.push(now);
  rateMap.set(key, attempts);
  return false; // allowed
}
// Clean rate map every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap) {
    rateMap.set(k, v.filter(t => now - t < 60000));
    if (rateMap.get(k).length === 0) rateMap.delete(k);
  }
}, 300000);

// ===== SANITIZE =====
function sanitize(str) {
  if (typeof str !== 'string') return str || '';
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

// ===== DB =====
let db;

async function initDB() {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  // Use "IF NOT EXISTS" so existing tables are left alone
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    desc TEXT NOT NULL,
    price REAL NOT NULL,
    img TEXT,
    cat TEXT,
    featured INTEGER,
    created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    notes TEXT,
    items TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT,
    date TEXT,
    ts INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    phone TEXT,
    customer TEXT,
    sender TEXT,
    sender_role TEXT,
    text TEXT NOT NULL,
    ts INTEGER,
    read INTEGER
  )`);
  saveDB();

  // Auto-seed if products table is empty
  const checkRows = db.exec(`SELECT COUNT(*) as c FROM products`);
  const count = checkRows.length ? checkRows[0].values[0][0] : 0;
  if (count === 0) {
    const now = new Date().toISOString();
    const sample = [
      { name: '☕ قهوة تركية أصلي', desc: 'قهوة تركية فاخرة مطحونة ناعم', price: 5.50, img: 'https://images.unsplash.com/photo-1559496417-e7f25cb247f3?w=200&h=200&fit=crop', cat: 'coffee', featured: 1 },
      { name: '☕ كابتشينو إيطالي', desc: 'كابتشينو برغوة كثيفة بنسبة 100%', price: 4.75, img: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=200&h=200&fit=crop', cat: 'coffee', featured: 1 },
      { name: '☕ إسبريسو مكثّف', desc: 'إسبريسو إيطالي غني بالنكهة', price: 3.50, img: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=200&h=200&fit=crop', cat: 'coffee' },
      { name: '☕ موكا مثلجة', desc: 'موكا باردة مع شوكولاتة فاخرة', price: 6.00, img: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=200&h=200&fit=crop', cat: 'coffee' },
      { name: '☕ لاتيه بارد', desc: 'لاتيه مثلج بحليب طازج', price: 5.25, img: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=200&h=200&fit=crop', cat: 'coffee' },
      { name: '🔧 أداة V60', desc: 'أداة تحضير قهوة V60 يدوية', price: 22.00, img: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=200&h=200&fit=crop', cat: 'tools', featured: 1 },
      { name: '🔧 مكبس فرنسي', desc: 'مكبس فرنسي زجاجي 500 مل', price: 18.00, img: 'https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?w=200&h=200&fit=crop', cat: 'tools' },
      { name: '🔧 مطحنة يدوية', desc: 'مطحنة قهوة يدوية ستانلس ستيل', price: 35.00, img: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=200&h=200&fit=crop', cat: 'tools', featured: 1 },
      { name: '🔧 إبريق سيراميك', desc: 'إبريق سيراميك لتقديم القهوة 600 مل', price: 14.00, img: 'https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?w=200&h=200&fit=crop', cat: 'tools' },
      { name: '☕ قهوة فرنسية', desc: 'قهوة فرنسية محمصة درجة متوسطة', price: 7.00, img: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=200&h=200&fit=crop', cat: 'coffee' },
    ];
    const stmt = db.prepare(`INSERT INTO products (name, desc, price, img, cat, featured, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    sample.forEach(p => stmt.run([p.name, p.desc, p.price, p.img, p.cat, p.featured || 0, now]));
    stmt.free();
    saveDB();
    console.log('🌱 Auto-seeded', sample.length, 'sample products');
  }

  console.log('✅ DB ready');
}

function saveDB() {
  const data = db.export();
  const buf = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buf);
}

// ===== HELPERS =====
function esc(val) {
  if (typeof val === 'string') return val.replace(/'/g, "''");
  return String(val);
}

function query(sql) {
  const rows = db.exec(sql);
  return rows.length ? rows[0].values : [];
}

// ===== AUTH =====
const CODES = { owner: 'owner@123', admin: 'admin@123' };

// Middleware: verify token (optional — if present, must be valid)
function authRequired(role) {
  return (req, res, next) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return res.json({ ok: false, error: '❌ يجب تسجيل الدخول' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (role && decoded.role !== role && (role === 'admin' && decoded.role !== 'owner')) {
        return res.json({ ok: false, error: '❌ صلاحية غير كافية' });
      }
      req.user = decoded;
      next();
    } catch (e) {
      return res.json({ ok: false, error: '❌ الجلسة منتهية، سجل دخول مجدداً' });
    }
  };
}

// Login endpoint with rate limiting
app.post('/api/auth', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (rateLimit('auth_' + ip)) {
    return res.json({ ok: false, error: '❌ محاولات كثيرة جداً. انتظر دقيقة.' });
  }
  const { role, code } = req.body;
  if (!role || !code) return res.json({ ok: false, error: 'الرجاء إدخال الكود' });
  if (CODES[role] && CODES[role] === code) {
    const token = jwt.sign({ role, iat: Date.now() }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    res.json({ ok: true, role, token });
  } else {
    res.json({ ok: false, error: '❌ كود خاطئ' });
  }
});

// Verify token (for client to check)
app.get('/api/auth/verify', authRequired(), (req, res) => {
  res.json({ ok: true, role: req.user.role });
});

// ===== SSE (Server-Sent Events) =====
const sseClients = [];

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => {
    try { res.write(msg); } catch (e) { /* remove dead clients */ }
  });
  // Clean dead connections
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try { sseClients[i].write(''); } catch { sseClients.splice(i, 1); }
  }
}

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write(`data: ${JSON.stringify({ connected: true })}\n\n`);
  sseClients.push(res);
  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx >= 0) sseClients.splice(idx, 1);
  });
});

// ===== PRODUCTS =====
app.get('/api/products', (req, res) => {
  const rows = query(`SELECT * FROM products ORDER BY id DESC`);
  res.json(rows.map(r => ({
    id: r[0], name: r[1], desc: r[2], price: r[3], img: r[4],
    cat: r[5], featured: !!r[6], created_at: r[7]
  })));
});

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
  db.run(`INSERT INTO products (name, desc, price, img, cat, featured, created_at) VALUES ('${esc(pname)}', '${esc(pdesc)}', ${pprice}, '${esc(pimg)}', '${pcat}', ${featured ? 1 : 0}, datetime('now'))`);
  saveDB();
  const rows = query(`SELECT * FROM products ORDER BY id DESC LIMIT 1`);
  if (rows.length) {
    const r = rows[0];
    const prod = { id: r[0], name: r[1], desc: r[2], price: r[3], img: r[4], cat: r[5], featured: !!r[6] };
    broadcast('product', prod);
    res.json({ ok: true, product: prod });
  } else {
    res.json({ ok: false, error: '❌ فشل الإضافة' });
  }
});

app.delete('/api/products/:id', authRequired('admin'), (req, res) => {
  if (req.user.role !== 'owner') return res.json({ ok: false, error: '❌ صلاحية مالك فقط' });
  const id = parseInt(req.params.id);
  if (!id) return res.json({ ok: false, error: '❌ معرّف غير صحيح' });
  db.run(`DELETE FROM products WHERE id = ${id}`);
  saveDB();
  broadcast('product_deleted', id);
  res.json({ ok: true });
});

app.delete('/api/products', authRequired('owner'), (req, res) => {
  db.run(`DELETE FROM products`);
  saveDB();
  broadcast('products_cleared', true);
  res.json({ ok: true });
});

// ===== ORDERS =====
app.get('/api/orders', (req, res) => {
  const rows = query(`SELECT * FROM orders ORDER BY id DESC`);
  res.json(rows.map(r => ({
    id: r[0], customer: r[1], phone: r[2], address: r[3], notes: r[4],
    items: JSON.parse(r[5]), total: r[6], status: r[7], date: r[8], ts: r[9]
  })));
});

app.post('/api/orders', (req, res) => {
  let { customer, phone, address, notes, items, total } = req.body;
  customer = sanitize(String(customer || '').slice(0, 80));
  phone = sanitize(String(phone || '').slice(0, 20));
  address = sanitize(String(address || '').slice(0, 200));
  notes = sanitize(String(notes || '').slice(0, 500));
  if (!customer || !phone || !address || !items || !items.length) {
    return res.json({ ok: false, error: '❌ املأ الحقول المطلوبة' });
  }
  // Validate phone (basic)
  if (!/^[\d\s\+\-\(\)]{7,20}$/.test(phone.replace(/[^\d+]/g, ''))) {
    // Allow anyway, just warn
  }
  total = parseFloat(total) || items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.qty) || 1), 0);
  const now = Date.now();
  const dateStr = new Date().toLocaleDateString('ar-SA') + ' ' +
    new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  const itemsJson = JSON.stringify(items.map(i => ({
    name: sanitize(String(i.name || '').slice(0, 100)),
    qty: parseInt(i.qty) || 1,
    price: parseFloat(i.price) || 0
  })));
  db.run(`INSERT INTO orders (customer, phone, address, notes, items, total, status, date, ts) VALUES ('${esc(customer)}', '${esc(phone)}', '${esc(address)}', '${esc(notes)}', '${esc(itemsJson)}', ${total}, 'waiting', '${esc(dateStr)}', ${now})`);
  saveDB();
  const rows = query(`SELECT * FROM orders ORDER BY id DESC LIMIT 1`);
  const orderId = rows.length ? rows[0][0] : 0;
  // Broadcast new order to SSE
  if (rows.length) {
    const r = rows[0];
    broadcast('order', { id: r[0], customer: r[1], phone: r[2], address: r[3], notes: r[4], items: JSON.parse(r[5]), total: r[6], status: r[7], date: r[8], ts: r[9] });
  }
  res.json({ ok: true, orderId });
});

app.get('/api/orders/track/:id/:phone', (req, res) => {
  const id = parseInt(req.params.id);
  const phone = esc(req.params.phone);
  const rows = query(`SELECT * FROM orders WHERE id = ${id} AND phone = '${phone}'`);
  if (!rows.length) return res.json({ ok: false, error: 'لم يتم العثور على الطلب' });
  const r = rows[0];
  res.json({ ok: true, order: {
    id: r[0], customer: r[1], phone: r[2], address: r[3], notes: r[4],
    items: JSON.parse(r[5]), total: r[6], status: r[7], date: r[8], ts: r[9]
  }});
});

app.patch('/api/orders/:id/status', authRequired('admin'), (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  const validStatuses = ['waiting', 'preparing', 'delivering', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) return res.json({ ok: false, error: '❌ حالة غير صحيحة' });
  const oldRows = query(`SELECT * FROM orders WHERE id = ${id}`);
  if (!oldRows.length) return res.json({ ok: false, error: '❌ طلب غير موجود' });
  db.run(`UPDATE orders SET status = '${esc(status)}' WHERE id = ${id}`);
  saveDB();
  // Broadcast updated order
  const rows = query(`SELECT * FROM orders WHERE id = ${id}`);
  if (rows.length) {
    const r = rows[0];
    broadcast('order', { id: r[0], customer: r[1], phone: r[2], address: r[3], notes: r[4], items: JSON.parse(r[5]), total: r[6], status: r[7], date: r[8], ts: r[9] });
  }
  res.json({ ok: true });
});

app.delete('/api/orders/:id', authRequired('admin'), (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.json({ ok: false, error: '❌ معرّف غير صحيح' });
  db.run(`DELETE FROM orders WHERE id = ${id}`);
  db.run(`DELETE FROM messages WHERE order_id = ${id}`);
  saveDB();
  broadcast('order_deleted', id);
  res.json({ ok: true });
});

// ===== MESSAGES =====
app.get('/api/messages', authRequired('admin'), (req, res) => {
  const rows = query(`SELECT * FROM messages ORDER BY ts DESC`);
  res.json(rows.map(r => ({
    id: r[0], orderId: r[1], phone: r[2], customer: r[3],
    sender: r[4], senderRole: r[5], text: r[6], ts: r[7], read: !!r[8]
  })));
});

app.get('/api/messages/:phone', (req, res) => {
  const phone = esc(req.params.phone);
  const rows = query(`SELECT * FROM messages WHERE phone = '${phone}' ORDER BY ts ASC`);
  res.json(rows.map(r => ({
    id: r[0], orderId: r[1], phone: r[2], customer: r[3],
    sender: r[4], senderRole: r[5], text: r[6], ts: r[7], read: !!r[8]
  })));
});

app.post('/api/messages', (req, res) => {
  let { orderId, phone, customer, sender, senderRole, text } = req.body;
  phone = sanitize(String(phone || '').slice(0, 20));
  customer = sanitize(String(customer || '').slice(0, 80));
  sender = sanitize(String(sender || 'customer').slice(0, 20));
  senderRole = sanitize(String(senderRole || '').slice(0, 20));
  text = sanitize(String(text || '').slice(0, 2000));
  if (!phone || !text) return res.json({ ok: false, error: '❌ املأ الحقول' });
  const now = Date.now();
  db.run(`INSERT INTO messages (order_id, phone, customer, sender, sender_role, text, ts, read) VALUES (${parseInt(orderId) || 0}, '${esc(phone)}', '${esc(customer)}', '${esc(sender)}', '${esc(senderRole)}', '${esc(text)}', ${now}, 0)`);
  saveDB();
  const rows = query(`SELECT * FROM messages ORDER BY id DESC LIMIT 1`);
  const msgId = rows.length ? rows[0][0] : 0;
  broadcast('message', { id: msgId, orderId, phone, customer, sender, senderRole, text, ts: now, read: false });
  res.json({ ok: true, msgId });
});

app.patch('/api/messages/read', authRequired('admin'), (req, res) => {
  const phone = esc(req.body.phone || '');
  if (!phone) return res.json({ ok: false, error: '❌ رقم الهاتف مطلوب' });
  db.run(`UPDATE messages SET read = 1 WHERE phone = '${phone}' AND sender = 'customer'`);
  saveDB();
  res.json({ ok: true });
});

// ===== SEED (protected by owner code in body) =====
app.post('/api/seed', (req, res) => {
  const { code } = req.body;
  if (CODES['owner'] !== code) return res.json({ ok: false, error: '❌ صلاحية مالك فقط' });
  const sample = [
    { name: '☕ قهوة تركية أصلي', desc: 'قهوة تركية فاخرة مطحونة ناعم', price: 5.50, img: 'https://images.unsplash.com/photo-1559496417-e7f25cb247f3?w=200&h=200&fit=crop', cat: 'coffee', featured: 1 },
    { name: '☕ كابتشينو إيطالي', desc: 'كابتشينو برغوة كثيفة بنسبة 100%', price: 4.75, img: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=200&h=200&fit=crop', cat: 'coffee', featured: 1 },
    { name: '☕ إسبريسو مكثّف', desc: 'إسبريسو إيطالي غني بالنكهة', price: 3.50, img: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=200&h=200&fit=crop', cat: 'coffee' },
    { name: '☕ موكا مثلجة', desc: 'موكا باردة مع شوكولاتة', price: 6.00, img: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=200&h=200&fit=crop', cat: 'coffee' },
    { name: '☕ لاتيه بارد', desc: 'لاتيه مثلج بحليب طازج', price: 5.25, img: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=200&h=200&fit=crop', cat: 'coffee' },
    { name: '🔧 أداة V60', desc: 'أداة تحضير قهوة V60 يدوية', price: 22.00, img: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=200&h=200&fit=crop', cat: 'tools', featured: 1 },
    { name: '🔧 مكبس فرنسي', desc: 'مكبس فرنسي زجاجي 500 مل', price: 18.00, img: 'https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?w=200&h=200&fit=crop', cat: 'tools' },
    { name: '🔧 مطحنة يدوية', desc: 'مطحنة قهوة يدوية ستانلس ستيل', price: 35.00, img: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=200&h=200&fit=crop', cat: 'tools', featured: 1 },
    { name: '🔧 إبريق سيراميك', desc: 'إبريق سيراميك لتقديم القهوة 600 مل', price: 14.00, img: 'https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?w=200&h=200&fit=crop', cat: 'tools' },
    { name: '☕ قهوة فرنسية', desc: 'قهوة فرنسية محمصة درجة متوسطة', price: 7.00, img: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=200&h=200&fit=crop', cat: 'coffee' },
  ];
  const now = new Date().toISOString();
  sample.forEach(p => {
    db.run(`INSERT OR IGNORE INTO products (name, desc, price, img, cat, featured, created_at) VALUES ('${esc(p.name)}', '${esc(p.desc)}', ${p.price}, '${esc(p.img)}', '${p.cat}', ${p.featured || 0}, '${esc(now)}')`);
  });
  saveDB();
  const rows = query(`SELECT * FROM products ORDER BY id ASC`);
  res.json({ ok: true, count: rows.length });
});

// ===== FRONTEND FALLBACK =====
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const filePath = path.join(__dirname, 'public', req.path === '/' ? 'index.html' : req.path);
  res.sendFile(filePath, err => { if (err) res.sendFile(path.join(__dirname, 'public', 'index.html')); });
});

// ===== START =====
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n☕ 93 coffee server running at:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   📱 Network: http://<your-ip>:${PORT}\n`);
  });

// Export for testing
module.exports = app;
});

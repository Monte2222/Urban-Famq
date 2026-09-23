const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');

const db = new Database('family.db');
const SECRET = process.env.SECRET || 'change-me-super-secret';
const app = express();

app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Схема БД ---------- */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'family',
  approved INTEGER NOT NULL DEFAULT 1,
  avatar TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  details TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS info (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lottery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  week TEXT NOT NULL,
  number INTEGER NOT NULL,
  UNIQUE(user_id, week)
);
CREATE TABLE IF NOT EXISTS lottery_winners (
  week TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  number INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bp_base (
  user_id INTEGER PRIMARY KEY,
  amount INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_flags (
  user_id INTEGER PRIMARY KEY,
  vip INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_bp_layout (
  user_id INTEGER PRIMARY KEY,
  layout TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS wallet (
  user_id INTEGER PRIMARY KEY,
  amount INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  buy_price INTEGER NOT NULL DEFAULT 0,
  sell_price INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS deal_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  item TEXT NOT NULL,
  qty INTEGER NOT NULL,
  buy_price INTEGER NOT NULL,
  sell_price INTEGER NOT NULL,
  profit INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(deal_id) REFERENCES deals(id)
);
CREATE TABLE IF NOT EXISTS rentals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS rent_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS fishing_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  fish_amount INTEGER NOT NULL DEFAULT 0,
  treasure_amount INTEGER NOT NULL DEFAULT 0,
  sold INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS treasure_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS property_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  property TEXT NOT NULL,
  days INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  hours REAL DEFAULT 0,
  is_balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS property_settings (
  user_id INTEGER NOT NULL,
  property TEXT NOT NULL,
  hourly_rate INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, property)
);
`);

/* ---------- Миграции ---------- */
try { db.exec("ALTER TABLE users ADD COLUMN approved INTEGER NOT NULL DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN avatar TEXT"); } catch {}
try { db.exec("ALTER TABLE fishing_sessions ADD COLUMN fish_amount INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE fishing_sessions ADD COLUMN treasure_amount INTEGER NOT NULL DEFAULT 0"); } catch {}
try {
  db.exec("ALTER TABLE fishing_sessions ADD COLUMN sold INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE fishing_sessions SET sold=1 WHERE amount > 0");
  db.exec("UPDATE fishing_sessions SET fish_amount=amount WHERE amount > 0");
} catch {}
try { db.exec("ALTER TABLE property_payments ADD COLUMN hours REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE property_payments ADD COLUMN is_balance INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("UPDATE property_payments SET hours = days * 24 WHERE (hours IS NULL OR hours = 0) AND days > 0"); } catch {}

/* ---------- Индексы для скорости ---------- */
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_deals_user ON deals(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_deal_sales_user ON deal_sales(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_rentals_user ON rentals(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_fishing_user ON fishing_sessions(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_treasure_user ON treasure_sales(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_prop_user ON property_payments(user_id, property);
  `);
} catch {}

/* ---------- Seed ---------- */
if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
  const ins = db.prepare('INSERT INTO users (username,password,role,approved) VALUES (?,?,?,1)');
  ins.run('admin', bcrypt.hashSync('admin123', 10), 'admin');
  db.prepare('INSERT OR REPLACE INTO info (id,text) VALUES (1,?)')
    .run('Добро пожаловать в нашу семью! Здесь мы ведём статистику и общаемся.');
  db.prepare('INSERT INTO rules (text) VALUES (?)').run('Уважайте всех участников семьи');
  db.prepare('INSERT INTO rules (text) VALUES (?)').run('Участвуйте в еженедельных мероприятиях');
  db.prepare('INSERT INTO rules (text) VALUES (?)').run('Запрещён обман соклановцев');
}

/* ---------- Хелперы ---------- */
function auth(req, res, next) {
  try {
    const payload = jwt.verify(req.cookies.token, SECRET);
    const row = db.prepare('SELECT id, username, role, approved FROM users WHERE id=?').get(payload.id);
    if (!row || row.approved === 0) {
      res.clearCookie('token');
      return res.status(401).json({ error: 'unauthorized' });
    }
    req.user = row;
    next();
  } catch { res.status(401).json({ error: 'unauthorized' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}
function currentWeek() {
  const d = new Date();
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}
function getBalance(userId) {
  const row = db.prepare('SELECT amount FROM wallet WHERE user_id=?').get(userId);
  return row ? row.amount : 0;
}
function setBalance(userId, amount) {
  db.prepare('INSERT OR REPLACE INTO wallet (user_id, amount) VALUES (?, ?)')
    .run(userId, amount);
}

/* ---------- Авторизация ---------- */
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });
  if (username.trim().length < 3) return res.status(400).json({ error: 'Имя минимум 3 символа' });
  if (password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });
  try {
    db.prepare('INSERT INTO users (username, password, role, approved) VALUES (?, ?, ?, 0)')
      .run(username.trim(), bcrypt.hashSync(password, 10), 'family');
    res.json({ ok: 1, pending: true });
  } catch { res.status(400).json({ error: 'Пользователь уже существует' }); }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!row || !bcrypt.compareSync(password, row.password))
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  if (row.approved === 0) {
    return res.status(403).json({ error: 'Ваш аккаунт ожидает подтверждения администратором' });
  }
  const user = { id: row.id, username: row.username, role: row.role, avatar: row.avatar || null };
  res.cookie('token', jwt.sign({ id: row.id }, SECRET, { expiresIn: '30d' }), { httpOnly: true });
  res.json({ user });
});

app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: 1 }); });

app.get('/api/me', auth, (req, res) => {
  const row = db.prepare('SELECT id, username, role, avatar FROM users WHERE id=?').get(req.user.id);
  res.json({ user: row });
});

/* ---------- Профиль ---------- */
app.post('/api/profile/avatar', auth, (req, res) => {
  const { avatar } = req.body || {};
  if (typeof avatar !== 'string') return res.status(400).json({ error: 'Неверный формат' });
  if (avatar.length > 2_000_000) return res.status(400).json({ error: 'Слишком большая картинка' });
  if (avatar && !avatar.startsWith('data:image/')) return res.status(400).json({ error: 'Только изображения' });
  db.prepare('UPDATE users SET avatar=? WHERE id=?').run(avatar || null, req.user.id);
  res.json({ ok: 1 });
});

app.post('/api/profile/password', auth, (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) return res.status(400).json({ error: 'Заполните поля' });
  if (new_password.length < 4) return res.status(400).json({ error: 'Новый пароль минимум 4 символа' });
  const row = db.prepare('SELECT password FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(old_password, row.password))
    return res.status(400).json({ error: 'Старый пароль неверный' });
  db.prepare('UPDATE users SET password=? WHERE id=?')
    .run(bcrypt.hashSync(new_password, 10), req.user.id);
  res.json({ ok: 1 });
});

app.get('/api/profile/stats', auth, (req, res) => {
  const uid = req.user.id;
  const row = db.prepare('SELECT created_at FROM users WHERE id=?').get(uid);
  const sums = { day: 0, week: 0, month: 0, total: 0, cnt: 0 };
  const acts = db.prepare('SELECT amount, created_at FROM activities WHERE user_id=?').all(uid);
  const now = Date.now();
  acts.forEach(a => {
    const t = new Date(a.created_at.replace(' ', 'T') + 'Z').getTime();
    sums.total += a.amount;
    sums.cnt++;
    if (now - t < 86400000) sums.day += a.amount;
    if (now - t < 7 * 86400000) sums.week += a.amount;
    if (now - t < 30 * 86400000) sums.month += a.amount;
  });
  res.json({ created_at: row?.created_at || null, sums });
});

/* Сброс статистики: за день или за всё время */
app.post('/api/profile/reset-stats', auth, (req, res) => {
  const scope = req.body && req.body.scope === 'day' ? 'day' : 'all';
  const uid = req.user.id;

  let cutStr = null;
  if (scope === 'day') {
    const now = new Date();
    const cut = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4, 0, 0));
    if (now.getTime() < cut.getTime()) cut.setUTCDate(cut.getUTCDate() - 1);
    cutStr = cut.toISOString().slice(0, 19).replace('T', ' ');
  }

  const del = (table) => {
    const sql = cutStr
      ? `DELETE FROM ${table} WHERE user_id=? AND created_at >= ?`
      : `DELETE FROM ${table} WHERE user_id=?`;
    const params = cutStr ? [uid, cutStr] : [uid];
    return db.prepare(sql).run(...params).changes;
  };

  const deleted = {
    activities: del('activities'),
    rentals: del('rentals'),
    deal_sales: del('deal_sales'),
    fishing_sessions: del('fishing_sessions'),
    treasure_sales: del('treasure_sales'),
  };

  res.json({ ok: 1, scope, deleted });
});

/* ---------- Активности ---------- */
app.post('/api/activities', auth, (req, res) => {
  const { type, details, amount } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type required' });
  const info = db.prepare(
    'INSERT INTO activities (user_id,type,details,amount) VALUES (?,?,?,?)'
  ).run(req.user.id, type, JSON.stringify(details || {}), Number(amount) | 0);
  res.json({ id: info.lastInsertRowid });
});

app.get('/api/activities', auth, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM activities WHERE user_id=? ORDER BY created_at DESC LIMIT 500'
  ).all(req.user.id);
  res.json(rows.map(r => ({ ...r, details: JSON.parse(r.details || '{}') })));
});

app.delete('/api/activities/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM activities WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Запись не найдена' });
  db.prepare('DELETE FROM activities WHERE id=?').run(req.params.id);
  res.json({ ok: 1 });
});

/* ---------- BP ---------- */
app.get('/api/bp/base', auth, (req, res) => {
  const row = db.prepare('SELECT amount FROM bp_base WHERE user_id=?').get(req.user.id);
  res.json({ amount: row ? row.amount : 0 });
});
app.post('/api/bp/base', auth, (req, res) => {
  const amount = Number(req.body.amount) | 0;
  db.prepare('INSERT OR REPLACE INTO bp_base (user_id, amount) VALUES (?, ?)')
    .run(req.user.id, amount);
  res.json({ ok: 1, amount });
});

app.get('/api/bp/vip', auth, (req, res) => {
  const row = db.prepare('SELECT vip FROM user_flags WHERE user_id=?').get(req.user.id);
  res.json({ vip: row ? !!row.vip : false });
});
app.post('/api/bp/vip', auth, (req, res) => {
  const vip = req.body.vip ? 1 : 0;
  db.prepare('INSERT OR REPLACE INTO user_flags (user_id, vip) VALUES (?, ?)')
    .run(req.user.id, vip);
  res.json({ ok: 1, vip: !!vip });
});

app.get('/api/bp/layout', auth, (req, res) => {
  const row = db.prepare('SELECT layout FROM user_bp_layout WHERE user_id=?').get(req.user.id);
  if (!row) return res.json({ layout: null });
  try { res.json({ layout: JSON.parse(row.layout) }); }
  catch { res.json({ layout: null }); }
});
app.post('/api/bp/layout', auth, (req, res) => {
  const layout = req.body.layout;
  if (!layout || !Array.isArray(layout.categories) || !layout.categories.length)
    return res.status(400).json({ error: 'Некорректный layout' });
  db.prepare('INSERT OR REPLACE INTO user_bp_layout (user_id, layout, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
    .run(req.user.id, JSON.stringify(layout));
  res.json({ ok: 1 });
});
app.delete('/api/bp/layout', auth, (req, res) => {
  db.prepare('DELETE FROM user_bp_layout WHERE user_id=?').run(req.user.id);
  res.json({ ok: 1 });
});
app.post('/api/bp/reset-day', auth, (req, res) => {
  const now = new Date();
  const cut = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4, 0, 0));
  if (now.getTime() < cut.getTime()) cut.setUTCDate(cut.getUTCDate() - 1);
  const cutStr = cut.toISOString().slice(0, 19).replace('T', ' ');
  const info = db.prepare(
    "DELETE FROM activities WHERE user_id=? AND type='bp' AND created_at >= ?"
  ).run(req.user.id, cutStr);
  res.json({ ok: 1, deleted: info.changes });
});

/* ---------- Кошелёк ---------- */
app.get('/api/wallet', auth, (req, res) => {
  res.json({ amount: getBalance(req.user.id) });
});
app.post('/api/wallet', auth, (req, res) => {
  const amount = Number(req.body.amount) | 0;
  setBalance(req.user.id, amount);
  res.json({ ok: 1, amount });
});

/* ---------- Сделки ---------- */
app.get('/api/deals', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT d.*,
      COALESCE((SELECT SUM(qty) FROM deal_sales WHERE deal_id = d.id), 0) AS sold_qty,
      COALESCE((SELECT SUM(profit) FROM deal_sales WHERE deal_id = d.id), 0) AS profit_total
    FROM deals d WHERE d.user_id = ? ORDER BY d.id DESC
  `).all(req.user.id);
  res.json(rows);
});

app.post('/api/deals/buy', auth, (req, res) => {
  const { item, qty, buy_price } = req.body || {};
  if (!item || !String(item).trim()) return res.status(400).json({ error: 'Укажите название' });
  const q = Math.max(1, Number(qty) | 0);
  const bp = Math.max(0, Number(buy_price) | 0);
  const total = bp * q;
  const current = getBalance(req.user.id);
  const newBalance = current - total;
  setBalance(req.user.id, newBalance);
  const info = db.prepare(
    'INSERT INTO deals (user_id, item, qty, buy_price, status) VALUES (?,?,?,?,?)'
  ).run(req.user.id, String(item).trim(), q, bp, 'open');
  res.json({ id: info.lastInsertRowid, balance: newBalance, total });
});

app.post('/api/deals/sell/:id', auth, (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!deal) return res.status(404).json({ error: 'Сделка не найдена' });
  if (deal.status !== 'open') return res.status(400).json({ error: 'Сделка уже закрыта' });
  const sold = db.prepare('SELECT COALESCE(SUM(qty),0) AS s FROM deal_sales WHERE deal_id=?')
    .get(deal.id).s;
  const remaining = deal.qty - sold;
  if (remaining <= 0) return res.status(400).json({ error: 'Уже всё продано' });
  const qty = Math.max(1, Number(req.body.qty) | 0);
  const sp  = Math.max(0, Number(req.body.sell_price) | 0);
  if (qty > remaining) return res.status(400).json({ error: `Осталось продать: ${remaining}` });
  if (sp <= 0) return res.status(400).json({ error: 'Укажи цену продажи' });
  const profit = (sp - deal.buy_price) * qty;
  const totalRevenue = sp * qty;
  const current = getBalance(req.user.id);
  const newBalance = current + totalRevenue;
  setBalance(req.user.id, newBalance);
  db.prepare(`INSERT INTO deal_sales (deal_id, user_id, item, qty, buy_price, sell_price, profit)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(deal.id, req.user.id, deal.item, qty, deal.buy_price, sp, profit);
  const stillRemaining = remaining - qty;
  if (stillRemaining === 0) {
    db.prepare('UPDATE deals SET status=?, closed_at=CURRENT_TIMESTAMP WHERE id=?')
      .run('closed', deal.id);
  }
  db.prepare('INSERT INTO activities (user_id,type,details,amount) VALUES (?,?,?,?)')
    .run(req.user.id, 'reselling', JSON.stringify({
      item: deal.item, qty, buy: deal.buy_price, sell: sp, dealId: deal.id
    }), profit);
  res.json({ ok: 1, profit, balance: newBalance, remaining: stillRemaining });
});

app.delete('/api/deals/:id', auth, (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!deal) return res.status(404).json({ error: 'Не найдено' });
  const soldQty = db.prepare('SELECT COALESCE(SUM(qty),0) AS s FROM deal_sales WHERE deal_id=?')
    .get(deal.id).s;
  const remaining = deal.qty - soldQty;
  if (remaining > 0) {
    const refund = deal.buy_price * remaining;
    const current = getBalance(req.user.id);
    setBalance(req.user.id, current + refund);
  }
  db.prepare('DELETE FROM deals WHERE id=?').run(req.params.id);
  res.json({ ok: 1, refunded: remaining });
});

app.get('/api/deal-sales', auth, (req, res) => {
  const sales = db.prepare(`
    SELECT id, deal_id, item, qty, buy_price, sell_price, profit, created_at, 'sale' AS kind
    FROM deal_sales WHERE user_id=?
  `).all(req.user.id);
  const legacy = db.prepare(`
    SELECT d.id, d.id AS deal_id, d.item, d.qty, d.buy_price,
           COALESCE(d.sell_price,0) AS sell_price,
           (COALESCE(d.sell_price,0) - d.buy_price) * d.qty AS profit,
           COALESCE(d.closed_at, d.created_at) AS created_at,
           'legacy' AS kind
    FROM deals d WHERE d.user_id=? AND d.status='closed'
      AND NOT EXISTS (SELECT 1 FROM deal_sales ds WHERE ds.deal_id = d.id)
  `).all(req.user.id);
  const all = [...sales, ...legacy].sort((a,b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(all);
});

/* ---------- Аренда ---------- */
app.get('/api/rentals', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM rentals WHERE user_id=? ORDER BY id DESC').all(req.user.id));
});
app.post('/api/rentals', auth, (req, res) => {
  const { category, hours, amount, note } = req.body || {};
  if (!category || !String(category).trim()) return res.status(400).json({ error: 'Укажите категорию' });
  const h = Math.max(0, Number(hours) || 0);
  const a = Math.max(0, Number(amount) | 0);
  const info = db.prepare(
    'INSERT INTO rentals (user_id, category, hours, amount, note) VALUES (?,?,?,?,?)'
  ).run(req.user.id, String(category).trim(), h, a, note ? String(note).trim() : null);
  db.prepare('INSERT INTO activities (user_id,type,details,amount) VALUES (?,?,?,?)')
    .run(req.user.id, 'rental', JSON.stringify({
      category: String(category).trim(), hours: h, note: note || null, rentalId: info.lastInsertRowid
    }), a);
  res.json({ id: info.lastInsertRowid });
});
app.delete('/api/rentals/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM rentals WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  db.prepare('DELETE FROM rentals WHERE id=?').run(req.params.id);
  db.prepare('DELETE FROM activities WHERE user_id=? AND type=? AND details LIKE ?')
    .run(req.user.id, 'rental', '%"rentalId":' + req.params.id + '%');
  res.json({ ok: 1 });
});

app.get('/api/rent-templates', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM rent_templates WHERE user_id=? ORDER BY id DESC').all(req.user.id));
});
app.post('/api/rent-templates', auth, (req, res) => {
  const { name, category, hours, amount } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Укажите название' });
  if (!category || !String(category).trim()) return res.status(400).json({ error: 'Укажите категорию' });
  const info = db.prepare(
    'INSERT INTO rent_templates (user_id, name, category, hours, amount) VALUES (?,?,?,?,?)'
  ).run(req.user.id, String(name).trim(), String(category).trim(),
    Math.max(0, Number(hours) || 0), Math.max(0, Number(amount) | 0));
  res.json({ id: info.lastInsertRowid });
});
app.put('/api/rent-templates/:id', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM rent_templates WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Шаблон не найден' });
  const { name, category, hours, amount } = req.body || {};
  db.prepare('UPDATE rent_templates SET name=?, category=?, hours=?, amount=? WHERE id=?')
    .run(
      name ? String(name).trim() : t.name,
      category ? String(category).trim() : t.category,
      hours !== undefined ? Math.max(0, Number(hours) || 0) : t.hours,
      amount !== undefined ? Math.max(0, Number(amount) | 0) : t.amount,
      req.params.id
    );
  res.json({ ok: 1 });
});
app.delete('/api/rent-templates/:id', auth, (req, res) => {
  db.prepare('DELETE FROM rent_templates WHERE id=? AND user_id=?')
    .run(req.params.id, req.user.id);
  res.json({ ok: 1 });
});

/* ---------- Рыбалка ---------- */
app.get('/api/fishing/sessions', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM fishing_sessions WHERE user_id=? ORDER BY id DESC LIMIT 200').all(req.user.id));
});
app.post('/api/fishing/sessions', auth, (req, res) => {
  const { started_at, ended_at, duration_sec, note } = req.body || {};
  if (!started_at || !ended_at) return res.status(400).json({ error: 'Нет времени сессии' });
  const dur = Math.max(0, Number(duration_sec) | 0);
  const info = db.prepare(`
    INSERT INTO fishing_sessions
      (user_id, started_at, ended_at, duration_sec, amount, fish_amount, treasure_amount, sold, note)
    VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?)
  `).run(req.user.id, String(started_at), String(ended_at), dur, note ? String(note).trim() : null);
  db.prepare('INSERT INTO activities (user_id,type,details,amount) VALUES (?,?,?,?)')
    .run(req.user.id, 'fishing', JSON.stringify({
      sessionId: info.lastInsertRowid, duration_sec: dur, minutes: Math.round(dur / 60)
    }), 0);
  res.json({ id: info.lastInsertRowid });
});
app.put('/api/fishing/sessions/:id/sell', auth, (req, res) => {
  const session = db.prepare('SELECT * FROM fishing_sessions WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
  const fish = Math.max(0, Number(req.body.fish_amount) | 0);
  const treasure = Math.max(0, Number(req.body.treasure_amount) | 0);
  const note = req.body.note !== undefined ? String(req.body.note).trim() : session.note;
  const total = fish + treasure;
  db.prepare(`UPDATE fishing_sessions SET fish_amount=?, treasure_amount=?, amount=?, sold=1, note=? WHERE id=?`)
    .run(fish, treasure, total, note, req.params.id);
  db.prepare("UPDATE activities SET amount=? WHERE user_id=? AND type='fishing' AND details LIKE ?")
    .run(total, req.user.id, '%"sessionId":' + req.params.id + '%');
  res.json({ ok: 1, total, fish, treasure });
});
app.delete('/api/fishing/sessions/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM fishing_sessions WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  db.prepare('DELETE FROM fishing_sessions WHERE id=?').run(req.params.id);
  db.prepare('DELETE FROM activities WHERE user_id=? AND type=? AND details LIKE ?')
    .run(req.user.id, 'fishing', '%"sessionId":' + req.params.id + '%');
  res.json({ ok: 1 });
});

/* ---------- Сокровища ---------- */
app.get('/api/treasures', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM treasure_sales WHERE user_id=? ORDER BY id DESC LIMIT 200').all(req.user.id));
});
app.post('/api/treasures', auth, (req, res) => {
  const { amount, note } = req.body || {};
  const amt = Math.max(0, Number(amount) | 0);
  if (amt <= 0) return res.status(400).json({ error: 'Укажи сумму' });
  const info = db.prepare('INSERT INTO treasure_sales (user_id, amount, note) VALUES (?, ?, ?)')
    .run(req.user.id, amt, note ? String(note).trim() : null);
  db.prepare('INSERT INTO activities (user_id,type,details,amount) VALUES (?,?,?,?)')
    .run(req.user.id, 'treasure', JSON.stringify({
      treasureId: info.lastInsertRowid, note: note || null
    }), amt);
  res.json({ id: info.lastInsertRowid });
});
app.delete('/api/treasures/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM treasure_sales WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  db.prepare('DELETE FROM treasure_sales WHERE id=?').run(req.params.id);
  db.prepare('DELETE FROM activities WHERE user_id=? AND type=? AND details LIKE ?')
    .run(req.user.id, 'treasure', '%"treasureId":' + req.params.id + '%');
  res.json({ ok: 1 });
});

/* ---------- Дом и квартира ---------- */
const PROPERTIES = ['house', 'apartment'];
const MAX_PROP_HOURS = 31 * 24;

app.get('/api/properties', auth, (req, res) => {
  const out = {};
  for (const prop of PROPERTIES) {
    const last = db.prepare(
      'SELECT * FROM property_payments WHERE user_id=? AND property=? ORDER BY id DESC LIMIT 1'
    ).get(req.user.id, prop);
    const history = db.prepare(
      'SELECT * FROM property_payments WHERE user_id=? AND property=? ORDER BY id DESC LIMIT 50'
    ).all(req.user.id, prop);
    const setting = db.prepare(
      'SELECT hourly_rate FROM property_settings WHERE user_id=? AND property=?'
    ).get(req.user.id, prop);
    out[prop] = {
      current: last || null,
      history,
      hourly_rate: setting ? setting.hourly_rate : 0
    };
  }
  res.json(out);
});

app.post('/api/properties/rate', auth, (req, res) => {
  const { property, hourly_rate } = req.body || {};
  if (!PROPERTIES.includes(property)) return res.status(400).json({ error: 'Неверный тип' });
  const rate = Math.max(0, Number(hourly_rate) | 0);
  db.prepare('INSERT OR REPLACE INTO property_settings (user_id, property, hourly_rate) VALUES (?, ?, ?)')
    .run(req.user.id, property, rate);
  res.json({ ok: 1, hourly_rate: rate });
});

app.post('/api/properties/pay', auth, (req, res) => {
  const { property, days, amount, byAmount } = req.body || {};
  if (!PROPERTIES.includes(property)) return res.status(400).json({ error: 'Неверный тип' });
  const setting = db.prepare('SELECT hourly_rate FROM property_settings WHERE user_id=? AND property=?')
    .get(req.user.id, property);
  const hourlyRate = setting ? setting.hourly_rate : 0;
  let requestedHours = 0, amountValue = 0;
  if (byAmount) {
    if (!hourlyRate) return res.status(400).json({ error: 'Сначала задай почасовую ставку' });
    const amt = Math.max(0, Number(amount) | 0);
    if (amt <= 0) return res.status(400).json({ error: 'Укажи сумму' });
    requestedHours = amt / hourlyRate;
    amountValue = amt;
  } else {
    const d = Math.max(0, Number(days) | 0);
    if (d <= 0) return res.status(400).json({ error: 'Укажи количество дней' });
    requestedHours = d * 24;
    amountValue = Math.max(0, Number(amount) | 0);
  }
  const now = new Date();
  const last = db.prepare(
    'SELECT * FROM property_payments WHERE user_id=? AND property=? ORDER BY id DESC LIMIT 1'
  ).get(req.user.id, property);
  let baseDate = now;
  if (last) {
    const exp = new Date(last.expires_at.replace(' ', 'T') + 'Z');
    if (exp.getTime() > now.getTime()) baseDate = exp;
  }
  const remainingMs = Math.max(0, baseDate.getTime() - now.getTime());
  const remainingH = remainingMs / 3600000;
  const maxAddHours = Math.max(0, MAX_PROP_HOURS - remainingH);
  const effectiveH = Math.min(requestedHours, maxAddHours);
  if (effectiveH <= 0) {
    return res.status(400).json({ error: 'Максимум 31 день. Сначала дождись окончания оплаты.' });
  }
  const expires = new Date(baseDate.getTime() + effectiveH * 3600000);
  const fmtSQL = (dt) => dt.toISOString().slice(0, 19).replace('T', ' ');
  const daysValue = Math.round((effectiveH / 24) * 100) / 100;
  const info = db.prepare(`
    INSERT INTO property_payments (user_id, property, days, amount, paid_at, expires_at, hours, is_balance)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(req.user.id, property, daysValue, amountValue, fmtSQL(now), fmtSQL(expires), effectiveH);
  res.json({
    id: info.lastInsertRowid,
    expires_at: fmtSQL(expires),
    added_hours: effectiveH,
    capped: effectiveH < requestedHours
  });
});

app.post('/api/properties/balance', auth, (req, res) => {
  const { property, amount } = req.body || {};
  if (!PROPERTIES.includes(property)) return res.status(400).json({ error: 'Неверный тип' });
  const setting = db.prepare('SELECT hourly_rate FROM property_settings WHERE user_id=? AND property=?')
    .get(req.user.id, property);
  const hourlyRate = setting ? setting.hourly_rate : 0;
  if (!hourlyRate) return res.status(400).json({ error: 'Сначала задай почасовую ставку' });
  const amt = Math.max(0, Number(amount) | 0);
  const requestedHours = amt / hourlyRate;
  const effectiveH = Math.min(requestedHours, MAX_PROP_HOURS);
  const capped = effectiveH < requestedHours;
  const now = new Date();
  const expires = new Date(now.getTime() + effectiveH * 3600000);
  const fmtSQL = (dt) => dt.toISOString().slice(0, 19).replace('T', ' ');
  const daysValue = Math.round((effectiveH / 24) * 100) / 100;
  db.prepare('DELETE FROM property_payments WHERE user_id=? AND property=?').run(req.user.id, property);
  const info = db.prepare(`
    INSERT INTO property_payments (user_id, property, days, amount, paid_at, expires_at, hours, is_balance)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(req.user.id, property, daysValue, amt, fmtSQL(now), fmtSQL(expires), effectiveH);
  res.json({ id: info.lastInsertRowid, expires_at: fmtSQL(expires), added_hours: effectiveH, capped });
});

app.delete('/api/properties/payment/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM property_payments WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  db.prepare('DELETE FROM property_payments WHERE id=?').run(req.params.id);
  res.json({ ok: 1 });
});

/* ---------- Статистика ---------- */
function statsFor(userId, sinceSQL) {
  const q = `SELECT type, COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt
             FROM activities WHERE user_id=? ${sinceSQL ? "AND created_at >= " + sinceSQL : ''}
             GROUP BY type`;
  return db.prepare(q).all(userId);
}
app.get('/api/stats', auth, (req, res) => {
  const uid = req.user.id;
  res.json({
    day:   statsFor(uid, "datetime('now','-1 day')"),
    week:  statsFor(uid, "datetime('now','-7 day')"),
    month: statsFor(uid, "datetime('now','-30 day')"),
    total: statsFor(uid, null)
  });
});
app.get('/api/stats/all', auth, adminOnly, (req, res) => {
  const users = db.prepare('SELECT id,username,role FROM users WHERE approved=1').all();
  const out = users.map(u => {
    const total = db.prepare(
      "SELECT type, COALESCE(SUM(amount),0) total FROM activities WHERE user_id=? GROUP BY type"
    ).all(u.id);
    const day = db.prepare(
      "SELECT type, COALESCE(SUM(amount),0) total FROM activities WHERE user_id=? AND created_at>=datetime('now','-1 day') GROUP BY type"
    ).all(u.id);
    return { user: u, total, day };
  });
  res.json(out);
});

/* ---------- Состав (все одобренные, включая админов) ---------- */
app.get('/api/members', auth, (req, res) => {
  res.json(db.prepare(
    "SELECT id, username, avatar, created_at FROM users WHERE approved=1 ORDER BY id"
  ).all());
});

/* ---------- Админ: управление пользователями ---------- */
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const users = db.prepare(
    'SELECT id, username, role, approved, avatar, created_at FROM users ORDER BY approved ASC, id ASC'
  ).all();
  res.json(users);
});

app.post('/api/admin/users/:id/approve', auth, adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  db.prepare('UPDATE users SET approved=1 WHERE id=?').run(req.params.id);
  res.json({ ok: 1 });
});

app.post('/api/admin/users/:id/revoke', auth, adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  if (row.id === req.user.id) return res.status(400).json({ error: 'Нельзя снять доступ с себя' });
  if (row.role === 'admin') return res.status(400).json({ error: 'Нельзя снять доступ с администратора' });
  db.prepare('UPDATE users SET approved=0 WHERE id=?').run(req.params.id);
  res.json({ ok: 1 });
});

app.post('/api/admin/users/:id/promote', auth, adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  db.prepare("UPDATE users SET role='admin', approved=1 WHERE id=?").run(req.params.id);
  res.json({ ok: 1 });
});

app.post('/api/admin/users/:id/demote', auth, adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  if (row.id === req.user.id) return res.status(400).json({ error: 'Нельзя разжаловать себя' });
  db.prepare("UPDATE users SET role='family' WHERE id=?").run(req.params.id);
  res.json({ ok: 1 });
});

app.delete('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  if (row.id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить себя' });
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  try {
    db.prepare('DELETE FROM activities WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM wallet WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM bp_base WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM user_flags WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM user_bp_layout WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM deals WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM deal_sales WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM rentals WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM rent_templates WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM fishing_sessions WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM treasure_sales WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM property_payments WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM property_settings WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM lottery WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM lottery_winners WHERE user_id=?').run(req.params.id);
  } catch {}
  res.json({ ok: 1 });
});

/* ---------- Мероприятия ---------- */
app.get('/api/events', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY date DESC').all());
});
app.post('/api/events', auth, adminOnly, (req, res) => {
  const { title, description, date } = req.body || {};
  if (!title || !date) return res.status(400).json({ error: 'title/date обязательны' });
  const info = db.prepare('INSERT INTO events (title,description,date,created_by) VALUES (?,?,?,?)')
    .run(title, description || '', date, req.user.id);
  res.json({ id: info.lastInsertRowid });
});
app.delete('/api/events/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM events WHERE id=?').run(req.params.id);
  res.json({ ok: 1 });
});

/* ---------- Правила и о семье ---------- */
app.get('/api/rules', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM rules ORDER BY id').all());
});
app.post('/api/rules', auth, adminOnly, (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  res.json({ id: db.prepare('INSERT INTO rules (text) VALUES (?)').run(text).lastInsertRowid });
});
app.delete('/api/rules/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM rules WHERE id=?').run(req.params.id); res.json({ ok: 1 });
});
app.get('/api/info', auth, (req, res) => {
  res.json(db.prepare('SELECT text FROM info WHERE id=1').get() || { text: '' });
});
app.post('/api/info', auth, adminOnly, (req, res) => {
  db.prepare('INSERT OR REPLACE INTO info (id,text) VALUES (1,?)').run(req.body.text || '');
  res.json({ ok: 1 });
});

/* ---------- Лотерея ---------- */
app.get('/api/lottery', auth, (req, res) => {
  const week = currentWeek();
  const entries = db.prepare(
    'SELECT l.user_id, l.number, u.username FROM lottery l JOIN users u ON u.id=l.user_id WHERE week=?'
  ).all(week);
  const mine = entries.find(e => e.user_id === req.user.id) || null;
  const winner = db.prepare(
    'SELECT lw.number, u.username FROM lottery_winners lw JOIN users u ON u.id=lw.user_id WHERE lw.week=?'
  ).get(week) || null;
  res.json({ week, entries, mine, winner });
});
app.post('/api/lottery', auth, (req, res) => {
  const week = currentWeek();
  const n = parseInt(req.body.number, 10);
  if (!(n >= 1 && n <= 100)) return res.status(400).json({ error: 'Число 1..100' });
  try {
    db.prepare('INSERT INTO lottery (user_id,week,number) VALUES (?,?,?)').run(req.user.id, week, n);
    res.json({ ok: 1 });
  } catch { res.status(400).json({ error: 'Вы уже участвуете на этой неделе' }); }
});
app.post('/api/lottery/draw', auth, adminOnly, (req, res) => {
  const week = currentWeek();
  const entries = db.prepare('SELECT * FROM lottery WHERE week=?').all(week);
  if (!entries.length) return res.status(400).json({ error: 'Нет участников' });
  const w = entries[Math.floor(Math.random() * entries.length)];
  db.prepare('INSERT OR REPLACE INTO lottery_winners (week,user_id,number) VALUES (?,?,?)')
    .run(week, w.user_id, w.number);
  res.json({ winner: w });
});

/* ---------- Запуск ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Сервер: http://localhost:${PORT}`));
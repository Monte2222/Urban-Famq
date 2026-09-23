const app = document.getElementById('app');
let ME = null;
let VIEW = 'profile';
let currentChart = null;
let SELLING_ID = null;
let RENT_CAT_STATE = 'house';
let fishingTimerInterval = null;
let propertyTimerInterval = null;

/* ---------- Тема ---------- */
(function initTheme(){
  const saved = localStorage.getItem('theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.dataset.theme = saved || (prefersLight ? 'light' : 'dark');
})();

/* ---------- API ---------- */
const api = async (path, opts = {}) => {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Ошибка');
    err.status = res.status;
    throw err;
  }
  return data;
};

/* ---------- Утилиты ---------- */
const fmt = n => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));

const dicebearUrl = (seed, size = 80) =>
  `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(seed)}&size=${size}&backgroundType=gradientLinear&backgroundColor=7c5cff,22d3ee,f472b6,a855f7`;

const getAvatar = (user, size = 80) => {
  if (!user) return dicebearUrl('unknown', size);
  if (typeof user === 'string') return dicebearUrl(user, size);
  return user.avatar || dicebearUrl(user.username || 'unknown', size);
};

const toast = (msg, err) => {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 420);
  }, 2300);
};

const animateCount = (el, target, dur = 900) => {
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(target * eased);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = fmt(target);
  };
  requestAnimationFrame(step);
};

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

const formatDuration = (hours) => {
  const h = +hours || 0;
  if (h >= 24 && h % 24 === 0) {
    const days = h / 24;
    return `${days} ${plural(days, 'день', 'дня', 'дней')}`;
  }
  return `${h} ч`;
};

const formatTimer = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

const formatHumanDuration = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h} ч`);
  if (m || h) parts.push(`${m} мин`);
  parts.push(`${s} сек`);
  return parts.join(' ');
};

/* ---------- Выпадающий список ---------- */
function customSelectHTML(id, options, defaultValue) {
  const selected = options.find(o => o.value === defaultValue) || options[0];
  return `
    <div class="sel" data-select="${id}">
      <button class="sel-btn" type="button">
        <span class="sel-value">${selected.label}</span>
        <span class="sel-arrow">▼</span>
      </button>
      <div class="sel-menu">
        ${options.map(o => `<div class="sel-opt ${o.value === selected.value ? 'active' : ''}" data-value="${o.value}">${o.label}</div>`).join('')}
      </div>
      <input type="hidden" id="${id}" value="${selected.value}" />
    </div>`;
}

function bindCustomSelects(root) {
  root.querySelectorAll('.sel').forEach(sel => {
    const btn = sel.querySelector('.sel-btn');
    const input = sel.querySelector('input[type="hidden"]');
    const valueEl = sel.querySelector('.sel-value');
    if (!btn || !input) return;
    btn.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.sel.open').forEach(s => { if (s !== sel) s.classList.remove('open'); });
      sel.classList.toggle('open');
    };
    sel.querySelectorAll('.sel-opt').forEach(opt => {
      opt.onclick = (e) => {
        e.stopPropagation();
        input.value = opt.dataset.value;
        valueEl.innerHTML = opt.innerHTML.replace(/✓\s*$/, '');
        sel.querySelectorAll('.sel-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        sel.classList.remove('open');
        input.dispatchEvent(new Event('change'));
      };
    });
  });
}

document.addEventListener('click', () => {
  document.querySelectorAll('.sel.open').forEach(s => s.classList.remove('open'));
});

/* ---------- Авторизация ---------- */
async function renderAuth(mode = 'login') {
  app.innerHTML = `
    <div class="auth card">
      <h1>${mode === 'login' ? 'Вход в семью' : 'Регистрация'}</h1>
      <input id="u" placeholder="Имя" autocomplete="username" />
      <input id="p" placeholder="Пароль" type="password" autocomplete="current-password" />
      ${mode === 'register' ? '<p class="muted" style="margin-top:8px;font-size:12px;line-height:1.5">⚠️ После регистрации заявку должен подтвердить администратор</p>' : ''}
      <div class="row" style="margin-top:14px">
        <button id="go" style="flex:1">${mode === 'login' ? 'Войти' : 'Отправить заявку'}</button>
      </div>
      <p class="muted" style="margin-top:16px;text-align:center">
        ${mode === 'login'
          ? 'Нет аккаунта? <a href="#" id="switch">Зарегистрироваться</a>'
          : 'Уже есть аккаунт? <a href="#" id="switch">Войти</a>'}
      </p>
    </div>`;

  document.getElementById('switch').onclick = (e) => {
    e.preventDefault(); renderAuth(mode === 'login' ? 'register' : 'login');
  };
  document.getElementById('go').onclick = async () => {
    const username = document.getElementById('u').value.trim();
    const password = document.getElementById('p').value;
    if (mode === 'register') {
      try {
        await api('/register', { method: 'POST', body: { username, password } });
        app.innerHTML = `
          <div class="auth card">
            <h1>Заявка отправлена</h1>
            <div class="pending-message">
              <span class="pm-icon">⏳</span>
              Ваша заявка на вступление в семью отправлена!<br>
              Дождитесь, пока <b>администратор подтвердит</b> её — после этого вы сможете войти.
            </div>
            <button id="back" style="width:100%;padding:14px;margin-top:16px">← Вернуться ко входу</button>
          </div>`;
        document.getElementById('back').onclick = () => renderAuth('login');
      } catch (e) { toast(e.message, true); }
      return;
    }
    try {
      const { user } = await api('/login', { method: 'POST', body: { username, password } });
      ME = user; await renderApp();
    } catch (e) { toast(e.message, true); }
  };
}

/* ---------- Навигация ---------- */
const NAV_TOP = [
  ['dashboard', '📊', 'Главная'],
  ['events', '🎉', 'Мероприятия'],
  ['lottery', '🎲', 'Лотерея'],
  ['members', '👥', 'Состав'],
  ['resell', '💰', 'Перекупство'],
  ['rental', '🏠', 'Аренда'],
  ['property', '🏡', 'Дом и Квартира'],
  ['fishing', '🎣', 'Рыбалка и сокровища'],
  ['bp', '⚡', 'BP'],
];

const NAV_BOTTOM = [
  ['rules', '📜', 'Правила'],
  ['about', 'ℹ️', 'О семье'],
];

function setupDragScroll(el) {
  if (!el) return;
  let isDown = false, startX = 0, scrollLeft = 0, dragged = false;

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDown = true;
    dragged = false;
    startX = e.pageX - el.offsetLeft;
    scrollLeft = el.scrollLeft;
  });

  const stop = () => {
    if (!isDown) return;
    isDown = false;
    el.classList.remove('dragging');
    if (dragged) {
      el.dataset.preventClick = '1';
      setTimeout(() => { delete el.dataset.preventClick; }, 60);
      dragged = false;
    }
  };

  el.addEventListener('mouseleave', stop);
  window.addEventListener('mouseup', stop);

  el.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    const x = e.pageX - el.offsetLeft;
    const walk = x - startX;
    if (Math.abs(walk) > 5) dragged = true;
    if (dragged) {
      e.preventDefault();
      el.classList.add('dragging');
      el.scrollLeft = scrollLeft - walk;
    }
  });

  el.addEventListener('click', (e) => {
    if (el.dataset.preventClick) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}

function scrollActiveIntoView(container, active) {
  if (!container || !active) return;
  const target = active.offsetLeft - (container.clientWidth / 2) + (active.clientWidth / 2);
  container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
}

async function renderApp() {
  const isAdmin = ME.role === 'admin';
  const theme = document.documentElement.dataset.theme;

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">UF</div>
        <div class="brand-text">Urban Famq<small>GTA 5 RP</small></div>
      </div>
      <nav class="topnav" id="topnav" aria-label="Основная навигация">
        ${NAV_TOP.map(([k, i, l]) =>
          `<a data-v="${k}" class="${VIEW === k ? 'active' : ''}"><span>${i}</span>${l}</a>`).join('')}
        ${isAdmin ? `<a data-v="admin" class="${VIEW === 'admin' ? 'active' : ''}"><span>🛡</span>Админ</a>` : ''}
      </nav>
      <div class="userbox">
        <button id="theme-btn" class="icon-btn" title="Сменить тему">${theme === 'dark' ? '☀️' : '🌙'}</button>
        <div class="user-info" id="user-info-btn" style="cursor:pointer">
          <img class="avatar sm" src="${getAvatar(ME, 64)}" alt="" />
          <div>
            <div class="name">${ME.username}</div>
            <span class="role">${ME.role === 'admin' ? 'Администратор' : 'Семья'}</span>
          </div>
        </div>
        <button id="logout-btn" class="icon-btn" title="Выйти">🚪</button>
      </div>
    </header>

    <section class="content" id="content"></section>

    <nav class="bottomnav" aria-label="Дополнительно">
      ${NAV_BOTTOM.map(([k, i, l]) =>
        `<a data-v="${k}" class="${VIEW === k ? 'active' : ''}"><span>${i}</span>${l}</a>`).join('')}
    </nav>`;

  const topnav = document.getElementById('topnav');
  setupDragScroll(topnav);
  scrollActiveIntoView(topnav, topnav.querySelector('a.active'));

  const allNavLinks = app.querySelectorAll('.topnav a, .bottomnav a');
  allNavLinks.forEach(a => {
    a.onclick = () => {
      VIEW = a.dataset.v;
      allNavLinks.forEach(x => x.classList.toggle('active', x.dataset.v === VIEW));
      scrollActiveIntoView(topnav, topnav.querySelector('a.active'));
      loadView();
    };
  });

  document.getElementById('user-info-btn').onclick = () => {
    VIEW = 'profile';
    allNavLinks.forEach(x => x.classList.toggle('active', x.dataset.v === 'profile'));
    scrollActiveIntoView(topnav, topnav.querySelector('a.active'));
    loadView();
  };

  document.getElementById('logout-btn').onclick = () => {
    api('/logout', { method: 'POST' }).then(() => { ME = null; renderAuth(); });
  };

  document.getElementById('theme-btn').onclick = (e) => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    e.currentTarget.textContent = next === 'dark' ? '☀️' : '🌙';
    if (['dashboard','bp','resell','rental','fishing','property'].includes(VIEW)) loadView();
  };

  loadView();
}

function loadView() {
  const c = document.getElementById('content');
  if (currentChart) { currentChart.destroy(); currentChart = null; }
  if (fishingTimerInterval) { clearInterval(fishingTimerInterval); fishingTimerInterval = null; }
  if (propertyTimerInterval) { clearInterval(propertyTimerInterval); propertyTimerInterval = null; }
  c.innerHTML = '<p class="muted">Загрузка…</p>';
  (VIEWS[VIEW] || VIEWS.profile)(c).catch(e => c.innerHTML = `<p>${e.message}</p>`);
}

/* ---------- ПРОФИЛЬ ---------- */
async function viewProfile(c) {
  const [statsRes] = await Promise.all([
    api('/profile/stats'),
  ]);
  const { created_at, sums } = statsRes;

  c.innerHTML = `
    <h1>Личный кабинет</h1>

    <div class="profile-hero">
      <div class="profile-avatar-wrap">
        <img id="profile-avatar" src="${getAvatar(ME, 260)}" alt="avatar" />
        <button class="profile-avatar-edit" id="avatar-edit" title="Загрузить фото">📷</button>
        <input type="file" accept="image/*" id="avatar-file" class="avatar-file-hidden" />
      </div>
      <div style="min-width:0">
        <div class="profile-name">${ME.username}</div>
        <div class="profile-role">
          <span class="badge ${ME.role}">${ME.role === 'admin' ? 'Администратор' : 'Семья'}</span>
        </div>
        <div class="profile-since">
          📅 В семье с ${created_at ? new Date(created_at + 'Z').toLocaleDateString('ru-RU', {day:'2-digit',month:'long',year:'numeric'}) : '—'}
        </div>
        ${ME.avatar ? `<button class="ghost" id="avatar-remove" style="margin-top:14px;padding:8px 14px;font-size:12.5px">🗑 Удалить фото</button>` : ''}
      </div>
    </div>

    <div class="profile-stats-grid">
      <div class="stat"><div class="lbl">Сегодня</div><div class="num" data-num="${sums.day}">0</div></div>
      <div class="stat"><div class="lbl">За неделю</div><div class="num" data-num="${sums.week}">0</div></div>
      <div class="stat"><div class="lbl">За месяц</div><div class="num" data-num="${sums.month}">0</div></div>
      <div class="stat"><div class="lbl">Всего</div><div class="num" data-num="${sums.total}">0</div><div class="muted">${sums.cnt} операций</div></div>
    </div>

    <div class="card">
      <h3>🧹 Сброс статистики</h3>
      <p class="muted" style="margin-bottom:14px;line-height:1.55">
        Удаляет все записи о заработке: операции, сдачи в аренду, продажи, рыбалки и сокровища.
        Действие необратимо.
      </p>
      <div class="row" style="gap:10px;flex-wrap:wrap">
        <button id="reset-day" class="ghost">🗓 Сбросить за день</button>
        <button id="reset-all" class="danger">⚠️ Сбросить всё время</button>
      </div>
    </div>

    <div class="card">
      <h3>🔒 Смена пароля</h3>
      <div class="form-row">
        <input id="pw-old" type="password" placeholder="Старый пароль" />
        <input id="pw-new" type="password" placeholder="Новый пароль (мин. 4 символа)" />
      </div>
      <button id="pw-save">Сменить пароль</button>
    </div>
  `;

  c.querySelectorAll('[data-num]').forEach(el => animateCount(el, +el.dataset.num));

  const fileInput = document.getElementById('avatar-file');
  document.getElementById('avatar-edit').onclick = () => fileInput.click();

  fileInput.onchange = async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Только изображения', true);
    try {
      const dataUrl = await resizeImage(file, 260, 0.85);
      await api('/profile/avatar', { method: 'POST', body: { avatar: dataUrl } });
      ME.avatar = dataUrl;
      toast('✅ Фото обновлено');
      viewProfile(c);
      const topAvatar = document.querySelector('.user-info .avatar');
      if (topAvatar) topAvatar.src = dataUrl;
    } catch (e) { toast(e.message || 'Ошибка загрузки', true); }
  };

  const removeBtn = document.getElementById('avatar-remove');
  if (removeBtn) removeBtn.onclick = async () => {
    if (!confirm('Удалить фото?')) return;
    await api('/profile/avatar', { method: 'POST', body: { avatar: '' } });
    ME.avatar = null;
    toast('Фото удалено');
    viewProfile(c);
    const topAvatar = document.querySelector('.user-info .avatar');
    if (topAvatar) topAvatar.src = dicebearUrl(ME.username, 64);
  };

  document.getElementById('reset-day').onclick = async () => {
    if (!confirm('Сбросить всю статистику за сегодня (с 7:00 МСК)?\n\nБудут удалены: операции, сдачи аренды, продажи, рыбалки и сокровища за этот день. Действие необратимо.')) return;
    try {
      const res = await api('/profile/reset-stats', { method: 'POST', body: { scope: 'day' } });
      const total = Object.values(res.deleted).reduce((a, b) => a + b, 0);
      toast(`Удалено записей: ${total}`);
      viewProfile(c);
    } catch (e) { toast(e.message, true); }
  };

  document.getElementById('reset-all').onclick = async () => {
    if (!confirm('Сбросить статистику за ВСЁ время?\n\nБудут удалены ВСЕ операции, сдачи аренды, продажи, рыбалки и сокровища. Действие необратимо.')) return;
    if (!confirm('Точно? Это действие нельзя отменить.')) return;
    try {
      const res = await api('/profile/reset-stats', { method: 'POST', body: { scope: 'all' } });
      const total = Object.values(res.deleted).reduce((a, b) => a + b, 0);
      toast(`Удалено записей: ${total}`);
      viewProfile(c);
    } catch (e) { toast(e.message, true); }
  };

  document.getElementById('pw-save').onclick = async () => {
    const oldPw = document.getElementById('pw-old').value;
    const newPw = document.getElementById('pw-new').value;
    if (!oldPw || !newPw) return toast('Заполните оба поля', true);
    try {
      await api('/profile/password', { method: 'POST', body: { old_password: oldPw, new_password: newPw } });
      toast('✅ Пароль изменён');
      document.getElementById('pw-old').value = '';
      document.getElementById('pw-new').value = '';
    } catch (e) { toast(e.message, true); }
  };
}

function resizeImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        } else {
          if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0d0f16';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Главная (бывший Дашборд) ---------- */
async function viewDashboard(c) {
  const [s, acts] = await Promise.all([api('/stats'), api('/activities')]);
  const sum = arr => arr.reduce((a, b) => a + b.total, 0);
  const cnt = arr => arr.reduce((a, b) => a + b.cnt, 0);
  c.innerHTML = `
    <h1>Главная, ${ME.username}</h1>
    <div class="grid g4">
      <div class="stat"><div class="lbl">Сегодня</div><div class="num" data-num="${sum(s.day)}">0</div><div class="muted">${cnt(s.day)} операций</div></div>
      <div class="stat"><div class="lbl">За неделю</div><div class="num" data-num="${sum(s.week)}">0</div><div class="muted">${cnt(s.week)} операций</div></div>
      <div class="stat"><div class="lbl">За месяц</div><div class="num" data-num="${sum(s.month)}">0</div><div class="muted">${cnt(s.month)} операций</div></div>
      <div class="stat"><div class="lbl">Всего</div><div class="num" data-num="${sum(s.total)}">0</div><div class="muted">${cnt(s.total)} операций</div></div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0">Заработок за 14 дней</h3>
        <span class="pill">📈 динамика</span>
      </div>
      <div class="chart-wrap"><canvas id="chart"></canvas></div>
    </div>
    <div class="card">
      <h3>Разбивка по типу (за месяц)</h3>
      <table>
        <tr><th>Тип</th><th>Сумма</th><th>Операций</th></tr>
        ${s.month.length ? s.month.map(r =>
          `<tr><td>${r.type}</td><td>${fmt(r.total)}</td><td>${r.cnt}</td></tr>`).join('')
          : '<tr><td colspan="3" class="muted">Нет данных</td></tr>'}
      </table>
    </div>
    <div class="card">
      <h3>Последние операции</h3>
      <table>
        <tr><th>Дата</th><th>Тип</th><th>Сумма</th><th>Детали</th></tr>
        ${acts.slice(0, 20).map(a => `<tr>
          <td class="muted">${new Date(a.created_at + 'Z').toLocaleString('ru-RU')}</td>
          <td>${a.type}</td>
          <td>${fmt(a.amount)}</td>
          <td class="muted">${Object.entries(a.details).map(([k, v]) => `${k}: ${v}`).join(', ')}</td>
        </tr>`).join('') || '<tr><td colspan="4" class="muted">Нет операций</td></tr>'}
      </table>
    </div>`;

  c.querySelectorAll('[data-num]').forEach(el => animateCount(el, +el.dataset.num));

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const byDay = {};
  acts.forEach(a => { const d = a.created_at.slice(0, 10); byDay[d] = (byDay[d] || 0) + a.amount; });
  const values = days.map(d => byDay[d] || 0);

  const styles = getComputedStyle(document.documentElement);
  const gridColor = styles.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,.06)';
  const textColor = styles.getPropertyValue('--chart-text').trim() || '#8b93a7';
  const ctx = document.getElementById('chart').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, 'rgba(124,92,255,.55)');
  grad.addColorStop(0.6, 'rgba(34,211,238,.15)');
  grad.addColorStop(1, 'rgba(34,211,238,0)');

  currentChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days.map(d => d.slice(5).split('-').reverse().join('.')),
      datasets: [{
        label: 'Заработок', data: values,
        borderColor: '#7c5cff', borderWidth: 3, tension: .4, fill: true,
        backgroundColor: grad,
        pointBackgroundColor: '#22d3ee', pointBorderColor: '#fff', pointBorderWidth: 2,
        pointRadius: 4, pointHoverRadius: 8, pointHoverBackgroundColor: '#f472b6',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 1100, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(20,22,30,.95)', borderColor: 'rgba(124,92,255,.5)',
          borderWidth: 1, padding: 12, cornerRadius: 12,
          titleFont: { family: 'Manrope', weight: '700', size: 13 },
          bodyFont: { family: 'Manrope', size: 13 },
          callbacks: { label: ctx => ' ' + fmt(ctx.parsed.y) }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor, font: { family: 'Manrope', size: 11, weight: '600' } } },
        y: { grid: { color: gridColor, drawBorder: false }, ticks: { color: textColor, font: { family: 'Manrope', size: 11, weight: '600' }, callback: v => fmt(v) } }
      }
    }
  });
}

/* ---------- Мероприятия ---------- */
async function viewEvents(c) {
  const events = await api('/events');
  const isAdmin = ME.role === 'admin';
  c.innerHTML = `
    <h1>Мероприятия семьи</h1>
    ${isAdmin ? `
      <div class="card">
        <h3>Добавить мероприятие</h3>
        <input id="et" placeholder="Название" />
        <textarea id="ed" placeholder="Описание" style="margin-top:8px"></textarea>
        <input id="edate" type="datetime-local" style="margin-top:8px" />
        <button id="add" style="margin-top:12px">Добавить</button>
      </div>` : ''}
    <div class="grid g2">
      ${events.map(e => `
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <b style="font-size:15px">${e.title}</b>
            <span class="pill">${new Date(e.date).toLocaleString('ru-RU')}</span>
          </div>
          <p style="margin-top:10px;line-height:1.55">${e.description || ''}</p>
          ${isAdmin ? `<button class="danger" data-del="${e.id}" style="margin-top:12px">Удалить</button>` : ''}
        </div>`).join('') || '<p class="muted">Мероприятий пока нет</p>'}
    </div>`;
  if (isAdmin) {
    document.getElementById('add').onclick = async () => {
      try {
        await api('/events', { method: 'POST', body: {
          title: document.getElementById('et').value,
          description: document.getElementById('ed').value,
          date: document.getElementById('edate').value,
        }});
        toast('Добавлено'); viewEvents(c);
      } catch (e) { toast(e.message, true); }
    };
    c.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      await api('/events/' + b.dataset.del, { method: 'DELETE' }); viewEvents(c);
    });
  }
}

/* ---------- Лотерея ---------- */
async function viewLottery(c) {
  const { week, entries, mine, winner } = await api('/lottery');
  const isAdmin = ME.role === 'admin';
  c.innerHTML = `
    <h1>Еженедельная лотерея</h1>
    <p class="muted">Неделя: <b>${week}</b>. Выберите число от 1 до 100.</p>
    ${winner ? `<div class="card" style="margin-top:16px;border-color:rgba(124,92,255,.5)">
      🏆 Победитель: <b>${winner.username}</b> (число ${winner.number})
    </div>` : ''}
    <div class="card" style="margin-top:16px">
      <h3>${mine ? 'Ваш выбор: ' + mine.number : 'Участвовать'}</h3>
      ${!mine ? `
        <div class="row gap" style="margin-top:10px">
          <input id="lnum" type="number" min="1" max="100" placeholder="Число 1..100" />
          <button id="lgo" style="flex:0 0 auto">Записаться</button>
        </div>` : ''}
      ${isAdmin ? `<button id="draw" class="ghost" style="margin-top:14px">Провести розыгрыш</button>` : ''}
    </div>
    <div class="card">
      <h3>Участники (${entries.length})</h3>
      <table>
        <tr><th>Игрок</th><th>Число</th></tr>
        ${entries.map(e => `<tr>
          <td><div class="row" style="gap:10px">
            <img class="avatar sm" src="${dicebearUrl(e.username, 64)}" alt="" />
            <b>${e.username}</b>
          </div></td>
          <td>${e.number}</td>
        </tr>`).join('') || '<tr><td colspan="2" class="muted">Пока никто</td></tr>'}
      </table>
    </div>`;
  const btn = document.getElementById('lgo');
  if (btn) btn.onclick = async () => {
    try {
      await api('/lottery', { method: 'POST', body: { number: document.getElementById('lnum').value } });
      toast('Участие принято'); viewLottery(c);
    } catch (e) { toast(e.message, true); }
  };
  const d = document.getElementById('draw');
  if (d) d.onclick = async () => {
    try { await api('/lottery/draw', { method: 'POST' }); toast('Розыгрыш завершён'); viewLottery(c); }
    catch (e) { toast(e.message, true); }
  };
}

/* ---------- Состав ---------- */
async function viewMembers(c) {
  const users = await api('/members');
  c.innerHTML = `
    <h1>Состав семьи</h1>
    ${users.length ? `
      <div class="grid g3">
        ${users.map(u => `
          <div class="card" style="text-align:center">
            <img class="avatar lg" src="${getAvatar(u, 256)}" alt="" style="margin:0 auto 12px;width:72px;height:72px" />
            <b style="font-size:15px">${u.username}</b>
            <div style="margin-top:8px">
              <span class="badge family">Семья</span>
            </div>
            <div class="muted" style="margin-top:10px">
              В семье с ${new Date(u.created_at + 'Z').toLocaleDateString('ru-RU')}
            </div>
          </div>`).join('')}
      </div>`
    : '<div class="usr-empty"><span>👥</span>Пока никого нет</div>'}
  `;
}

/* ---------- Правила ---------- */
async function viewRules(c) {
  const rules = await api('/rules');
  const isAdmin = ME.role === 'admin';
  c.innerHTML = `
    <h1>Правила семьи</h1>
    ${isAdmin ? `
      <div class="card">
        <input id="rt" placeholder="Новое правило" />
        <button id="radd" style="margin-top:12px">Добавить</button>
      </div>` : ''}
    <div class="card">
      <ol style="padding-left:22px;line-height:1.9">
        ${rules.map(r => `<li style="margin-bottom:6px">${r.text} ${isAdmin ? `<button class="ghost" data-r="${r.id}" style="padding:3px 12px;font-size:12px;margin-left:8px">×</button>` : ''}</li>`).join('')}
      </ol>
    </div>`;
  if (isAdmin) {
    document.getElementById('radd').onclick = async () => {
      await api('/rules', { method: 'POST', body: { text: document.getElementById('rt').value } });
      viewRules(c);
    };
    c.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => {
      await api('/rules/' + b.dataset.r, { method: 'DELETE' }); viewRules(c);
    });
  }
}

/* ---------- О семье ---------- */
async function viewAbout(c) {
  const info = await api('/info');
  const isAdmin = ME.role === 'admin';
  c.innerHTML = `
    <h1>О нашей семье</h1>
    <div class="card">
      ${isAdmin ? `<textarea id="it" rows="8">${info.text}</textarea>
        <button id="isave" style="margin-top:12px">Сохранить</button>`
      : `<p style="white-space:pre-wrap;line-height:1.7;font-size:15px">${info.text}</p>`}
    </div>`;
  if (isAdmin) document.getElementById('isave').onclick = async () => {
    await api('/info', { method: 'POST', body: { text: document.getElementById('it').value } });
    toast('Сохранено');
  };
}

/* ---------- ПЕРЕКУПСТВО ---------- */
async function viewResell(c) {
  const [walletRes, deals, history] = await Promise.all([
    api('/wallet'), api('/deals'), api('/deal-sales'),
  ]);
  const balance = walletRes.amount || 0;
  const open = deals.filter(d => d.status === 'open');

  const now = Date.now();
  const stats = { day: 0, week: 0, month: 0, total: 0, cnt: { day: 0, week: 0, month: 0, total: 0 } };
  history.forEach(h => {
    const profit = h.profit;
    const t = h.created_at ? new Date(h.created_at.replace(' ', 'T') + 'Z').getTime() : 0;
    stats.total += profit; stats.cnt.total++;
    if (now - t < 86400000) { stats.day += profit; stats.cnt.day++; }
    if (now - t < 7 * 86400000) { stats.week += profit; stats.cnt.week++; }
    if (now - t < 30 * 86400000) { stats.month += profit; stats.cnt.month++; }
  });

  const openHTML = open.length ? open.map(d => {
    const isSelling = SELLING_ID === d.id;
    const total = d.buy_price * d.qty;
    const soldQty = d.sold_qty || 0;
    const remaining = d.qty - soldQty;
    const soldPercent = d.qty > 0 ? Math.round((soldQty / d.qty) * 100) : 0;
    return `
      <div class="deal-row ${isSelling ? 'selling' : ''}">
        <div class="deal-info">
          <div class="deal-name">${d.item} <small>× ${d.qty}</small></div>
          <div class="deal-meta">
            Куплено за <b>−${fmt(total)}</b> $ · ${fmt(d.buy_price)}/шт
            ${soldQty > 0 ? ` · Продано: ${soldQty} шт` : ''}
            ${remaining > 0 && soldQty > 0 ? ` · Осталось: ${remaining} шт` : ''}
          </div>
          ${soldQty > 0 ? `
            <div class="deal-progress">
              <div class="deal-progress-bar">
                <div class="deal-progress-fill" style="width:${soldPercent}%"></div>
              </div>
              <div class="deal-progress-text"><b>${soldQty}</b>/${d.qty}</div>
            </div>
          ` : ''}
        </div>
        <div class="deal-actions" data-deal-actions="${d.id}">
          ${isSelling
            ? `<div class="deal-sell-form">
                 <div class="deal-sell-field"><label>Кол-во</label>
                   <input class="qty" id="sell-qty-${d.id}" type="number" min="1" max="${remaining}" value="${remaining}" />
                 </div>
                 <div class="deal-sell-field"><label>Цена / шт</label>
                   <input id="sell-input-${d.id}" type="number" min="0" placeholder="$" value="${d.buy_price}" />
                 </div>
                 <button class="deal-sell-ok" data-sell-ok="${d.id}" style="align-self:flex-end">OK</button>
                 <button class="deal-cancel" data-sell-cancel="1" style="align-self:flex-end">×</button>
               </div>`
            : `<button class="deal-sell-btn" data-sell="${d.id}">💰 Продал</button>
               <button class="deal-cancel" data-remove="${d.id}" title="Отменить покупку">×</button>`}
        </div>
      </div>`;
  }).join('') : `<div class="deal-empty"><span>📦</span>Активных сделок нет<br><span class="muted">Купи что-нибудь через форму выше</span></div>`;

  const historyHTML = history.length ? history.map(h => {
    const profit = h.profit;
    const cls = profit > 0 ? 'deal-profit-pos' : (profit < 0 ? 'deal-profit-neg' : 'deal-profit-zero');
    const sign = profit > 0 ? '+' : '';
    const date = h.created_at ? new Date(h.created_at.replace(' ', 'T') + 'Z').toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    }) : '—';
    return `<tr>
      <td class="muted">${date}</td>
      <td><b>${h.item}</b> <span class="muted">× ${h.qty}</span></td>
      <td>${fmt(h.buy_price * h.qty)} $</td>
      <td>${fmt(h.sell_price * h.qty)} $</td>
      <td class="${cls}">${sign}${fmt(profit)} $</td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" class="muted" style="text-align:center;padding:22px">Продаж пока нет</td></tr>`;

  c.innerHTML = `
    <h1>💰 Перекупство</h1>
    <div class="card wallet-card">
      <div class="wallet-grid">
        <div>
          <div class="wallet-label">💵 Текущий баланс</div>
          <div class="wallet-value ${balance < 0 ? 'negative' : ''}"><span id="wallet-val">${fmt(balance)}</span> <small>$</small></div>
          <div class="wallet-hint">Укажи, сколько у тебя сейчас денег. Покупки будут списываться, продажи — прибавляться.</div>
        </div>
        <div class="wallet-edit">
          <input id="wallet-input" type="number" placeholder="0" value="${balance}" />
          <button id="wallet-save">Сохранить</button>
        </div>
      </div>
    </div>
    <div class="grid g4" style="margin-top:16px">
      <div class="stat"><div class="lbl">Прибыль сегодня</div><div class="num" data-num="${stats.day}">0</div><div class="muted">${stats.cnt.day} ${plural(stats.cnt.day, 'продажа', 'продажи', 'продаж')}</div></div>
      <div class="stat"><div class="lbl">За неделю</div><div class="num" data-num="${stats.week}">0</div><div class="muted">${stats.cnt.week} ${plural(stats.cnt.week, 'продажа', 'продажи', 'продаж')}</div></div>
      <div class="stat"><div class="lbl">За месяц</div><div class="num" data-num="${stats.month}">0</div><div class="muted">${stats.cnt.month} ${plural(stats.cnt.month, 'продажа', 'продажи', 'продаж')}</div></div>
      <div class="stat"><div class="lbl">Всего</div><div class="num" data-num="${stats.total}">0</div><div class="muted">${stats.cnt.total} ${plural(stats.cnt.total, 'продажа', 'продажи', 'продаж')}</div></div>
    </div>
    <div class="card buy-card" style="margin-top:16px">
      <h3>🛒 Купил</h3>
      <div class="form-row">
        <input id="buy-item" placeholder="Что купил (машина, товар, кейс)" />
        <input id="buy-qty" type="number" min="1" value="1" placeholder="Количество" />
      </div>
      <div class="form-row">
        <input id="buy-price" type="number" min="0" placeholder="Цена покупки за 1 шт." />
        <div style="display:flex;align-items:center;justify-content:flex-end">
          <div class="pill" style="font-size:13px">Итого: <b id="buy-total" style="margin-left:6px;color:#f87171">−0 $</b></div>
        </div>
      </div>
      <button id="buy-btn">🛒 Купить</button>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0">📦 Активные сделки</h3>
        <span class="pill">${open.length}</span>
      </div>
      <div id="deals-open">${openHTML}</div>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0">📜 История продаж</h3>
        <span class="pill">${history.length}</span>
      </div>
      <div style="overflow-x:auto">
        <table class="deal-history">
          <tr><th>Дата</th><th>Товар</th><th>Куплено</th><th>Продано</th><th>Прибыль</th></tr>
          ${historyHTML}
        </table>
      </div>
    </div>`;

  c.querySelectorAll('[data-num]').forEach(el => animateCount(el, +el.dataset.num));
  document.getElementById('wallet-save').onclick = async () => {
    const val = +document.getElementById('wallet-input').value || 0;
    await api('/wallet', { method: 'POST', body: { amount: val } });
    toast(`Баланс: ${fmt(val)} $`);
    viewResell(c);
  };
  const updateBuyTotal = () => {
    const q = +document.getElementById('buy-qty').value || 0;
    const p = +document.getElementById('buy-price').value || 0;
    document.getElementById('buy-total').textContent = `−${fmt(q * p)} $`;
  };
  document.getElementById('buy-qty').oninput = updateBuyTotal;
  document.getElementById('buy-price').oninput = updateBuyTotal;
  document.getElementById('buy-btn').onclick = async () => {
    const item = document.getElementById('buy-item').value.trim();
    const qty = +document.getElementById('buy-qty').value || 0;
    const price = +document.getElementById('buy-price').value || 0;
    if (!item) return toast('Укажи название товара', true);
    if (qty <= 0) return toast('Количество должно быть > 0', true);
    try {
      const res = await api('/deals/buy', { method: 'POST', body: { item, qty, buy_price: price } });
      toast(`Куплено: −${fmt(res.total)} $`);
      SELLING_ID = null;
      viewResell(c);
    } catch (e) { toast(e.message, true); }
  };
  c.querySelectorAll('[data-sell]').forEach(btn => {
    btn.onclick = () => { SELLING_ID = +btn.dataset.sell; viewResell(c); };
  });
  c.querySelectorAll('[data-sell-cancel]').forEach(btn => {
    btn.onclick = () => { SELLING_ID = null; viewResell(c); };
  });
  c.querySelectorAll('[data-sell-ok]').forEach(btn => {
    btn.onclick = async () => {
      const id = +btn.dataset.sellOk;
      const qtyInput = document.getElementById('sell-qty-' + id);
      const priceInput = document.getElementById('sell-input-' + id);
      const qty = +qtyInput.value || 0;
      const price = +priceInput.value || 0;
      const max = +qtyInput.max || 0;
      if (qty <= 0) return toast('Укажи количество', true);
      if (qty > max) return toast(`Максимум: ${max}`, true);
      if (price <= 0) return toast('Введи цену продажи', true);
      try {
        const res = await api('/deals/sell/' + id, { method: 'POST', body: { qty, sell_price: price } });
        const profit = res.profit;
        const sign = profit > 0 ? '+' : '';
        toast(res.remaining > 0
          ? `Продано ${qty} шт · ${sign}${fmt(profit)} $ · осталось ${res.remaining}`
          : `Продано! Прибыль: ${sign}${fmt(profit)} $`);
        SELLING_ID = null;
        viewResell(c);
      } catch (e) { toast(e.message, true); }
    };
  });
  if (SELLING_ID) {
    const qtyInp = document.getElementById('sell-qty-' + SELLING_ID);
    if (qtyInp) {
      qtyInp.focus(); qtyInp.select();
      const onKey = (e) => {
        if (e.key === 'Enter') {
          const okBtn = document.querySelector(`[data-sell-ok="${SELLING_ID}"]`);
          if (okBtn) okBtn.click();
        }
        if (e.key === 'Escape') { SELLING_ID = null; viewResell(c); }
      };
      qtyInp.onkeydown = onKey;
      const priceInp = document.getElementById('sell-input-' + SELLING_ID);
      if (priceInp) priceInp.onkeydown = onKey;
    }
  }
  c.querySelectorAll('[data-remove]').forEach(btn => {
    btn.onclick = async () => {
      const id = +btn.dataset.remove;
      const deal = deals.find(d => d.id === id);
      const soldQty = deal?.sold_qty || 0;
      const remaining = deal ? (deal.qty - soldQty) : 0;
      const msg = soldQty > 0
        ? `Часть уже продана (${soldQty} шт). Вернуть деньги за оставшиеся ${remaining} шт?`
        : 'Отменить эту покупку? Деньги вернутся на баланс.';
      if (!confirm(msg)) return;
      try {
        const res = await api('/deals/' + id, { method: 'DELETE' });
        toast(`Отменено · возвращено за ${res.refunded} шт`);
        viewResell(c);
      } catch (e) { toast(e.message, true); }
    };
  });
}

/* ---------- АРЕНДА ---------- */
const RENT_CATS = [
  { value: 'house',     label: '🏡 Дом' },
  { value: 'apartment', label: '🏢 Квартира' },
  { value: 'car',       label: '🚗 Машина' },
];
const RENT_CAT_MAP = {
  house: '🏡 Дом', apartment: '🏢 Квартира', car: '🚗 Машина',
  bike: '🏍 Мотоцикл', boat: '⛵ Лодка', business: '🏪 Бизнес',
  garage: '🚙 Гараж', other: '📦 Другое',
};
const isDailyCategory = (cat) => cat === 'house' || cat === 'apartment';
const HOURS_PRESETS = [
  { value: '24', label: '24 часа' }, { value: '48', label: '48 часов' },
  { value: '99', label: '99 часов' }, { value: 'custom', label: '✏️ Своё значение' },
];
const DAYS_PRESETS = [
  { value: '1', label: '1 день' }, { value: '3', label: '3 дня' },
  { value: '7', label: '7 дней' }, { value: '14', label: '14 дней' },
  { value: '30', label: '30 дней (макс)' }, { value: 'custom', label: '✏️ Своё значение' },
];
function getPresets(cat) { return isDailyCategory(cat) ? DAYS_PRESETS : HOURS_PRESETS; }

function openTemplateModal(c, tpl) {
  const isEdit = !!(tpl && tpl.id);
  const startCat = tpl?.category || 'house';
  const startDaily = isDailyCategory(startCat);
  const startDuration = isEdit
    ? (startDaily ? Math.round((tpl.hours || 0) / 24) : (tpl.hours || 0))
    : (startDaily ? 1 : 24);
  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.innerHTML = `
    <div class="modal">
      <h2>${isEdit ? '✎ Редактировать шаблон' : '📌 Новый шаблон'}</h2>
      <div style="margin-bottom:14px">
        <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Название</label>
        <input id="m-tpl-name" placeholder="Например: Дом 3ч ночь" value="${((tpl?.name) || '').replace(/"/g, '&quot;')}" />
      </div>
      <div style="margin-bottom:14px">
        <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Категория</label>
        ${customSelectHTML('m-tpl-cat', RENT_CATS, startCat)}
      </div>
      <div style="margin-bottom:14px">
        <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Длительность</label>
        <div id="m-tpl-dur-slot">${customSelectHTML('m-tpl-dur-preset', getPresets(startCat), 'custom')}</div>
      </div>
      <div class="form-row">
        <div>
          <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase" id="m-tpl-dur-label">${startDaily ? 'Дней' : 'Часов'}</label>
          <input id="m-tpl-duration" type="number" min="1" step="${startDaily ? 1 : 0.5}" value="${startDuration}" ${startDaily ? 'max="30"' : ''} />
        </div>
        <div>
          <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Сумма $</label>
          <input id="m-tpl-amount" type="number" min="0" value="${tpl?.amount ?? 15000}" />
        </div>
      </div>
      <div class="modal-actions">
        <button class="ghost" id="m-cancel">Отмена</button>
        <button id="m-save">${isEdit ? '💾 Сохранить' : '⚡ Создать'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
  bindCustomSelects(modal);
  const close = () => { modal.classList.remove('show'); setTimeout(() => modal.remove(), 250); };
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.querySelector('#m-cancel').onclick = close;
  const catInput = modal.querySelector('#m-tpl-cat');
  const durSlot = modal.querySelector('#m-tpl-dur-slot');
  const durLabel = modal.querySelector('#m-tpl-dur-label');
  const durInput = modal.querySelector('#m-tpl-duration');
  const presetInp = () => modal.querySelector('#m-tpl-dur-preset');
  function rebuildDuration() {
    const cat = catInput.value;
    const daily = isDailyCategory(cat);
    const presets = getPresets(cat);
    durSlot.innerHTML = customSelectHTML('m-tpl-dur-preset', presets, 'custom');
    bindCustomSelects(durSlot);
    durLabel.textContent = daily ? 'Дней' : 'Часов';
    durInput.step = daily ? '1' : '0.5';
    if (daily) durInput.setAttribute('max', '30');
    else durInput.removeAttribute('max');
    if (daily && +durInput.value > 30) durInput.value = 30;
    if (!durInput.value || +durInput.value === 0) durInput.value = daily ? 1 : 24;
    presetInp().addEventListener('change', onPresetChange);
  }
  function onPresetChange() {
    const val = presetInp().value;
    if (val === 'custom') { durInput.value = ''; durInput.focus(); }
    else durInput.value = val;
  }
  catInput.addEventListener('change', rebuildDuration);
  presetInp().addEventListener('change', onPresetChange);
  modal.querySelector('#m-save').onclick = async () => {
    const name = modal.querySelector('#m-tpl-name').value.trim();
    const category = catInput.value;
    const daily = isDailyCategory(category);
    const rawDur = +durInput.value || 0;
    const amount = +modal.querySelector('#m-tpl-amount').value || 0;
    if (!name) return toast('Укажи название', true);
    if (!amount) return toast('Укажи сумму', true);
    if (rawDur <= 0) return toast('Укажи длительность', true);
    if (daily && rawDur > 30) return toast('Максимум 30 дней для дома/квартиры', true);
    const hours = daily ? rawDur * 24 : rawDur;
    try {
      if (isEdit) {
        await api('/rent-templates/' + tpl.id, { method: 'PUT', body: { name, category, hours, amount } });
        toast('Шаблон обновлён ✎');
      } else {
        await api('/rent-templates', { method: 'POST', body: { name, category, hours, amount } });
        toast('Шаблон создан ⚡');
      }
      close();
      setTimeout(() => viewRental(c), 150);
    } catch (e) { toast(e.message, true); }
  };
}

async function viewRental(c) {
  const [rentals, templates] = await Promise.all([api('/rentals'), api('/rent-templates')]);
  const now = Date.now();
  const stats = { day: 0, week: 0, month: 0, total: 0, cnt: { day: 0, week: 0, month: 0, total: 0 } };
  rentals.forEach(r => {
    const t = new Date(r.created_at + 'Z').getTime();
    stats.total += r.amount; stats.cnt.total++;
    if (now - t < 86400000) { stats.day += r.amount; stats.cnt.day++; }
    if (now - t < 7 * 86400000) { stats.week += r.amount; stats.cnt.week++; }
    if (now - t < 30 * 86400000) { stats.month += r.amount; stats.cnt.month++; }
  });
  const templatesHTML = templates.length
    ? templates.map(t => `
      <div class="tpl-card" data-tpl='${JSON.stringify({ id: t.id, category: t.category, hours: t.hours, amount: t.amount, name: t.name }).replace(/'/g, "&#39;")}'>
        <div class="tpl-flash"></div>
        <button class="tpl-edit" data-tpl-edit="${t.id}" title="Редактировать">✎</button>
        <button class="tpl-del" data-tpl-del="${t.id}" title="Удалить шаблон">×</button>
        <div class="tpl-name">⚡ ${t.name}</div>
        <div class="tpl-cat">${RENT_CAT_MAP[t.category] || t.category}</div>
        <div class="tpl-meta">
          <span>⏱ ${formatDuration(t.hours)}</span>
          <span class="tpl-amount">${fmt(t.amount)} $</span>
        </div>
      </div>`).join('')
    : `<div class="tpl-empty"><span>📌</span>Пока нет шаблонов<br><span class="muted">Создай шаблон, чтобы сдавать одним кликом</span></div>`;
  const historyHTML = rentals.length
    ? rentals.slice(0, 100).map(r => {
        const date = new Date(r.created_at + 'Z').toLocaleString('ru-RU', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        return `<tr>
          <td class="muted">${date}</td>
          <td><span class="rent-cat-badge">${RENT_CAT_MAP[r.category] || r.category}</span></td>
          <td>${formatDuration(r.hours)}</td>
          <td>${r.note ? `<span class="muted">${r.note}</span>` : '—'}</td>
          <td style="font-family:'Unbounded',sans-serif;font-weight:700;color:#6ee7b7">+${fmt(r.amount)} $</td>
          <td style="text-align:right"><button class="rent-cancel" data-rent-del="${r.id}" title="Удалить">×</button></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="6" class="muted" style="text-align:center;padding:22px">Пока ничего не сдавал</td></tr>`;
  const currentCat = RENT_CAT_STATE;
  const startDaily = isDailyCategory(currentCat);
  const startPresets = getPresets(currentCat);
  const startDuration = startDaily ? 1 : 24;
  c.innerHTML = `
    <h1>🏠 Аренда</h1>
    <div class="grid g4">
      <div class="stat"><div class="lbl">Сегодня</div><div class="num" data-num="${stats.day}">0</div><div class="muted">${stats.cnt.day} ${plural(stats.cnt.day, 'сдача', 'сдачи', 'сдач')}</div></div>
      <div class="stat"><div class="lbl">За неделю</div><div class="num" data-num="${stats.week}">0</div><div class="muted">${stats.cnt.week} ${plural(stats.cnt.week, 'сдача', 'сдачи', 'сдач')}</div></div>
      <div class="stat"><div class="lbl">За месяц</div><div class="num" data-num="${stats.month}">0</div><div class="muted">${stats.cnt.month} ${plural(stats.cnt.month, 'сдача', 'сдачи', 'сдач')}</div></div>
      <div class="stat"><div class="lbl">Всего</div><div class="num" data-num="${stats.total}">0</div><div class="muted">${stats.cnt.total} ${plural(stats.cnt.total, 'сдача', 'сдачи', 'сдач')}</div></div>
    </div>
    <div class="card rent-card" style="margin-top:16px">
      <h3>🏠 Сдать в аренду</h3>
      <div class="rent-form-row">
        <div class="rent-cell">
          <label class="rent-field-label">Категория</label>
          ${customSelectHTML('rent-cat', RENT_CATS, currentCat)}
        </div>
        <div class="rent-cell">
          <label class="rent-field-label">Длительность</label>
          <div id="duration-preset-slot">
            ${customSelectHTML('rent-duration-preset', startPresets, 'custom')}
          </div>
        </div>
        <div class="rent-cell">
          <label class="rent-field-label" id="rent-dur-label">${startDaily ? 'Дней' : 'Часов'}</label>
          <input id="rent-hours" type="number" min="1" step="${startDaily ? 1 : 0.5}" value="${startDuration}" ${startDaily ? 'max="30"' : ''} placeholder="${startDaily ? 'Дней' : 'Часов'}" />
        </div>
      </div>
      <div class="rent-form-row" style="grid-template-columns:2fr 1fr">
        <input id="rent-note" placeholder="Комментарий (необязательно)" />
        <input id="rent-amount" type="number" min="0" placeholder="Сумма $" />
      </div>
      <div class="rent-actions">
        <button id="rent-go">💸 Сдать</button>
        <button id="tpl-save" class="ghost">📌 Сохранить как шаблон</button>
      </div>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0">⚡ Мои шаблоны</h3>
        <span class="pill">${templates.length}</span>
      </div>
      <p class="muted" style="margin-bottom:12px;font-size:12px">Кликни на шаблон — аренда запишется мгновенно · Наведи — появятся ✎ и ×</p>
      <div class="templates-grid">${templatesHTML}</div>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0">📜 История сдач</h3>
        <span class="pill">${rentals.length}</span>
      </div>
      <div style="overflow-x:auto">
        <table class="rent-history">
          <tr><th>Дата</th><th>Что</th><th>Длительность</th><th>Заметка</th><th>Сумма</th><th></th></tr>
          ${historyHTML}
        </table>
      </div>
    </div>`;
  bindCustomSelects(c);
  c.querySelectorAll('[data-num]').forEach(el => animateCount(el, +el.dataset.num));
  const catInp = c.querySelector('#rent-cat');
  const durSlot = c.querySelector('#duration-preset-slot');
  const durLabel = c.querySelector('#rent-dur-label');
  const hoursInput = c.querySelector('#rent-hours');
  const presetInp = () => c.querySelector('#rent-duration-preset');
  function onPresetChange() {
    const val = presetInp().value;
    if (val === 'custom') { hoursInput.value = ''; hoursInput.focus(); }
    else hoursInput.value = val;
  }
  function rebuildDurationMain() {
    const cat = catInp.value;
    RENT_CAT_STATE = cat;
    const daily = isDailyCategory(cat);
    const presets = getPresets(cat);
    durSlot.innerHTML = customSelectHTML('rent-duration-preset', presets, 'custom');
    bindCustomSelects(durSlot);
    durLabel.textContent = daily ? 'Дней' : 'Часов';
    hoursInput.step = daily ? '1' : '0.5';
    hoursInput.placeholder = daily ? 'Дней' : 'Часов';
    if (daily) hoursInput.setAttribute('max', '30');
    else hoursInput.removeAttribute('max');
    hoursInput.value = daily ? 1 : 24;
    presetInp().addEventListener('change', onPresetChange);
  }
  catInp.addEventListener('change', rebuildDurationMain);
  presetInp().addEventListener('change', onPresetChange);
  c.querySelector('#rent-go').onclick = async () => {
    const category = catInp.value;
    const daily = isDailyCategory(category);
    const rawDur = +hoursInput.value || 0;
    const amount = +c.querySelector('#rent-amount').value || 0;
    const note = c.querySelector('#rent-note').value.trim();
    if (!amount) return toast('Укажи сумму', true);
    if (rawDur <= 0) return toast('Укажи длительность', true);
    if (daily && rawDur > 30) return toast('Максимум 30 дней для дома/квартиры', true);
    const hours = daily ? rawDur * 24 : rawDur;
    try {
      await api('/rentals', { method: 'POST', body: { category, hours, amount, note } });
      toast(`Сдано! +${fmt(amount)} $`);
      viewRental(c);
    } catch (e) { toast(e.message, true); }
  };
  c.querySelector('#tpl-save').onclick = () => {
    const category = catInp.value;
    const daily = isDailyCategory(category);
    const rawDur = +hoursInput.value || 0;
    const amount = +c.querySelector('#rent-amount').value || 0;
    if (!amount) return toast('Сначала укажи сумму', true);
    if (rawDur <= 0) return toast('Укажи длительность', true);
    const hours = daily ? rawDur * 24 : rawDur;
    const defaultName = (RENT_CAT_MAP[category] || category).replace(/^[^\s]+\s/, '');
    openTemplateModal(c, { id: null, name: `${defaultName} ${formatDuration(hours)}`, category, hours, amount });
  };
  c.querySelectorAll('[data-tpl]').forEach(el => {
    el.onclick = async (ev) => {
      if (ev.target.closest('[data-tpl-del]') || ev.target.closest('[data-tpl-edit]')) return;
      const t = JSON.parse(el.dataset.tpl);
      el.classList.add('flash');
      try {
        await api('/rentals', { method: 'POST', body: { category: t.category, hours: t.hours, amount: t.amount, note: t.name } });
        toast(`⚡ ${t.name}: +${fmt(t.amount)} $`);
        setTimeout(() => viewRental(c), 250);
      } catch (e) { toast(e.message, true); }
    };
  });
  c.querySelectorAll('[data-tpl-edit]').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const id = +btn.dataset.tplEdit;
      const tpl = templates.find(t => t.id === id);
      if (tpl) openTemplateModal(c, tpl);
    };
  });
  c.querySelectorAll('[data-tpl-del]').forEach(btn => {
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      if (!confirm('Удалить шаблон?')) return;
      await api('/rent-templates/' + btn.dataset.tplDel, { method: 'DELETE' });
      toast('Шаблон удалён');
      viewRental(c);
    };
  });
  c.querySelectorAll('[data-rent-del]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Удалить эту запись?')) return;
      await api('/rentals/' + btn.dataset.rentDel, { method: 'DELETE' });
      toast('Запись удалена');
      viewRental(c);
    };
  });
}

/* ---------- ДОМ И КВАРТИРА ---------- */
const PROP_META = {
  house: {
    title: 'Дом',
    emoji: '🏡',
    svg: `
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <circle cx="330" cy="55" r="26" fill="rgba(255,255,255,.9)"/>
        <circle cx="330" cy="55" r="42" fill="rgba(255,255,255,.15)"/>
        <ellipse cx="90" cy="70" rx="42" ry="14" fill="rgba(255,255,255,.22)"/>
        <ellipse cx="120" cy="72" rx="30" ry="12" fill="rgba(255,255,255,.18)"/>
        <rect x="0" y="150" width="400" height="50" fill="rgba(0,0,0,.18)"/>
        <path d="M60 150 L200 55 L340 150 Z" fill="rgba(0,0,0,.35)"/>
        <path d="M70 150 L200 65 L330 150 Z" fill="rgba(255,255,255,.18)"/>
        <rect x="120" y="105" width="160" height="45" fill="rgba(0,0,0,.4)"/>
        <rect x="128" y="112" width="38" height="30" fill="rgba(255,255,255,.85)"/>
        <rect x="176" y="112" width="38" height="30" fill="rgba(255,255,255,.55)"/>
        <rect x="224" y="112" width="38" height="30" fill="rgba(255,255,255,.85)"/>
        <rect x="185" y="128" width="22" height="22" fill="rgba(0,0,0,.65)"/>
        <rect x="130" y="140" width="140" height="10" fill="rgba(255,255,255,.15)"/>
      </svg>`
  },
  apartment: {
    title: 'Квартира',
    emoji: '🏢',
    svg: `
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <circle cx="70" cy="45" r="22" fill="rgba(255,255,255,.85)"/>
        <circle cx="70" cy="45" r="38" fill="rgba(255,255,255,.15)"/>
        <ellipse cx="320" cy="60" rx="38" ry="12" fill="rgba(255,255,255,.2)"/>
        <rect x="0" y="160" width="400" height="40" fill="rgba(0,0,0,.2)"/>
        <rect x="70" y="30" width="100" height="130" fill="rgba(0,0,0,.42)"/>
        <rect x="160" y="55" width="90" height="105" fill="rgba(0,0,0,.35)"/>
        <rect x="240" y="20" width="90" height="140" fill="rgba(0,0,0,.48)"/>
        <g fill="rgba(255,255,255,.85)">
          <rect x="80" y="40" width="14" height="14"/><rect x="104" y="40" width="14" height="14"/>
          <rect x="128" y="40" width="14" height="14"/><rect x="80" y="66" width="14" height="14"/>
          <rect x="104" y="66" width="14" height="14" opacity=".5"/><rect x="128" y="66" width="14" height="14"/>
          <rect x="80" y="92" width="14" height="14"/><rect x="104" y="92" width="14" height="14"/>
          <rect x="128" y="92" width="14" height="14" opacity=".5"/><rect x="80" y="118" width="14" height="14" opacity=".5"/>
          <rect x="104" y="118" width="14" height="14"/><rect x="128" y="118" width="14" height="14"/>
        </g>
        <g fill="rgba(255,255,255,.7)">
          <rect x="170" y="65" width="12" height="12"/><rect x="192" y="65" width="12" height="12" opacity=".5"/>
          <rect x="214" y="65" width="12" height="12"/><rect x="170" y="90" width="12" height="12" opacity=".6"/>
          <rect x="192" y="90" width="12" height="12"/><rect x="214" y="90" width="12" height="12"/>
          <rect x="170" y="115" width="12" height="12"/><rect x="192" y="115" width="12" height="12" opacity=".5"/>
          <rect x="214" y="115" width="12" height="12"/>
        </g>
        <g fill="rgba(255,255,255,.9)">
          <rect x="250" y="30" width="14" height="14"/><rect x="274" y="30" width="14" height="14"/>
          <rect x="298" y="30" width="14" height="14"/><rect x="250" y="56" width="14" height="14" opacity=".5"/>
          <rect x="274" y="56" width="14" height="14"/><rect x="298" y="56" width="14" height="14"/>
          <rect x="250" y="82" width="14" height="14"/><rect x="274" y="82" width="14" height="14" opacity=".5"/>
          <rect x="298" y="82" width="14" height="14"/><rect x="250" y="108" width="14" height="14" opacity=".7"/>
          <rect x="274" y="108" width="14" height="14"/><rect x="298" y="108" width="14" height="14" opacity=".5"/>
        </g>
      </svg>`
  }
};
function pad2(n){ return String(n).padStart(2, '0'); }
function calcRemaining(expiresAt){
  const exp = new Date(expiresAt.replace(' ', 'T') + 'Z').getTime();
  const now = Date.now();
  const diff = exp - now;
  const expired = diff <= 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  return { expired, days, hours, minutes, ms: diff };
}
function openPropertyRateModal(c, prop, currentRate) {
  const meta = PROP_META[prop];
  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.innerHTML = `
    <div class="modal">
      <h2>${meta.emoji} Ставка: ${meta.title}</h2>
      <p class="muted" style="margin-bottom:16px;font-size:13px;line-height:1.5">Сколько стоит 1 час владения ${meta.title === 'Дом' ? 'домом' : 'квартирой'}?</p>
      <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Стоимость в час, $</label>
      <input id="r-rate" type="number" min="0" value="${currentRate || ''}" placeholder="Например 200" autofocus />
      <div class="prop-quick" style="margin-top:12px">
        ${[50, 100, 200, 500, 1000].map(r => `<button type="button" class="prop-quick-btn" data-rate-quick="${r}">${r} $</button>`).join('')}
      </div>
      <div class="modal-actions">
        <button class="ghost" id="r-cancel">Отмена</button>
        <button id="r-save">💾 Сохранить</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
  const close = () => { modal.classList.remove('show'); setTimeout(() => modal.remove(), 250); };
  const inp = modal.querySelector('#r-rate');
  setTimeout(() => inp.focus(), 100);
  modal.querySelectorAll('[data-rate-quick]').forEach(b => { b.onclick = () => { inp.value = b.dataset.rateQuick; }; });
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.querySelector('#r-cancel').onclick = close;
  const save = async () => {
    const rate = Math.max(0, +inp.value || 0);
    try {
      await api('/properties/rate', { method: 'POST', body: { property: prop, hourly_rate: rate } });
      toast(rate > 0 ? `Ставка сохранена: ${fmt(rate)} $/час` : 'Ставка сброшена');
      close();
      setTimeout(() => viewProperty(c), 150);
    } catch (e) { toast(e.message, true); }
  };
  modal.querySelector('#r-save').onclick = save;
  inp.onkeydown = (e) => { if (e.key === 'Enter') save(); };
}
function openPropertyPayModal(c, prop, info) {
  const meta = PROP_META[prop];
  const hourlyRate = info.hourly_rate || 0;
  const current = info.current;
  let remainingHours = 0;
  if (current) {
    const exp = new Date(current.expires_at.replace(' ', 'T') + 'Z').getTime();
    const now = Date.now();
    if (exp > now) remainingHours = (exp - now) / 3600000;
  }
  const MAX_HOURS = 31 * 24;
  const maxAddHours = Math.max(0, MAX_HOURS - remainingHours);
  let MODE = 'days';
  const modal = document.createElement('div');
  modal.className = 'modal-bg prop-pay-modal';
  modal.innerHTML = `
    <div class="modal">
      <h2>${meta.emoji} Оплата: ${meta.title}</h2>
      <div class="prop-pay-tabs">
        <button type="button" class="prop-pay-tab active" data-mode="days">📅 По дням</button>
        <button type="button" class="prop-pay-tab" data-mode="amount" ${!hourlyRate ? 'disabled title="Сначала задай почасовую ставку"' : ''}>💰 По сумме</button>
      </div>
      <div data-panel="days">
        <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">На сколько дней</label>
        <input id="p-days" type="number" min="1" value="${Math.max(1, Math.min(7, Math.floor(maxAddHours / 24) || 1))}" />
        <div class="prop-quick">
          ${[1, 3, 7, 14, 31].map(d => {
            const disabled = (d * 24) > maxAddHours || maxAddHours <= 0;
            return `<button type="button" class="prop-quick-btn" data-quick="${d}" ${disabled ? 'disabled style="opacity:.4;cursor:not-allowed"' : ''}>${d} дн.</button>`;
          }).join('')}
        </div>
      </div>
      <div data-panel="amount" style="display:none">
        <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Сумма оплаты $</label>
        <input id="p-amount-only" type="number" min="0" placeholder="0" />
        <div class="muted" style="font-size:12px;margin-top:8px;line-height:1.5">
          При ставке <b style="color:#c7d2fe">${fmt(hourlyRate)} $/час</b> — 1 день = <b style="color:#c7d2fe">${fmt(hourlyRate * 24)} $</b>
        </div>
      </div>
      <div class="prop-pay-preview" id="p-preview" style="margin-top:16px"></div>
      <div class="modal-actions">
        <button class="ghost" id="p-cancel">Отмена</button>
        <button id="p-save">💾 Оплатить</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
  const close = () => { modal.classList.remove('show'); setTimeout(() => modal.remove(), 250); };
  const daysInp = modal.querySelector('#p-days');
  const amountInp = modal.querySelector('#p-amount-only');
  const preview = modal.querySelector('#p-preview');
  const getRequestedHours = () => {
    if (MODE === 'days') { const d = +daysInp.value || 0; return Math.max(0, d * 24); }
    else { const amt = +amountInp.value || 0; if (!hourlyRate || amt <= 0) return 0; return amt / hourlyRate; }
  };
  const fmtH = (h) => {
    if (h >= 1) { const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return `${hh} ч${mm ? ' ' + mm + ' мин' : ''}`; }
    return `${Math.round(h * 60)} мин`;
  };
  const updatePreview = () => {
    if (maxAddHours <= 0) {
      preview.className = 'prop-pay-preview warn';
      preview.innerHTML = '⚠️ <b>Уже оплачено на 31 день</b> — максимум. Сначала дождись окончания оплаты.';
      return;
    }
    const requested = getRequestedHours();
    if (requested <= 0) {
      preview.className = 'prop-pay-preview';
      preview.textContent = MODE === 'days' ? 'Введи количество дней' : 'Введи сумму оплаты';
      return;
    }
    const effective = Math.min(requested, maxAddHours);
    const capped = effective < requested;
    const totalAfter = remainingHours + effective;
    const totalDays = Math.floor(totalAfter / 24);
    const totalRestH = Math.round(totalAfter - totalDays * 24);
    const baseDate = current && new Date(current.expires_at.replace(' ', 'T') + 'Z').getTime() > Date.now()
      ? new Date(current.expires_at.replace(' ', 'T') + 'Z') : new Date();
    const endDate = new Date(baseDate.getTime() + effective * 3600000);
    const endStr = endDate.toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (capped) {
      preview.className = 'prop-pay-preview warn';
      preview.innerHTML = `⚠️ Максимум 31 день — будет добавлено только <b>${fmtH(effective)}</b><br>
        До: <b>${endStr}</b> · Всего: <b>${totalDays} дн${totalRestH ? ' ' + totalRestH + ' ч' : ''}</b>`;
    } else {
      preview.className = 'prop-pay-preview info';
      preview.innerHTML = `✅ Будет добавлено: <b>${fmtH(effective)}</b><br>
        До: <b>${endStr}</b> · Всего: <b>${totalDays} дн${totalRestH ? ' ' + totalRestH + ' ч' : ''}</b>`;
    }
  };
  modal.querySelectorAll('.prop-pay-tab').forEach(tab => {
    tab.onclick = () => {
      if (tab.disabled) return;
      MODE = tab.dataset.mode;
      modal.querySelectorAll('.prop-pay-tab').forEach(t => t.classList.toggle('active', t === tab));
      modal.querySelector('[data-panel="days"]').style.display = MODE === 'days' ? 'block' : 'none';
      modal.querySelector('[data-panel="amount"]').style.display = MODE === 'amount' ? 'block' : 'none';
      updatePreview();
    };
  });
  modal.querySelectorAll('[data-quick]').forEach(b => {
    if (b.disabled) return;
    b.onclick = () => { daysInp.value = b.dataset.quick; updatePreview(); };
  });
  daysInp.oninput = updatePreview;
  amountInp.oninput = updatePreview;
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.querySelector('#p-cancel').onclick = close;
  const save = async () => {
    if (maxAddHours <= 0) return toast('Максимум 31 день. Сначала дождись окончания оплаты.', true);
    const requestedHours = getRequestedHours();
    if (requestedHours <= 0) return toast(MODE === 'days' ? 'Укажи количество дней' : 'Укажи сумму', true);
    const body = { property: prop };
    if (MODE === 'days') {
      body.days = +daysInp.value || 0;
      if (hourlyRate) body.amount = Math.round(requestedHours * hourlyRate);
    } else {
      body.byAmount = true;
      body.amount = +amountInp.value || 0;
    }
    try {
      const res = await api('/properties/pay', { method: 'POST', body });
      toast(res.capped ? `✅ ${meta.title} оплачен (с ограничением 31 день)` : `✅ ${meta.title} оплачен`);
      close();
      setTimeout(() => viewProperty(c), 150);
    } catch (e) { toast(e.message, true); }
  };
  modal.querySelector('#p-save').onclick = save;
  daysInp.onkeydown = (e) => { if (e.key === 'Enter') save(); };
  amountInp.onkeydown = (e) => { if (e.key === 'Enter') save(); };
  updatePreview();
  setTimeout(() => daysInp.focus(), 100);
}
function openPropertyBalanceModal(c, prop, info) {
  const meta = PROP_META[prop];
  const hourlyRate = info.hourly_rate || 0;
  if (!hourlyRate) {
    toast('Сначала задай почасовую ставку', true);
    return openPropertyRateModal(c, prop, 0);
  }
  const modal = document.createElement('div');
  modal.className = 'modal-bg prop-pay-modal';
  modal.innerHTML = `
    <div class="modal">
      <h2>${meta.emoji} Баланс: ${meta.title}</h2>
      <p class="muted" style="margin-bottom:16px;font-size:13px;line-height:1.55">
        Введи, сколько сейчас денег лежит на счёте ${meta.title === 'Дом' ? 'дома' : 'квартиры'}.
        Система посчитает, до какого числа оплачено, исходя из ставки
        <b style="color:#c7d2fe">${fmt(hourlyRate)} $/час</b> (1 день = ${fmt(hourlyRate * 24)} $).
        <br><br>
        <b style="color:#fca5a5">⚠️ Все прошлые оплаты будут заменены этой.</b>
      </p>
      <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Сумма на счёте, $</label>
      <input id="b-amount" type="number" min="0" value="${info.current && info.current.is_balance ? info.current.amount : ''}" placeholder="Например 4800" autofocus />
      <div class="prop-pay-preview info" id="b-preview" style="margin-top:16px"></div>
      <div class="modal-actions">
        <button class="ghost" id="b-cancel">Отмена</button>
        <button id="b-save">💾 Установить</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
  const close = () => { modal.classList.remove('show'); setTimeout(() => modal.remove(), 250); };
  const inp = modal.querySelector('#b-amount');
  const preview = modal.querySelector('#b-preview');
  const fmtH = (h) => {
    if (h >= 24) { const d = Math.floor(h / 24); const restH = Math.round(h - d * 24); return `${d} дн${restH ? ' ' + restH + ' ч' : ''}`; }
    if (h >= 1) { const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return `${hh} ч${mm ? ' ' + mm + ' мин' : ''}`; }
    return `${Math.round(h * 60)} мин`;
  };
  const updatePreview = () => {
    const amt = +inp.value || 0;
    if (amt <= 0) { preview.className = 'prop-pay-preview'; preview.textContent = 'Введи сумму'; return; }
    const requestedHours = amt / hourlyRate;
    const effective = Math.min(requestedHours, 31 * 24);
    const capped = effective < requestedHours;
    const now = new Date();
    const endDate = new Date(now.getTime() + effective * 3600000);
    const endStr = endDate.toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (capped) {
      preview.className = 'prop-pay-preview warn';
      preview.innerHTML = `⚠️ Максимум 31 день — будет учтено только <b>${fmtH(effective)}</b><br>Оплачено до: <b>${endStr}</b>`;
    } else {
      preview.className = 'prop-pay-preview info';
      preview.innerHTML = `✅ Это <b>${fmtH(effective)}</b><br>Оплачено до: <b>${endStr}</b>`;
    }
  };
  inp.oninput = updatePreview;
  setTimeout(() => inp.focus(), 100);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.querySelector('#b-cancel').onclick = close;
  const save = async () => {
    const amt = +inp.value || 0;
    if (amt <= 0) return toast('Укажи сумму', true);
    try {
      const res = await api('/properties/balance', { method: 'POST', body: { property: prop, amount: amt } });
      toast(res.capped ? `✅ ${meta.title}: баланс ${fmt(amt)} $ (ограничение 31 день)` : `✅ ${meta.title}: баланс ${fmt(amt)} $ установлен`);
      close();
      setTimeout(() => viewProperty(c), 150);
    } catch (e) { toast(e.message, true); }
  };
  modal.querySelector('#b-save').onclick = save;
  inp.onkeydown = (e) => { if (e.key === 'Enter') save(); };
  updatePreview();
}
async function viewProperty(c){
  const data = await api('/properties');
  const renderCard = (prop) => {
    const meta = PROP_META[prop];
    const info = data[prop];
    const cur = info.current;
    const rate = info.hourly_rate || 0;
    let status = 'none', statusLabel = 'Не оплачено', untilDate = '—', remaining = null;
    if (cur) {
      remaining = calcRemaining(cur.expires_at);
      const dt = new Date(cur.expires_at.replace(' ', 'T') + 'Z');
      untilDate = dt.toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      if (remaining.expired) { status = 'expired'; statusLabel = 'Просрочено'; }
      else { status = 'active'; statusLabel = 'Оплачено'; }
    }
    const rateHTML = `
      <div class="prop-rate">
        <span class="prop-rate-label">💵 Стоимость в час</span>
        <span class="prop-rate-right">
          <span class="prop-rate-val ${rate > 0 ? '' : 'unset'}">
            ${rate > 0 ? `<b>${fmt(rate)}</b><small>$/час</small>` : 'не задана'}
          </span>
          <button class="prop-rate-edit" data-rate="${prop}" title="Изменить ставку">✎</button>
        </span>
      </div>`;
    const countdown = remaining ? `
        <div class="prop-countdown">
          <div class="prop-cd-cell"><div class="prop-cd-num">${remaining.days}</div><div class="prop-cd-lbl">${plural(remaining.days, 'день', 'дня', 'дней')}</div></div>
          <div class="prop-cd-cell"><div class="prop-cd-num">${pad2(remaining.hours)}</div><div class="prop-cd-lbl">${plural(remaining.hours, 'час', 'часа', 'часов')}</div></div>
          <div class="prop-cd-cell"><div class="prop-cd-num">${pad2(remaining.minutes)}</div><div class="prop-cd-lbl">${plural(remaining.minutes, 'минута', 'минуты', 'минут')}</div></div>
        </div>`
      : `<div class="prop-countdown" style="opacity:.5">
          <div class="prop-cd-cell"><div class="prop-cd-num">—</div><div class="prop-cd-lbl">Дни</div></div>
          <div class="prop-cd-cell"><div class="prop-cd-num">—</div><div class="prop-cd-lbl">Часы</div></div>
          <div class="prop-cd-cell"><div class="prop-cd-num">—</div><div class="prop-cd-lbl">Минуты</div></div>
        </div>`;
    const isBalance = cur && cur.is_balance === 1;
    return `
      <div class="card prop-card ${prop} ${status === 'expired' ? 'expired' : ''}">
        <div class="prop-art">${meta.svg}</div>
        <div class="prop-body">
          <div class="prop-header">
            <div class="prop-title">${meta.emoji} ${meta.title}</div>
            <div style="display:flex;gap:6px;align-items:center">
              ${isBalance ? `<span class="prop-balance-badge">💰 Баланс</span>` : ''}
              <div class="prop-badge ${status}">${statusLabel}</div>
            </div>
          </div>
          ${rateHTML}
          <div class="prop-until">
            ${remaining && !remaining.expired ? 'Оплачено до:' : remaining && remaining.expired ? 'Было оплачено до:' : 'Оплата ещё не вносилась'}
            <b>${untilDate}</b>
          </div>
          ${countdown}
          <div class="prop-actions">
            <button class="prop-btn" data-pay="${prop}">${remaining && !remaining.expired ? '➕ Продлить' : '💳 Оплатить'}</button>
            <button class="prop-btn balance" data-balance="${prop}" title="Внести текущий баланс">💰 Баланс</button>
          </div>
        </div>
      </div>`;
  };
  const renderHistory = (prop) => {
    const meta = PROP_META[prop];
    const hist = data[prop].history;
    if (!hist.length) return `<div class="prop-empty"><span>${meta.emoji}</span>Пока не было оплат</div>`;
    return hist.map(h => {
      const paidAt = new Date(h.paid_at.replace(' ', 'T') + 'Z').toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const expAt = new Date(h.expires_at.replace(' ', 'T') + 'Z').toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const hours = h.hours || (h.days * 24);
      const dh = Math.floor(hours);
      const dm = Math.round((hours - dh) * 60);
      const durStr = dh >= 24 ? `${Math.floor(dh / 24)} дн${dh % 24 ? ' ' + (dh % 24) + ' ч' : ''}` : `${dh} ч${dm ? ' ' + dm + ' мин' : ''}`;
      const isBal = h.is_balance === 1;
      return `
        <div class="prop-history-row">
          <div class="prop-history-icon">${isBal ? '💰' : meta.emoji}</div>
          <div>
            <div>${isBal ? '💰 ' : ''}<b>${durStr}</b></div>
            <div class="prop-history-date">${isBal ? 'Баланс от' : 'Оплачено'} ${paidAt} · до ${expAt}</div>
          </div>
          <div class="prop-history-days">${durStr}</div>
          <div class="prop-history-amount">${h.amount ? '+' + fmt(h.amount) + ' $' : '—'}</div>
          <button class="prop-history-del" data-prop-del="${h.id}" title="Удалить">×</button>
        </div>`;
    }).join('');
  };
  c.innerHTML = `
    <h1>🏡 Дом и Квартира</h1>
    <div class="prop-grid">${renderCard('house')}${renderCard('apartment')}</div>
    <div class="card">
      <div class="prop-history-title">📜 История оплат — 🏡 Дом</div>
      <div>${renderHistory('house')}</div>
    </div>
    <div class="card">
      <div class="prop-history-title">📜 История оплат — 🏢 Квартира</div>
      <div>${renderHistory('apartment')}</div>
    </div>`;
  if (propertyTimerInterval) clearInterval(propertyTimerInterval);
  propertyTimerInterval = setInterval(() => {
    for (const prop of ['house', 'apartment']) {
      const cur = data[prop].current;
      if (!cur) continue;
      const card = c.querySelector(`.prop-card.${prop}`);
      if (!card) continue;
      const rem = calcRemaining(cur.expires_at);
      const cells = card.querySelectorAll('.prop-cd-num');
      if (cells.length === 3) {
        cells[0].textContent = rem.days;
        cells[1].textContent = pad2(rem.hours);
        cells[2].textContent = pad2(rem.minutes);
      }
      if (rem.expired) {
        card.classList.add('expired');
        const badge = card.querySelector('.prop-badge');
        if (badge && !badge.classList.contains('expired')) {
          badge.classList.remove('active');
          badge.classList.add('expired');
          badge.textContent = 'Просрочено';
        }
      }
    }
  }, 60000);
  c.querySelectorAll('[data-pay]').forEach(btn => {
    btn.onclick = () => openPropertyPayModal(c, btn.dataset.pay, data[btn.dataset.pay]);
  });
  c.querySelectorAll('[data-balance]').forEach(btn => {
    btn.onclick = () => openPropertyBalanceModal(c, btn.dataset.balance, data[btn.dataset.balance]);
  });
  c.querySelectorAll('[data-rate]').forEach(btn => {
    btn.onclick = () => {
      const prop = btn.dataset.rate;
      openPropertyRateModal(c, prop, data[prop].hourly_rate || 0);
    };
  });
  c.querySelectorAll('[data-prop-del]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Удалить эту запись об оплате?')) return;
      await api('/properties/payment/' + btn.dataset.propDel, { method: 'DELETE' });
      toast('Запись удалена');
      viewProperty(c);
    };
  });
}

/* ---------- РЫБАЛКА И СОКРОВИЩА ---------- */
const FISH_STORAGE_KEY = 'fishingStartedAt';
function getFishStartedAt() { const v = localStorage.getItem(FISH_STORAGE_KEY); return v ? parseInt(v, 10) : null; }
function setFishStartedAt(ts) { if (ts) localStorage.setItem(FISH_STORAGE_KEY, String(ts)); else localStorage.removeItem(FISH_STORAGE_KEY); }
function startFishTimer(ts) {
  if (fishingTimerInterval) clearInterval(fishingTimerInterval);
  const el = document.getElementById('fish-timer');
  if (!el) return;
  const update = () => {
    const now = Date.now();
    el.textContent = formatTimer(Math.floor((now - ts) / 1000));
  };
  update();
  fishingTimerInterval = setInterval(update, 1000);
}
function openFishSellModal(c, session) {
  const date = new Date(session.created_at + 'Z').toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const modal = document.createElement('div');
  modal.className = 'modal-bg fish-modal';
  modal.innerHTML = `
    <div class="modal">
      <h2>💰 Продажа улова</h2>
      <div class="fish-result-info">
        <div class="fish-result-cell"><div class="lbl">Длительность</div><div class="val">${formatTimer(session.duration_sec)}</div></div>
        <div class="fish-result-cell"><div class="lbl">Когда</div><div class="val" style="font-size:14px;line-height:1.3">${date}</div></div>
      </div>
      <div style="margin-bottom:14px">
        <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">🐟 Продал рыбу на $</label>
        <input id="f-fish" type="number" min="0" placeholder="0" autofocus />
      </div>
      <label class="fish-check" id="f-check-label">
        <input type="checkbox" id="f-with-treasure" />
        <span>💎 Добавить продажу сокровищ</span>
      </label>
      <div id="f-treasure-slot" style="display:none;margin-bottom:14px">
        <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">💎 Продал сокровищ на $</label>
        <input id="f-treasure" type="number" min="0" placeholder="0" />
      </div>
      <div style="margin-bottom:14px">
        <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Комментарий (необязательно)</label>
        <input id="f-note" placeholder="" value="${(session.note || '').replace(/"/g, '&quot;')}" />
      </div>
      <div class="modal-actions">
        <button class="ghost" id="f-cancel">Отмена</button>
        <button id="f-save">💾 Сохранить</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
  const close = () => { modal.classList.remove('show'); setTimeout(() => modal.remove(), 250); };
  const fishInput = modal.querySelector('#f-fish');
  const treasureInput = modal.querySelector('#f-treasure');
  const treasureSlot = modal.querySelector('#f-treasure-slot');
  const checkLabel = modal.querySelector('#f-check-label');
  const checkInput = modal.querySelector('#f-with-treasure');
  checkInput.addEventListener('change', () => {
    treasureSlot.style.display = checkInput.checked ? 'block' : 'none';
    checkLabel.classList.toggle('checked', checkInput.checked);
    if (checkInput.checked) setTimeout(() => treasureInput.focus(), 50);
  });
  setTimeout(() => fishInput.focus(), 100);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.querySelector('#f-cancel').onclick = close;
  const save = async () => {
    const fish = +fishInput.value || 0;
    const treasure = checkInput.checked ? (+treasureInput.value || 0) : 0;
    const note = modal.querySelector('#f-note').value.trim();
    if (fish <= 0 && treasure <= 0) return toast('Укажи хотя бы одну сумму', true);
    try {
      const res = await api('/fishing/sessions/' + session.id + '/sell', { method: 'PUT', body: { fish_amount: fish, treasure_amount: treasure, note } });
      toast(`Сохранено! Итого +${fmt(res.total)} $`);
      close();
      setTimeout(() => viewFishing(c), 150);
    } catch (e) { toast(e.message, true); }
  };
  modal.querySelector('#f-save').onclick = save;
  fishInput.onkeydown = (e) => { if (e.key === 'Enter') save(); };
  treasureInput.onkeydown = (e) => { if (e.key === 'Enter') save(); };
}
function openTreasureSellModal(c) {
  const modal = document.createElement('div');
  modal.className = 'modal-bg fish-modal';
  modal.innerHTML = `
    <div class="modal">
      <h2>💎 Продажа сокровищ</h2>
      <div style="margin-bottom:14px">
        <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Сумма за сокровища $</label>
        <input id="t-amount" type="number" min="0" placeholder="0" autofocus />
      </div>
      <div style="margin-bottom:14px">
        <label class="muted" style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Комментарий (необязательно)</label>
        <input id="t-note" placeholder="Например, продал коллекционеру" />
      </div>
      <div class="modal-actions">
        <button class="ghost" id="t-cancel">Отмена</button>
        <button id="t-save">💾 Сохранить</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
  const close = () => { modal.classList.remove('show'); setTimeout(() => modal.remove(), 250); };
  const inp = modal.querySelector('#t-amount');
  setTimeout(() => inp.focus(), 100);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.querySelector('#t-cancel').onclick = close;
  const save = async () => {
    const amount = +inp.value || 0;
    const note = modal.querySelector('#t-note').value.trim();
    if (amount <= 0) return toast('Укажи сумму', true);
    try {
      await api('/treasures', { method: 'POST', body: { amount, note } });
      toast(`💎 Сохранено: +${fmt(amount)} $`);
      close();
      setTimeout(() => viewFishing(c), 150);
    } catch (e) { toast(e.message, true); }
  };
  modal.querySelector('#t-save').onclick = save;
  inp.onkeydown = (e) => { if (e.key === 'Enter') save(); };
}
async function viewFishing(c) {
  const [sessions, treasures] = await Promise.all([api('/fishing/sessions'), api('/treasures')]);
  const startedAt = getFishStartedAt();
  const isActive = !!startedAt;
  const now = Date.now();
  const stat = { day: { amount: 0, cnt: 0, sec: 0 }, week: { amount: 0, cnt: 0, sec: 0 }, month: { amount: 0, cnt: 0, sec: 0 }, total: { amount: 0, cnt: 0, sec: 0 } };
  sessions.forEach(s => {
    const t = new Date(s.created_at + 'Z').getTime();
    const add = (b) => { b.amount += s.amount || 0; b.cnt += 1; b.sec += s.duration_sec || 0; };
    add(stat.total);
    if (now - t < 86400000) add(stat.day);
    if (now - t < 7 * 86400000) add(stat.week);
    if (now - t < 30 * 86400000) add(stat.month);
  });
  treasures.forEach(t => {
    const time = new Date(t.created_at + 'Z').getTime();
    const add = (b) => { b.amount += t.amount || 0; };
    add(stat.total);
    if (now - time < 86400000) add(stat.day);
    if (now - time < 7 * 86400000) add(stat.week);
    if (now - time < 30 * 86400000) add(stat.month);
  });
  const sessionsHTML = sessions.length
    ? sessions.slice(0, 100).map(s => {
        const date = new Date(s.created_at + 'Z').toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const sold = s.sold === 1;
        const fish = s.fish_amount || 0;
        const treas = s.treasure_amount || 0;
        const total = s.amount || 0;
        let titleHTML;
        if (sold) {
          if (treas > 0) titleHTML = `<span class="fish-part">🐟 ${fmt(fish)} $</span> + <span class="treasure-part">💎 ${fmt(treas)} $</span>`;
          else titleHTML = `<span class="fish-part">🐟 ${fmt(fish)} $</span>`;
        } else titleHTML = 'Рыбалка завершена · ждёт продажи';
        return `
          <div class="fish-history-row ${sold ? 'sold' : 'unsold'}">
            <div class="fish-history-icon">${sold ? '🐟' : '⏱'}</div>
            <div class="fish-history-main">
              <div class="fish-history-title">${titleHTML}</div>
              <div class="fish-history-date">${date} · ${formatHumanDuration(s.duration_sec)}${s.note ? ` · ${s.note}` : ''}</div>
            </div>
            <div class="fish-history-duration">⏱ ${formatTimer(s.duration_sec)}</div>
            ${sold ? `<div class="fish-history-amount">+${fmt(total)} $</div>` : `<button class="fish-sell-btn" data-fish-sell="${s.id}">💰 Продать рыбу</button>`}
            <button class="fish-history-del" data-fish-del="${s.id}" title="Удалить">×</button>
          </div>`;
      }).join('')
    : `<div class="fish-empty"><span>🎣</span>Пока не было рыбалок<br><span class="muted">Нажми «Начать рыбалку» чтобы запустить таймер</span></div>`;
  const treasuresHTML = treasures.length
    ? treasures.slice(0, 100).map(t => {
        const date = new Date(t.created_at + 'Z').toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `
          <div class="treasure-row">
            <div class="treasure-icon">💎</div>
            <div class="treasure-main">
              <div class="treasure-title">${t.note ? t.note : 'Продажа сокровищ'}</div>
              <div class="treasure-date">${date}</div>
            </div>
            <div class="treasure-amount">+${fmt(t.amount)} $</div>
            <button class="fish-history-del" data-treasure-del="${t.id}" title="Удалить">×</button>
          </div>`;
      }).join('')
    : `<div class="fish-empty"><span>💎</span>Пока не продавал сокровища<br><span class="muted">Нажми «Продать сокровища» чтобы записать</span></div>`;
  c.innerHTML = `
    <h1>🎣 Рыбалка и сокровища</h1>
    <div class="grid g4">
      <div class="stat"><div class="lbl">Сегодня</div><div class="num" data-num="${stat.day.amount}">0</div><div class="muted">${stat.day.cnt} сессий · ${formatTimer(stat.day.sec)}</div></div>
      <div class="stat"><div class="lbl">За неделю</div><div class="num" data-num="${stat.week.amount}">0</div><div class="muted">${stat.week.cnt} сессий · ${formatTimer(stat.week.sec)}</div></div>
      <div class="stat"><div class="lbl">За месяц</div><div class="num" data-num="${stat.month.amount}">0</div><div class="muted">${stat.month.cnt} сессий · ${formatTimer(stat.month.sec)}</div></div>
      <div class="stat"><div class="lbl">Всего</div><div class="num" data-num="${stat.total.amount}">0</div><div class="muted">${stat.total.cnt} сессий · ${formatTimer(stat.total.sec)}</div></div>
    </div>
    <div class="card fish-timer-card ${isActive ? 'active' : ''}" style="margin-top:16px">
      <div class="fish-timer-wrap">
        <div>
          <div class="fish-timer-label">Время рыбалки</div>
          <div class="fish-timer-display">
            <div class="fish-timer-clock" id="fish-timer">${isActive ? formatTimer(Math.floor((Date.now() - startedAt) / 1000)) : '00:00:00'}</div>
            <div class="fish-timer-state">
              <span class="dot"></span>
              ${isActive ? 'Идёт рыбалка' : 'Не активно'}
            </div>
          </div>
        </div>
        <div class="fish-timer-actions">
          ${isActive ? `<button id="fish-stop" class="fish-stop-btn">🛑 Закончить рыбалку</button>` : `<button id="fish-start" class="fish-start-btn">🎣 Начать рыбалку</button>`}
          <button id="fish-treasure-sell" class="fish-treasure-btn">💎 Продать сокровища</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0">📜 История рыбалок</h3>
        <span class="pill">${sessions.length}</span>
      </div>
      <div>${sessionsHTML}</div>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0">💎 Продажи сокровищ (без рыбалки)</h3>
        <span class="pill">${treasures.length}</span>
      </div>
      <div>${treasuresHTML}</div>
    </div>`;
  c.querySelectorAll('[data-num]').forEach(el => animateCount(el, +el.dataset.num));
  if (isActive) startFishTimer(startedAt);
  const startBtn = document.getElementById('fish-start');
  if (startBtn) {
    startBtn.onclick = () => {
      const ts = Date.now();
      setFishStartedAt(ts);
      toast('🐟 Рыбалка началась!');
      viewFishing(c);
    };
  }
  const stopBtn = document.getElementById('fish-stop');
  if (stopBtn) {
    stopBtn.onclick = async () => {
      const started = getFishStartedAt();
      if (!started) return;
      if (fishingTimerInterval) { clearInterval(fishingTimerInterval); fishingTimerInterval = null; }
      const endedAt = Date.now();
      const durationSec = Math.max(1, Math.floor((endedAt - started) / 1000));
      try {
        await api('/fishing/sessions', { method: 'POST', body: {
          started_at: new Date(started).toISOString().slice(0, 19).replace('T', ' '),
          ended_at: new Date(endedAt).toISOString().slice(0, 19).replace('T', ' '),
          duration_sec: durationSec, note: null
        }});
        toast(`⏱ Рыбалка завершена: ${formatTimer(durationSec)} · ждёт продажи`);
        setFishStartedAt(null);
        viewFishing(c);
      } catch (e) { toast(e.message, true); }
    };
  }
  const treasureBtn = document.getElementById('fish-treasure-sell');
  if (treasureBtn) treasureBtn.onclick = () => openTreasureSellModal(c);
  c.querySelectorAll('[data-fish-sell]').forEach(btn => {
    btn.onclick = () => {
      const id = +btn.dataset.fishSell;
      const s = sessions.find(x => x.id === id);
      if (s) openFishSellModal(c, s);
    };
  });
  c.querySelectorAll('[data-fish-del]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Удалить эту рыбалку?')) return;
      await api('/fishing/sessions/' + btn.dataset.fishDel, { method: 'DELETE' });
      toast('Запись удалена');
      viewFishing(c);
    };
  });
  c.querySelectorAll('[data-treasure-del]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Удалить эту продажу сокровищ?')) return;
      await api('/treasures/' + btn.dataset.treasureDel, { method: 'DELETE' });
      toast('Запись удалена');
      viewFishing(c);
    };
  });
}

/* ---------- BP ---------- */
const BP_TASKS = [
  { cat: 'single', label: '🎯 Одиночные', list: [
    { id: 's_online',    name: '3 часа в онлайне',                            base: 2, repeatable: true },
    { id: 's_build',     name: '25 действий на стройке',                      base: 2 },
    { id: 's_port',      name: '25 действий в порту',                         base: 2 },
    { id: 's_mine',      name: '25 действий в шахте',                         base: 2 },
    { id: 's_tyr',       name: 'Успешная тренировка в тире',                  base: 1 },
    { id: 's_studio',    name: 'Арендовать киностудию',                       base: 2 },
    { id: 's_lotto',     name: 'Купить лотерейный билет',                     base: 1 },
    { id: 's_video',     name: 'Добавить 5 видео в кинотеатре',               base: 1 },
    { id: 's_browser',   name: 'Посетить любой сайт в браузере',              base: 1 },
    { id: 's_brawl',     name: 'Зайти в любой канал в Brawl',                 base: 1 },
    { id: 's_basket',    name: 'Забросить 2 мяча в баскетболе',               base: 1 },
    { id: 's_football',  name: 'Забить 2 гола в футболе',                     base: 1 },
    { id: 's_darts',     name: 'Победить в дартс',                            base: 1 },
    { id: 's_voley',     name: 'Поиграть 1 минуту в волейбол',                base: 1 },
    { id: 's_pingpong',  name: 'Поиграть 1 минуту в настольный теннис',       base: 1 },
    { id: 's_tennis',    name: 'Поиграть 1 минуту в большой теннис',          base: 1 },
    { id: 's_quests',    name: 'Выполнить 2 квеста любых клубов',             base: 4 },
    { id: 's_metro',     name: 'Проехать 1 станцию на метро',                 base: 2 },
    { id: 's_petball',   name: 'Кинуть мяч питомцу 15 раз',                   base: 2 },
    { id: 's_petcmd',    name: '15 выполненных питомцем команд',              base: 2 },
    { id: 's_wheel',     name: 'Ставка в колесе удачи в казино',              base: 3 },
    { id: 's_zero',      name: 'Нули в казино',                               base: 2 },
    { id: 's_farm',      name: '10 действий на ферме',                        base: 1 },
    { id: 's_bus',       name: '2 круга на любом маршруте автобусника',       base: 2 },
    { id: 's_fish',      name: 'Поймать 20 рыб',                              base: 4 },
    { id: 's_truck',     name: 'Выполнить 3 заказа дальнобойщиком (кроме клубов)', base: 2 },
    { id: 's_skin',      name: '5 раз снять 100% шкуру с животных',           base: 2 },
    { id: 's_repair',    name: 'Починить деталь в автосервисе',               base: 1 },
    { id: 's_gym',       name: '20 подходов в тренажёрном зале',              base: 1 },
    { id: 's_post',      name: '10 посылок на почте',                         base: 1, progressive: true, target: 10 },
    { id: 's_match',     name: 'Поставить лайк любой анкете в Match',         base: 1 },
    { id: 's_case',      name: 'Прокрутить за DP серебряный, золотой или driver кейс', base: 10 },
    { id: 's_fire',      name: 'Потушить 25 «огоньков» пожарным',             base: 1 },
    { id: 's_treasure',  name: 'Выкопать 1 сокровище (не мусор)',             base: 1 },
    { id: 's_lease',     name: 'Сделать платёж по лизингу',                   base: 1 },
    { id: 's_green',     name: 'Посадить траву в теплице',                    base: 4 },
    { id: 's_lab',       name: 'Запустить переработку обезболивающих в лаборатории', base: 4 },
    { id: 's_air',       name: 'Принять участие в двух аирдропах',            base: 4 },
    { id: 's_material',  name: 'Заказ материалов для бизнеса вручную',        base: 1 },
    { id: 's_surgery',   name: 'Два раза оплатить смену внешности у хирурга в EMS', base: 2 },
  ]},
  { cat: 'pair', label: '👥 Парные', list: [
    { id: 'p_arm',      name: 'Победить в армрестлинге',                        base: 1 },
    { id: 'p_mafia',    name: 'Сыграть в мафию в казино',                      base: 3 },
    { id: 'p_kart',     name: 'Выиграть гонку в картинге',                     base: 1 },
    { id: 'p_street',   name: 'Проехать 1 уличную гонку (через телефон, ставка от 1000$)', base: 1 },
    { id: 'p_train',    name: 'Выиграть 5 игр в тренировочном комплексе со ставкой (от 100$)', base: 1 },
    { id: 'p_arena',    name: 'Выиграть 3 любых игры на арене со ставкой (от 100$)', base: 1 },
    { id: 'p_dance',    name: '3 победы в Дэнс Баттлах',                       base: 2 },
    { id: 'p_repair2',  name: 'Починить чужой автомобиль с прочностью детали ниже 90%', base: 2 },
  ]},
  { cat: 'faction', label: '🛡 Фракционные', list: [
    { id: 'f_graff',    name: '7 закрашенных граффити',                        base: 1 },
    { id: 'f_contra',   name: 'Сдать 5 контрабанды',                           base: 2 },
    { id: 'f_caps',     name: 'Участие в каптах / бизварах',                   base: 1 },
    { id: 'f_hammer',   name: 'Сдать Хаммер с ВЗХ',                            base: 3 },
    { id: 'f_medcard',  name: '5 выданных медкарт в EMS',                      base: 2 },
    { id: 'f_call',     name: 'Закрыть 15 вызовов в EMS',                      base: 2 },
    { id: 'f_wn',       name: 'Отредактировать 40 объявлений в WN',            base: 2 },
    { id: 'f_lock',     name: 'Взломать 15 замков на ограблениях домов или автоугонах', base: 2 },
    { id: 'f_code',     name: 'Закрыть 5 кодов в силовых структурах',          base: 2 },
    { id: 'f_reg',      name: 'Поставить на учёт 2 автомобиля (для LSPD)',     base: 1 },
    { id: 'f_arrest',   name: 'Произвести 1 арест в КПЗ',                      base: 1 },
    { id: 'f_bail',     name: 'Выкупить двух человек из КПЗ',                  base: 2 },
  ]}
];
const BP_MAP = {};
BP_TASKS.forEach(g => g.list.forEach(t => { BP_MAP[t.id] = { ...t, cat: g.cat }; }));
let BP_TAB = 'single';
const BP_DEFAULT_LAYOUT = {
  categories: [
    { id: 'single',  label: '🎯 Одиночные',    taskIds: BP_TASKS[0].list.map(t => t.id) },
    { id: 'pair',    label: '👥 Парные',       taskIds: BP_TASKS[1].list.map(t => t.id) },
    { id: 'faction', label: '🛡 Фракционные',  taskIds: BP_TASKS[2].list.map(t => t.id) },
  ]
};
function getBpDayStart() {
  const now = new Date();
  const cut = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4, 0, 0));
  if (now.getTime() < cut.getTime()) cut.setUTCDate(cut.getUTCDate() - 1);
  return cut;
}
function openBpManageModal(c, layout, onSave) {
  const draft = JSON.parse(JSON.stringify(layout));
  let DRAGGING_TASK_ID = null;
  const modal = document.createElement('div');
  modal.className = 'modal-bg bp-manage';
  const renderModalHTML = () => {
    const taskCat = {};
    draft.categories.forEach(cat => cat.taskIds.forEach(id => { taskCat[id] = cat.id; }));
    const allTasks = Object.values(BP_MAP);
    return `
      <div class="modal">
        <h2>⚙️ Настройка категорий BP</h2>
        <div class="bp-manage-hint"><b>Перетаскивай задания</b> мышкой в нужную категорию.</div>
        <div class="bp-manage-mobile-note">📱 На телефоне перетаскивание недоступно.</div>
        <h3 style="margin-bottom:10px">Категории (дропзоны)</h3>
        <div class="bp-cat-dropzones">
          ${draft.categories.map((cat, i) => `
            <div class="bp-cat-zone ${cat.taskIds.length === 0 ? 'empty' : ''}" data-cat-id="${cat.id}">
              <input type="text" class="bp-cat-name" data-index="${i}" value="${cat.label.replace(/"/g, '&quot;')}" maxlength="40" />
              <span class="cat-count">${cat.taskIds.length}</span>
              <button class="bp-cat-remove" data-remove-cat="${i}" ${draft.categories.length <= 1 ? 'disabled style="opacity:.35"' : ''} title="Удалить">×</button>
            </div>`).join('')}
        </div>
        <button class="ghost" id="m-add-cat" style="width:100%;justify-content:center;margin-bottom:4px">➕ Добавить категорию</button>
        <div class="bp-manage-divider">Все задания (${allTasks.length})</div>
        <div class="bp-tasks-chips">
          ${allTasks.map(t => {
            const catId = taskCat[t.id];
            const catObj = draft.categories.find(x => x.id === catId);
            const catLabel = catObj ? catObj.label : '—';
            return `
              <div class="bp-task-chip" draggable="true" data-task-id="${t.id}">
                <span class="drag-handle">⠿</span>
                <span class="task-name">${t.name}</span>
                <span class="cat-hint">${catLabel}</span>
              </div>`;
          }).join('')}
        </div>
        <div class="modal-actions" style="justify-content:space-between">
          <button class="ghost" id="m-reset">🔄 Сбросить категории</button>
          <div style="display:flex;gap:10px">
            <button class="ghost" id="m-cancel">Отмена</button>
            <button id="m-save">💾 Сохранить</button>
          </div>
        </div>
      </div>`;
  };
  modal.innerHTML = renderModalHTML();
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
  const close = () => { modal.classList.remove('show'); setTimeout(() => modal.remove(), 250); };
  const rebind = () => { modal.innerHTML = renderModalHTML(); bindEvents(); };
  const moveTaskTo = (taskId, catId) => {
    draft.categories.forEach(cat => { cat.taskIds = cat.taskIds.filter(x => x !== taskId); });
    const target = draft.categories.find(cat => cat.id === catId);
    if (target) target.taskIds.push(taskId);
  };
  const bindEvents = () => {
    modal.querySelectorAll('.bp-cat-name').forEach(inp => {
      inp.oninput = () => { draft.categories[+inp.dataset.index].label = inp.value; };
      inp.onkeydown = (e) => e.stopPropagation();
      inp.onmousedown = (e) => e.stopPropagation();
    });
    modal.querySelectorAll('[data-remove-cat]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (draft.categories.length <= 1) return;
        const idx = +btn.dataset.removeCat;
        const removed = draft.categories[idx];
        draft.categories.splice(idx, 1);
        if (draft.categories.length && removed.taskIds.length) {
          draft.categories[0].taskIds.push(...removed.taskIds);
          draft.categories[0].taskIds = [...new Set(draft.categories[0].taskIds)];
        }
        rebind();
      };
    });
    modal.querySelector('#m-add-cat').onclick = () => {
      draft.categories.push({ id: 'cat_' + Date.now(), label: '📁 Новая категория', taskIds: [] });
      rebind();
    };
    modal.querySelectorAll('.bp-task-chip').forEach(chip => {
      chip.addEventListener('dragstart', (e) => {
        DRAGGING_TASK_ID = chip.dataset.taskId;
        chip.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', DRAGGING_TASK_ID); } catch {}
      });
      chip.addEventListener('dragend', () => {
        chip.classList.remove('dragging');
        DRAGGING_TASK_ID = null;
        modal.querySelectorAll('.bp-cat-zone.dragover').forEach(z => z.classList.remove('dragover'));
      });
    });
    modal.querySelectorAll('.bp-cat-zone').forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!zone.classList.contains('dragover')) zone.classList.add('dragover');
      });
      zone.addEventListener('dragleave', (e) => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('dragover');
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const taskId = e.dataTransfer.getData('text/plain') || DRAGGING_TASK_ID;
        if (!taskId) return;
        moveTaskTo(taskId, zone.dataset.catId);
        rebind();
      });
    });
    modal.querySelector('#m-reset').onclick = () => {
      if (!confirm('Сбросить категории?')) return;
      draft.categories = JSON.parse(JSON.stringify(BP_DEFAULT_LAYOUT.categories));
      rebind();
    };
    modal.querySelector('#m-cancel').onclick = close;
    modal.querySelector('#m-save').onclick = async () => {
      const validIds = new Set(Object.keys(BP_MAP));
      draft.categories.forEach(cat => { cat.taskIds = cat.taskIds.filter(id => validIds.has(id)); });
      const placed = new Set();
      draft.categories.forEach(cat => cat.taskIds.forEach(id => placed.add(id)));
      Object.keys(BP_MAP).forEach(id => { if (!placed.has(id)) draft.categories[0].taskIds.push(id); });
      try {
        await api('/bp/layout', { method: 'POST', body: { layout: draft } });
        toast('Настройки сохранены ⚙️');
        close();
        BP_TAB = draft.categories[0].id;
        onSave(draft);
      } catch (e) { toast(e.message, true); }
    };
  };
  bindEvents();
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}
async function resetBpDay(c) {
  if (!confirm('Сбросить все BP за сегодня?')) return;
  try {
    const res = await api('/bp/reset-day', { method: 'POST' });
    toast(`Сброшено записей: ${res.deleted}`);
    viewBP(c);
  } catch (e) { toast(e.message, true); }
}
async function resetBpLayout(c) {
  if (!confirm('Сбросить настройки категорий?')) return;
  try {
    await api('/bp/layout', { method: 'DELETE' });
    BP_TAB = 'single';
    toast('Категории сброшены 🔄');
    viewBP(c);
  } catch (e) { toast(e.message, true); }
}
async function viewBP(c) {
  const [acts, baseRes, vipRes, layoutRes] = await Promise.all([
    api('/activities'), api('/bp/base'), api('/bp/vip'), api('/bp/layout'),
  ]);
  const baseBP = baseRes.amount || 0;
  let VIP = !!vipRes.vip;
  const now = Date.now();
  let layout = layoutRes.layout;
  if (!layout || !Array.isArray(layout.categories) || !layout.categories.length) {
    layout = JSON.parse(JSON.stringify(BP_DEFAULT_LAYOUT));
  }
  if (!layout.categories.find(cat => cat.id === BP_TAB)) BP_TAB = layout.categories[0].id;
  const bpActs = acts.filter(a => a.type === 'bp');
  const bpDayStart = getBpDayStart();
  const todayEntries = bpActs.filter(a => {
    const t = new Date(a.created_at.replace(' ', 'T') + 'Z').getTime();
    return t >= bpDayStart.getTime();
  });
  const todayByTask = {};
  todayEntries.forEach(a => {
    const tid = a.details?.taskId;
    if (!tid) return;
    todayByTask[tid] = todayByTask[tid] || [];
    todayByTask[tid].push(a);
  });
  const sums = { day: 0, week: 0, month: 0, total: 0 };
  bpActs.forEach(a => {
    const t = new Date(a.created_at.replace(' ', 'T') + 'Z').getTime();
    sums.total += a.amount;
    if (t >= bpDayStart.getTime()) sums.day += a.amount;
    if (now - t < 7  * 86400000) sums.week  += a.amount;
    if (now - t < 30 * 86400000) sums.month += a.amount;
  });
  const currentBalance = baseBP + sums.total;
  const taskState = (task) => {
    const arr = todayByTask[task.id] || [];
    if (task.progressive) {
      const progEntries = arr.filter(a => a.details?.progress);
      const progress = progEntries.length;
      const earned = progEntries.reduce((s, a) => s + a.amount, 0);
      return { progress, target: task.target, earned, done: progress >= task.target, count: progress };
    }
    const count = arr.length;
    const earned = arr.reduce((s, a) => s + a.amount, 0);
    return { count, earned, done: count > 0 && !task.repeatable };
  };
  const currentCat = layout.categories.find(cat => cat.id === BP_TAB) || layout.categories[0];
  const currentTasks = currentCat.taskIds.map(id => BP_MAP[id]).filter(Boolean);
  const nextReset = new Date(bpDayStart.getTime() + 24 * 3600 * 1000);
  const diffMs = nextReset.getTime() - now;
  const diffH = Math.floor(diffMs / 3600000);
  const diffM = Math.floor((diffMs % 3600000) / 60000);
  const resetIn = `${diffH}ч ${diffM}м`;
  c.innerHTML = `
    <h1>⚡ Bonus Point</h1>
    <div class="vip-banner ${VIP ? 'active' : ''}">
      <div class="vip-banner-text">
        <div class="vip-star">${VIP ? '⭐' : '☆'}</div>
        <div>
          <div class="vip-banner-title">${VIP ? 'VIP АКТИВЕН — ×2 к BP' : 'VIP не активирован'}</div>
          <div class="vip-banner-sub">${VIP ? 'Все награды за задания удваиваются' : 'Нажми, если у тебя есть VIP-статус'}</div>
        </div>
      </div>
      <button id="vip-btn" class="vip-toggle ${VIP ? 'active' : ''}">
        <span class="dot"></span>
        ${VIP ? 'VIP ВКЛ' : 'Включить VIP'}
      </button>
    </div>
    <div class="card bp-base">
      <div class="bp-base-grid">
        <div>
          <div class="bp-base-label">💰 Стартовый баланс BP</div>
          <div class="bp-base-value"><span>${fmt(baseBP)}</span> <small>BP</small></div>
          <div class="bp-base-hint">Введи, сколько BP у тебя сейчас на руках.</div>
        </div>
        <div class="bp-base-edit">
          <input id="base-input" type="number" placeholder="0" value="${baseBP}" />
          <button id="base-save">Сохранить</button>
        </div>
      </div>
    </div>
    <div class="grid g4" style="margin-top:16px">
      <div class="stat"><div class="lbl">Сегодня (с 7:00 МСК)</div><div class="num" data-num="${sums.day}">0</div><div class="muted">до сброса: ${resetIn}</div></div>
      <div class="stat"><div class="lbl">За неделю</div><div class="num" data-num="${sums.week}">0</div></div>
      <div class="stat"><div class="lbl">За месяц</div><div class="num" data-num="${sums.month}">0</div></div>
      <div class="stat"><div class="lbl">Текущий баланс</div><div class="num" data-num="${currentBalance}">0</div><div class="muted">стартовый + заработано</div></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>Ручной ввод</h3>
      <div class="form-row">
        <input id="bval" type="number" placeholder="Кол-во BP" />
        <input id="breason" placeholder="Комментарий" />
      </div>
      <button id="badd">Сохранить</button>
    </div>
    <div class="bp-toolbar">
      <div class="bp-tabs">
        ${layout.categories.map(cat => `
          <button class="bp-tab ${cat.id === BP_TAB ? 'active' : ''}" data-tab="${cat.id}">
            ${cat.label} <span style="opacity:.65;font-weight:600">· ${cat.taskIds.length}</span>
          </button>
        `).join('')}
      </div>
      <button id="bp-manage-btn" class="bp-ctrl-btn">⚙️ Настроить</button>
      <button id="bp-reset-layout-btn" class="bp-ctrl-btn">🔄 Сброс категорий</button>
      <button id="bp-reset-day-btn" class="bp-ctrl-btn danger">🗑 Сбросить день</button>
    </div>
    <div class="bp-reset-day-info" style="margin-bottom:16px">
      ⏰ Автосброс каждый день в <b>7:00 МСК</b> · До сброса: <b>${resetIn}</b>
    </div>
    <div class="bp-grid ${VIP ? 'vip-on' : ''}">
      ${currentTasks.length ? currentTasks.map(task => {
        const st = taskState(task);
        const reward = VIP ? task.base * 2 : task.base;
        const locked = st.done && !task.repeatable && !task.progressive;
        const hasEntries = task.progressive ? st.progress > 0 : st.count > 0;
        let progressHTML = '';
        if (task.progressive) {
          const pct = Math.min(100, (st.progress / st.target) * 100);
          progressHTML = `
            <div>
              <div class="bp-progress-text">
                <span>Посылок сдано</span>
                <span><b>${st.progress}</b> / ${st.target}</span>
              </div>
              <div class="bp-progress"><div class="bp-progress-fill" style="width:${pct}%"></div></div>
            </div>`;
        }
        let mainBtn = '';
        if (task.progressive && !st.done) {
          mainBtn = `<button class="bp-mini bp-step" data-act="step" data-task="${task.id}">📦 +1 посылка</button>`;
        } else if (task.progressive && st.done) {
          mainBtn = `<button class="bp-mini bp-add" disabled>✅ Выполнено</button>`;
        } else if (task.repeatable) {
          mainBtn = `<button class="bp-mini bp-add" data-act="add" data-task="${task.id}">+${reward} BP</button>`;
        } else if (st.done) {
          mainBtn = `<button class="bp-mini bp-add" disabled>✅ Выполнено</button>`;
        } else {
          mainBtn = `<button class="bp-mini bp-add" data-act="add" data-task="${task.id}">+${reward} BP</button>`;
        }
        const minusBtn = `<button class="bp-mini bp-minus" data-act="minus" data-task="${task.id}" ${hasEntries ? '' : 'disabled'}>−</button>`;
        return `
          <div class="bp-card ${st.done ? 'done' : ''} ${locked ? 'locked' : ''}">
            <div class="bp-inner">
              <div class="bp-card-head">
                <div class="bp-card-name">${task.name}</div>
                ${st.done && !task.progressive ? `<div class="bp-done-stamp">✓ Готово</div>` : ''}
                ${st.count && !st.done && !task.progressive ? `<div class="bp-card-badge">${st.count}×</div>` : ''}
              </div>
              <div class="bp-card-chips">
                <span class="chip chip-base">+${reward} BP</span>
                ${VIP ? `<span class="chip chip-vip">⭐ VIP ×2</span>` : ''}
                ${task.repeatable ? `<span class="chip" style="background:rgba(52,211,153,.16);color:#6ee7b7;box-shadow:inset 0 0 0 1px rgba(52,211,153,.35)">↻ повторяемое</span>` : ''}
              </div>
              ${progressHTML}
              ${st.earned ? `<div class="bp-card-earned">Заработано сегодня: <b>${st.earned} BP</b></div>` : ''}
              <div class="bp-card-actions">${minusBtn}${mainBtn}</div>
            </div>
          </div>`;
      }).join('') : '<p class="muted" style="grid-column:1/-1;text-align:center;padding:30px">В этой категории нет заданий.</p>'}
    </div>`;
  c.querySelectorAll('[data-num]').forEach(el => animateCount(el, +el.dataset.num));
  document.getElementById('vip-btn').onclick = async () => {
    const newVip = !VIP;
    await api('/bp/vip', { method: 'POST', body: { vip: newVip } });
    VIP = newVip;
    toast(newVip ? '⭐ VIP активирован' : 'VIP выключен');
    viewBP(c);
  };
  document.getElementById('base-save').onclick = async () => {
    const val = +document.getElementById('base-input').value || 0;
    await api('/bp/base', { method: 'POST', body: { amount: val } });
    toast(`Стартовый BP: ${fmt(val)}`);
    viewBP(c);
  };
  document.getElementById('bp-reset-day-btn').onclick = () => resetBpDay(c);
  document.getElementById('bp-reset-layout-btn').onclick = () => resetBpLayout(c);
  document.getElementById('bp-manage-btn').onclick = () => {
    openBpManageModal(c, layout, (newLayout) => { layout = newLayout; viewBP(c); });
  };
  c.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = () => { BP_TAB = btn.dataset.tab; viewBP(c); };
  });
  document.getElementById('badd').onclick = async () => {
    const val = +document.getElementById('bval').value || 0;
    const reason = document.getElementById('breason').value;
    if (!val) return toast('Укажите количество', true);
    await api('/activities', { method: 'POST', body: { type: 'bp', amount: val, details: { reason } } });
    toast('Сохранено');
    viewBP(c);
  };
  c.querySelectorAll('.bp-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - .5) * 2;
      const y = ((e.clientY - r.top) / r.height - .5) * 2;
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      card.style.transform = `translateY(-8px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) scale(1.025)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
  c.querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = async () => {
      if (btn.disabled) return;
      const act = btn.dataset.act;
      const tid = btn.dataset.task;
      const task = BP_MAP[tid];
      if (!task) return;
      const reward = VIP ? task.base * 2 : task.base;
      if (act === 'add') {
        await api('/activities', {
          method: 'POST',
          body: { type: 'bp', amount: reward, details: { taskId: tid, taskName: task.name, vip: VIP, mult: VIP ? 2 : 1 } }
        });
        toast(`+${reward} BP${VIP ? ' (VIP ×2)' : ''}`);
      } else if (act === 'step') {
        const arr = todayByTask[tid] || [];
        const progressEntries = arr.filter(a => a.details?.progress);
        const currentProgress = progressEntries.length;
        const nextStep = currentProgress + 1;
        const isFinal = nextStep >= task.target;
        await api('/activities', {
          method: 'POST',
          body: {
            type: 'bp',
            amount: isFinal ? reward : 0,
            details: { taskId: tid, taskName: task.name, progress: true, step: nextStep, completed: isFinal, vip: VIP, mult: isFinal ? (VIP ? 2 : 1) : 0 }
          }
        });
        toast(isFinal ? `📦 ${task.target}/${task.target} — выполнено! +${reward} BP` : `📦 ${nextStep}/${task.target}`);
      } else if (act === 'minus') {
        const arr = todayByTask[tid] || [];
        if (!arr.length) return;
        const last = arr.slice().sort((a, b) => b.id - a.id)[0];
        await api('/activities/' + last.id, { method: 'DELETE' });
        const label = last.details?.progress && !last.details?.completed ? `шаг отменён` : `−${last.amount} BP`;
        toast(`Отменено: ${label}`);
      }
      viewBP(c);
    };
  });
}

/* ---------- АДМИН ---------- */
async function viewAdmin(c) {
  const [users, stats] = await Promise.all([api('/admin/users'), api('/stats/all')]);

  const pending = users.filter(u => u.approved === 0);
  const active = users.filter(u => u.approved === 1 && u.id !== ME.id);
  const me = users.find(u => u.id === ME.id);

  const renderUserRow = (u) => {
    const isSelf = u.id === ME.id;
    const isAdmin = u.role === 'admin';
    const status = u.approved ? 'approved' : 'revoked';
    const statusLabel = u.approved ? 'Доступ есть' : 'Доступ закрыт';
    return `
      <div class="user-row ${u.approved ? '' : 'revoked'}">
        <img class="user-avatar" src="${getAvatar(u, 128)}" alt="" />
        <div class="user-info">
          <div class="user-name">
            ${u.username}
            ${isSelf ? '<span class="muted" style="font-size:11px">(вы)</span>' : ''}
            <span class="badge ${u.role}">${isAdmin ? 'Админ' : 'Семья'}</span>
            <span class="status-badge ${status}">${statusLabel}</span>
          </div>
          <div class="user-meta">
            В системе с ${new Date(u.created_at + 'Z').toLocaleDateString('ru-RU')}
          </div>
        </div>
        <div class="user-actions">
          ${!u.approved ? `
            <button class="usr-btn approve" data-action="approve" data-id="${u.id}">✅ Одобрить</button>
          ` : ''}
          ${u.approved && !isSelf && !isAdmin ? `
            <button class="usr-btn revoke" data-action="revoke" data-id="${u.id}">🚫 Снять доступ</button>
          ` : ''}
          ${!isAdmin && u.approved ? `
            <button class="usr-btn promote" data-action="promote" data-id="${u.id}">👑 Сделать админом</button>
          ` : ''}
          ${isAdmin && !isSelf ? `
            <button class="usr-btn ghost" data-action="demote" data-id="${u.id}">⬇ Разжаловать</button>
          ` : ''}
          ${!isSelf ? `
            <button class="usr-btn revoke" data-action="delete" data-id="${u.id}" title="Удалить навсегда">🗑</button>
          ` : ''}
        </div>
      </div>`;
  };

  c.innerHTML = `
    <h1>🛡 Админ-панель</h1>

    <div class="card">
      <div class="admin-section-title">
        ⏳ Ожидают подтверждения
        <span class="count">${pending.length}</span>
      </div>
      ${pending.length
        ? pending.map(u => `
          <div class="user-row pending">
            <img class="user-avatar" src="${getAvatar(u, 128)}" alt="" />
            <div class="user-info">
              <div class="user-name">
                ${u.username}
                <span class="status-badge pending">Заявка</span>
              </div>
              <div class="user-meta">Зарегистрировался ${new Date(u.created_at + 'Z').toLocaleString('ru-RU')}</div>
            </div>
            <div class="user-actions">
              <button class="usr-btn approve" data-action="approve" data-id="${u.id}">✅ Одобрить</button>
              <button class="usr-btn revoke" data-action="delete" data-id="${u.id}">🗑 Отклонить</button>
            </div>
          </div>`).join('')
        : '<div class="usr-empty"><span>✨</span>Нет новых заявок</div>'}
    </div>

    <div class="card">
      <div class="admin-section-title">
        👥 Все пользователи
        <span class="count">${users.length}</span>
      </div>
      ${users.length
        ? users.filter(u => u.id !== ME.id).map(u => renderUserRow(u)).join('')
        : '<div class="usr-empty"><span>👥</span>Нет пользователей</div>'}
    </div>

    <div class="card">
      <div class="admin-section-title">📊 Общая статистика</div>
      <table>
        <tr><th>Игрок</th><th>Роль</th><th>Сегодня</th><th>Всего</th></tr>
        ${stats.map(d => {
          const sum = arr => arr.reduce((a, b) => a + b.total, 0);
          return `<tr>
            <td><div class="row" style="gap:10px">
              <img class="avatar sm" src="${getAvatar(d.user, 64)}" alt="" />
              <b>${d.user.username}</b>
            </div></td>
            <td><span class="badge ${d.user.role}">${d.user.role}</span></td>
            <td>${fmt(sum(d.day))}</td>
            <td>${fmt(sum(d.total))}</td>
          </tr>`;
        }).join('')}
      </table>
    </div>`;

  c.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = async () => {
      const id = +btn.dataset.id;
      const action = btn.dataset.action;
      const u = users.find(x => x.id === id);

      if (action === 'delete') {
        if (!confirm(`Удалить пользователя «${u?.username}»? Все его данные будут удалены навсегда.`)) return;
        try {
          await api('/admin/users/' + id, { method: 'DELETE' });
          toast('Пользователь удалён');
          viewAdmin(c);
        } catch (e) { toast(e.message, true); }
        return;
      }
      if (action === 'revoke') {
        if (!confirm(`Снять доступ к сайту с «${u?.username}»? Он не сможет войти.`)) return;
      }
      if (action === 'promote') {
        if (!confirm(`Сделать «${u?.username}» администратором?`)) return;
      }
      if (action === 'demote') {
        if (!confirm(`Разжаловать «${u?.username}» в обычного участника?`)) return;
      }

      try {
        await api('/admin/users/' + id + '/' + action, { method: 'POST' });
        const labels = { approve: 'Одобрено ✅', revoke: 'Доступ закрыт', promote: 'Назначен админом 👑', demote: 'Разжалован' };
        toast(labels[action] || 'Готово');
        viewAdmin(c);
      } catch (e) { toast(e.message, true); }
    };
  });
}

/* ---------- Роутер ---------- */
const VIEWS = {
  profile: viewProfile,
  dashboard: viewDashboard, events: viewEvents, lottery: viewLottery,
  members: viewMembers, rules: viewRules, about: viewAbout,
  resell: viewResell, rental: viewRental, property: viewProperty,
  fishing: viewFishing, bp: viewBP, admin: viewAdmin,
};

/* ---------- Старт ---------- */
(async () => {
  try {
    const { user } = await api('/me');
    ME = user; await renderApp();
  } catch { renderAuth(); }
})();
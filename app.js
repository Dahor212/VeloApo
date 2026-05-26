// ════════════════════════════════════════════════
//  VeloTimer v3 — app.js
// ════════════════════════════════════════════════

// ── WALLPAPERS ───────────────────────────────────
const WALLPAPERS = [
  { id: 'wall1', file: 'img/wall1-sunset-mountain.webp', label: 'Hory · západ slunce' },
  { id: 'wall2', file: 'img/wall2-blue-lake.webp',       label: 'Modré jezero' },
  { id: 'wall3', file: 'img/wall3-lake-church.webp',     label: 'Jezero · kostel' },
  { id: 'wall4', file: 'img/wall4-bike-meadow.webp',     label: 'Květiny v horách' },
  { id: 'wall5', file: 'img/wall5-tuscany.webp',         label: 'Toskánsko' },
  { id: 'wall6', file: 'img/wall6-bike-fence.webp',      label: 'Idylka u plotu' },
  { id: 'wall7', file: 'img/wall7-plains-road.webp',     label: 'Nekonečná silnice' },
  { id: 'wall8', file: 'img/wall8-alpine-snow.webp',     label: 'Alpské velikány' }
];
const DEFAULT_WALL = 'wall1';
const STRAVA_WORKER_URL = 'https://veloapo-strava.dahor212.workers.dev';
function wallpaperUrl(id) {
  return (WALLPAPERS.find(w => w.id === id) || WALLPAPERS[0]).file;
}

// ── DATA ─────────────────────────────────────────
let routes = JSON.parse(localStorage.getItem('vt_routes') || '[]');

// ── SETTINGS ──────────────────────────────────────
let appSettings = JSON.parse(localStorage.getItem('vt_settings') || JSON.stringify({
  units: 'km',
  nightMode: false,
  nightRed: false,
  ftp: 250,
  maxHr: 190,
  weight: 75,
  themeColor: 'blue',
  lightMode: false,
  voiceAnnouncements: false,
  monthlyGoalKm: 200,
}));

// ── BIKES / EQUIPMENT ─────────────────────────────
let bikes = JSON.parse(localStorage.getItem('vt_bikes') || '[]');
// Bike: { id, name, brand, model, color, totalKm, components: [{name, intervalKm, warnAt, currentKm}] }

// ── TRAINING ──────────────────────────────────────
let workouts = JSON.parse(localStorage.getItem('vt_workouts') || JSON.stringify([
  { id:'w1', name:'Endurance', icon:'🚴', segments:[{type:'warmup',min:15,pct:60},{type:'steady',min:60,pct:75},{type:'cooldown',min:10,pct:55}] },
  { id:'w2', name:'Tempo intervals', icon:'⚡', segments:[{type:'warmup',min:15,pct:60},{type:'on',min:8,pct:90},{type:'off',min:4,pct:55},{type:'on',min:8,pct:90},{type:'off',min:4,pct:55},{type:'on',min:8,pct:90},{type:'cooldown',min:10,pct:55}] },
  { id:'w3', name:'VO2 max', icon:'🔥', segments:[{type:'warmup',min:20,pct:60},{type:'on',min:4,pct:110},{type:'off',min:4,pct:50},{type:'on',min:4,pct:110},{type:'off',min:4,pct:50},{type:'on',min:4,pct:110},{type:'cooldown',min:15,pct:55}] },
  { id:'w4', name:'Recovery', icon:'💤', segments:[{type:'easy',min:45,pct:55}] },
]));

let trainingPlan = JSON.parse(localStorage.getItem('vt_training') || '[]');
// Plan entry: { id, date(YYYY-MM-DD), routeIdx, workoutId, notes, completed, actualMs }

function saveBikes()    { localStorage.setItem('vt_bikes', JSON.stringify(bikes)); }
function saveWorkouts() { localStorage.setItem('vt_workouts', JSON.stringify(workouts)); }
function saveTraining() { localStorage.setItem('vt_training', JSON.stringify(trainingPlan)); }
function saveSettings() {
  localStorage.setItem('vt_settings', JSON.stringify(appSettings));
  applySettings();
}
let editIdx = null;
let viewIdx = null;
let gpxTemp = null;
let curScreen = 'home';
let statsPeriod = 'all';
let selectedWallpaper = DEFAULT_WALL;
let selectedWallpaperGPX = DEFAULT_WALL;
let navStack = [];   // navigation history for goBack()
let sortMode  = 'default'; // 'default' | 'name' | 'dist' | 'rides'
let stravaConnected = false;
let goals = JSON.parse(localStorage.getItem('vt_goals') || '[]');
let achievements = JSON.parse(localStorage.getItem('vt_achievements') || '[]');
// achievement: { id, earnedAt }
let stravaCreatorActivity = null;

// ── ACHIEVEMENT DEFINITIONS ────────────────────────
const ACHIEVEMENT_DEFS = [
  { id:'first_ride',  icon:'🎉', name:'První jízda',     desc:'Dokonči první jízdu' },
  { id:'km_100',      icon:'💯', name:'100 km celkem',   desc:'Najeď celkem 100 km' },
  { id:'km_500',      icon:'🚀', name:'500 km celkem',   desc:'Najeď celkem 500 km' },
  { id:'km_1000',     icon:'🌍', name:'1000 km!',        desc:'Najeď celkem 1000 km' },
  { id:'rides_10',    icon:'🔟', name:'10 jízd',         desc:'Absolvuj 10 jízd' },
  { id:'rides_50',    icon:'⭐', name:'50 jízd',         desc:'Absolvuj 50 jízd' },
  { id:'pb_new',      icon:'🏆', name:'Nový rekord',     desc:'Překonej osobní rekord' },
  { id:'streak_4w',   icon:'🔥', name:'4 týdny v řadě',  desc:'Jeď 4 týdny za sebou' },
  { id:'early_bird',  icon:'🌅', name:'Ranní ptáče',     desc:'Dokonči jízdu před 7:00' },
  { id:'night_rider', icon:'🌙', name:'Noční jezdec',    desc:'Dokonči jízdu po 22:00' },
  { id:'routes_5',    icon:'🗺️', name:'5 tras',          desc:'Vytvoř 5 různých tras' },
];  // activity being imported as new route
let ghostPbMs = 0;  // PB time for ghost comparison

// ── RIDE STATE ────────────────────────────────────
let rs = {
  running: false, startTs: null, elapsed: 0,
  cps: [], cpIdx: 0, finished: false,
  prevPos: null,       // for legacy compatibility
  _tvLastUpdate: -1    // throttle TV board updates
};
let rafId = null;

// ── FEATURE E: Motivational messages state ────────
let _motiLastState = null;
let _motiLastPct = 0;

// ── FEATURE G: Race mode state ────────────────────
let _raceModeForced = false;

// ════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════
function showScreen(name) {
  curScreen = name;
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active', 'slide-in');
  });
  const el = document.getElementById('screen-' + name);
  el.classList.add('active');
  // Trigger slide-in animation (reflow trick)
  void el.offsetWidth;
  el.classList.add('slide-in');
  updateBackground();
  // mark drawer item (splash counts as home for highlighting)
  const activeNav = name === 'splash' ? 'home' : name;
  ['home','stats','add'].forEach(n => {
    const el = document.getElementById('nav-' + n);
    if (el) el.classList.toggle('active', n === activeNav);
  });
}

function navTo(name, clearStack) {
  if (clearStack || name === 'home' || name === 'splash') {
    navStack = [];
  } else if (curScreen && curScreen !== name) {
    navStack.push(curScreen);
  }
  closeDrawer();
  if (name === 'splash') renderSplash();
  if (name === 'home')   renderHome();
  if (name === 'detail') renderDetail();
  if (name === 'add')    initAddScreen();
  if (name === 'stats')    renderStats();
  if (name === 'strava')   renderStravaScreen();
  if (name === 'settings') { renderSettings(); }
  if (name === 'garage')   { renderGarage(); }
  if (name === 'training') { showTrainingTab('calendar'); }
  // strava-creator: no extra render needed, openStravaRouteCreator sets up the screen
  showScreen(name);
  updateSidebar();
}

function renderSplash() {
  const stats = computeAggregateStats('all');
  const ridesEl = document.getElementById('spl-rides');
  const kmEl    = document.getElementById('spl-km');
  const routEl  = document.getElementById('spl-routes');
  if (ridesEl) ridesEl.textContent = stats.totalRides;
  if (kmEl)    kmEl.textContent    = stats.totalKm.toFixed(0);
  if (routEl)  routEl.textContent  = routes.length;
}

function goBack() {
  const prev = navStack.pop();
  if (!prev || prev === curScreen) { navTo('home', true); return; }
  // Navigate back without pushing to stack
  closeDrawer();
  if (prev === 'splash') { renderSplash(); showScreen('splash'); }
  if (prev === 'home')   { renderHome();   showScreen('home'); }
  if (prev === 'detail') { renderDetail(); showScreen('detail'); }
  if (prev === 'stats')  { renderStats();  showScreen('stats'); }
  if (prev === 'add')    { initAddScreen(); showScreen('add'); }
  if (prev === 'strava') { renderStravaScreen(); showScreen('strava'); }
  if (prev === 'strava-creator') { showScreen('strava-creator'); }
  if (prev === 'settings') { renderSettings(); showScreen('settings'); }
  if (prev === 'garage')   { renderGarage(); showScreen('garage'); }
  if (prev === 'training') { showTrainingTab('calendar'); showScreen('training'); }
  updateSidebar();
}

function updateBackground() {
  const bg = document.getElementById('app-bg');
  let wall = DEFAULT_WALL;

  if ((curScreen === 'detail' || curScreen === 'ride' || curScreen === 'results') && viewIdx !== null && routes[viewIdx]) {
    wall = routes[viewIdx].wallpaper || DEFAULT_WALL;
  } else if (curScreen === 'splash' || curScreen === 'home') {
    wall = 'wall7';   // plains road
  } else if (curScreen === 'stats') {
    wall = 'wall6';   // pastoral
  } else if (curScreen === 'add') {
    wall = 'wall4';   // meadow
  } else if (curScreen === 'garage') {
    wall = 'wall4';
  } else if (curScreen === 'training') {
    wall = 'wall7';
  } else if (curScreen === 'settings') {
    wall = 'wall6';
  }
  bg.style.backgroundImage = `url(${wallpaperUrl(wall)})`;
  // Screen-specific overlay class
  if (curScreen === 'stats') bg.className = 'bg-stats';
  else if (curScreen === 'splash') bg.className = 'bg-splash';
  else bg.className = '';
}

// ── DRAWER ─────────────────────────────────────────
function openDrawer() {
  // Populate mini stats
  const stats = computeAggregateStats('all');
  document.getElementById('dm-rides').textContent = stats.totalRides + ' jízd';
  document.getElementById('dm-km').textContent = stats.totalKm.toFixed(0) + ' km';
  // Last ride date
  const lastRide = stats.allRides[0];
  const lastEl = document.getElementById('drawer-last-ride');
  if (lastRide) {
    const d = new Date(lastRide.date).toLocaleDateString('cs-CZ',{day:'2-digit',month:'2-digit',year:'numeric'});
    lastEl.textContent = 'Poslední jízda: ' + d;
  } else {
    lastEl.textContent = '';
  }
  // Hero image: use wallpaper of last ridden route, else wall7
  const heroWall = lastRide?.route?.wallpaper || 'wall7';
  document.getElementById('drawer-hero-img').style.backgroundImage = `url(${wallpaperUrl(heroWall)})`;

  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawer-ov').classList.add('open');
}
function closeDrawer() { document.getElementById('drawer').classList.remove('open'); document.getElementById('drawer-ov').classList.remove('open'); }

// ════════════════════════════════════════════════
//  HOME
// ════════════════════════════════════════════════
function renderHome() {
  // Greeting based on time of day
  const h = new Date().getHours();
  const g = h<5?'Dobrou noc':h<12?'Dobré ráno':h<18?'Dobrý den':'Dobrý večer';
  document.getElementById('home-greet').textContent = g;

  // Date in hero
  const dateEl = document.getElementById('home-hero-date');
  if (dateEl) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
    // Capitalize first letter
    dateEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  }

  // Quick stats
  const stats = computeAggregateStats('all');
  document.getElementById('home-quick').innerHTML = `
    <div class="qs-card">
      <div class="qs-ico">🚴</div>
      <div class="qs-val">${stats.totalRides}</div>
      <div class="qs-lbl">jízd</div>
    </div>
    <div class="qs-card">
      <div class="qs-ico">📏</div>
      <div class="qs-val">${stats.totalKm.toFixed(0)}</div>
      <div class="qs-lbl">km celkem</div>
    </div>
    <div class="qs-card">
      <div class="qs-ico">⏱</div>
      <div class="qs-val">${fmtDuration(stats.totalMs)}</div>
      <div class="qs-lbl">na kole</div>
    </div>`;

  // C: Streak banner
  const streak = computeStreak();
  const streakBannerEl = document.getElementById('home-streak-banner');
  if (streakBannerEl) {
    if (streak >= 2) {
      streakBannerEl.innerHTML = `
        <div class="streak-banner">
          <div class="streak-fire">🔥</div>
          <div class="streak-text">
            <div class="streak-num">${streak} ${streak === 1 ? 'týden' : streak < 5 ? 'týdny' : 'týdnů'} v řadě!</div>
            <div class="streak-label">Pokračuj v jízdách, skvělá série!</div>
          </div>
        </div>`;
      streakBannerEl.style.display = 'block';
    } else {
      streakBannerEl.style.display = 'none';
    }
  }

  // B: Quick-start button (last used route)
  const lastRouteIdx = parseInt(localStorage.getItem('vt_last_route_idx') || '-1', 10);
  const qsIdx = (lastRouteIdx >= 0 && lastRouteIdx < routes.length) ? lastRouteIdx : (routes.length > 0 ? 0 : -1);
  const qsEl = document.getElementById('home-quickstart');
  if (qsEl) {
    if (qsIdx >= 0) {
      const qsRoute = routes[qsIdx];
      const qsDist  = qsRoute.totalDist ? qsRoute.totalDist.toFixed(1) : '—';
      const qsPB    = qsRoute.records?.length ? fmtTime(qsRoute.records[0].totalMs) : 'žádný čas';
      qsEl.innerHTML = `
        <div class="qs-start-btn" onclick="viewIdx=${qsIdx};startRide()">
          <div class="qs-start-icon">🚴</div>
          <div class="qs-start-body">
            <div class="qs-start-label">Rychlý start</div>
            <div class="qs-start-name">${escHtml(qsRoute.name)}</div>
            <div class="qs-start-meta">📏 ${qsDist} km · 🏆 PB: ${qsPB}</div>
          </div>
          <div class="qs-start-go">▶</div>
        </div>`;
      qsEl.style.display = 'block';
    } else {
      qsEl.style.display = 'none';
    }
  }

  const el = document.getElementById('home-routes');
  const cnt = routes.length;
  document.getElementById('home-routes-count').textContent = `${cnt} ${cnt===1?'trasa':cnt<5?'trasy':'tras'}`;

  // Update sort button label
  const sortLabels = { default:'📅 Nové', name:'🔤 Název', dist:'📏 Km', rides:'🏆 Jízdy' };
  const sortBtn = document.getElementById('home-sort-btn');
  if (sortBtn) sortBtn.textContent = sortLabels[sortMode] || '↕';

  if (!routes.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🚴‍♂️</div>
      <div class="empty-title">Žádné trasy</div>
      <div class="empty-sub">Vytvoř první trasu tlačítkem<br><strong>+ Trasa</strong> nahoře nebo z menu.</div>
    </div>`;
    return;
  }

  // Build sorted index array (we must keep original index for openDetail/openEdit)
  const indexed = routes.map((r, i) => ({ r, i }));
  if (sortMode === 'name') {
    indexed.sort((a, b) => a.r.name.localeCompare(b.r.name, 'cs'));
  } else if (sortMode === 'dist') {
    indexed.sort((a, b) => (b.r.totalDist||0) - (a.r.totalDist||0));
  } else if (sortMode === 'rides') {
    indexed.sort((a, b) => (b.r.records?.length||0) - (a.r.records?.length||0));
  }
  // default = insertion order (newest last = keep as-is, or reverse)

  el.innerHTML = indexed.map(({ r, i }) => {
    const pb   = r.records?.length ? r.records[0] : null;
    const wall = wallpaperUrl(r.wallpaper || DEFAULT_WALL);
    const dist = r.totalDist ? r.totalDist.toFixed(1) : '—';
    const totalRides = (r.records||[]).length;
    const avgTimeMs = totalRides > 0 ? r.records.reduce((s,rc)=>s+rc.totalMs,0)/totalRides : 0;
    const diff = calcRouteDifficulty(r);
    const typeTag = r.type === 'gpx' ? 'GPX' : r.type === 'strava' ? 'Strava' : 'Manual';
    return `<div class="route-card-wrap" id="route-card-${i}">
      <div class="route-card-inner">
        <div class="route-card-front">
          <div class="route-card" onclick="openDetail(${i})">
            <div class="route-card-bg" style="background-image:url(${wall})"></div>
            <div class="route-card-grad"></div>
            <div class="route-card-actions">
              <div class="rc-btn" onclick="event.stopPropagation();openEdit(${i})" title="Upravit">✏️</div>
              <div class="rc-btn" onclick="event.stopPropagation();toggleCardFlip(${i})" title="Statistiky">↔</div>
            </div>
            <div class="route-card-body">
              <div class="route-card-top">
                <div style="flex:1;min-width:0;padding-right:80px;">
                  <div class="route-card-name">${r.name}</div>
                  <div style="margin-top:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span class="difficulty-badge ${diff.cls}">${diff.ico} ${diff.label}</span>
                    <span class="route-card-type-tag">${typeTag}</span>
                  </div>
                </div>
              </div>
              <div>
                <div class="route-card-stats">
                  <span>📏 <strong>${dist}</strong> km</span>
                  <span>⛰ <strong>+${r.totalElev||0}</strong> m</span>
                  <span>🏁 <strong>${(r.checkpoints||[]).length}</strong> CP</span>
                  <span>📊 <strong>${totalRides}</strong> ${totalRides===1?'jízda':totalRides<5?'jízdy':'jízd'}</span>
                </div>
                <div class="route-card-bottom-row">
                  ${pb ? `<div class="route-card-pb">🏆 PB: <strong>${fmtTime(pb.totalMs)}</strong></div>` : '<div></div>'}
                  <div id="spark-${i}"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="route-card-back" onclick="toggleCardFlip(${i})">
          <div class="card-back-close" onclick="event.stopPropagation();toggleCardFlip(${i})">✕</div>
          <div class="card-back-title">${r.name}</div>
          <div class="card-back-stat"><span class="cbs-label">Počet jízd</span><span class="cbs-val">${totalRides}</span></div>
          <div class="card-back-stat"><span class="cbs-label">Nejlepší čas</span><span class="cbs-val">${pb ? fmtTime(pb.totalMs) : '—'}</span></div>
          <div class="card-back-stat"><span class="cbs-label">Průměr</span><span class="cbs-val">${avgTimeMs > 0 ? fmtTime(avgTimeMs) : '—'}</span></div>
          <div class="card-back-stat"><span class="cbs-label">Vzdálenost</span><span class="cbs-val">${dist} km</span></div>
          <div class="card-back-stat"><span class="cbs-label">Převýšení</span><span class="cbs-val">+${r.totalElev||0} m</span></div>
          <div class="card-back-stat"><span class="cbs-label">Checkpointy</span><span class="cbs-val">${(r.checkpoints||[]).length} CP</span></div>
          <div style="margin-top:6px;font-size:11px;color:var(--text3);text-align:center;">klepni pro otočení zpět</div>
        </div>
      </div>
    </div>`;
  }).join('');

  // Animate count-up stats
  setTimeout(() => {
    document.querySelectorAll('.qs-val').forEach(el2 => {
      const val = parseFloat(el2.textContent);
      if (!isNaN(val) && val > 0) animateCountUp(el2, val);
    });
    // Sparklines
    indexed.forEach(({ r, i }) => {
      const sparkEl = document.getElementById(`spark-${i}`);
      if (sparkEl && r.records?.length >= 2) {
        const times = r.records.slice(0,8).map(rec => rec.totalMs/1000/60);
        renderSparkline(sparkEl, times.reverse());
      }
    });
    updateSidebar();
  }, 0);
}

function cycleSortMode() {
  const modes = ['default', 'name', 'dist', 'rides'];
  const idx = modes.indexOf(sortMode);
  sortMode = modes[(idx + 1) % modes.length];
  renderHome();
}

// ════════════════════════════════════════════════
//  DETAIL
// ════════════════════════════════════════════════
function openDetail(idx) {
  viewIdx = idx;
  navTo('detail');
}

function renderDetail() {
  const r = routes[viewIdx]; if (!r) return;
  document.getElementById('det-title').textContent = r.name;

  // Hero
  const hero = document.getElementById('det-hero');
  hero.style.backgroundImage = `url(${wallpaperUrl(r.wallpaper || DEFAULT_WALL)})`;
  document.getElementById('det-hero-name').textContent = r.name;
  const typeLabel = r.type === 'gpx' ? 'GPX trasa' : r.type === 'strava' ? 'Strava' : 'Ručně zadáno';
  const ridesCount = (r.records||[]).length;
  document.getElementById('det-hero-sub').textContent = `${typeLabel} · ${(r.checkpoints||[]).length} CP · ${ridesCount} ${ridesCount===1?'jízda':ridesCount<5?'jízdy':'jízd'}`;
  document.getElementById('dh-dist').textContent = (r.totalDist||0).toFixed(1);
  document.getElementById('dh-up').textContent   = '+' + (r.totalElev||0);
  document.getElementById('dh-down').textContent = '-' + (r.totalDesc||0);

  // Mini stats grid
  const recs = r.records || [];
  const pb = recs.length ? recs[0] : null;
  const avgMs = recs.length ? recs.reduce((s,rc)=>s+rc.totalMs,0)/recs.length : 0;
  const pbPaceMinKm = (pb && r.totalDist) ? (pb.totalMs/1000/60)/r.totalDist : 0;
  const statsGrid = document.getElementById('det-stats-grid');
  if (statsGrid) {
    const miniCard = (val, lbl, cls='') =>
      `<div class="det-stat-card"><div class="det-stat-val ${cls}">${val}</div><div class="det-stat-lbl">${lbl}</div></div>`;
    statsGrid.innerHTML =
      miniCard(pb ? fmtTime(pb.totalMs) : '—', '🏆 PB čas', 'gold') +
      miniCard(recs.length.toString(), '📊 Jízdy', 'blue') +
      miniCard((r.totalDist||0).toFixed(1)+' km', '📏 Délka') +
      miniCard('+' + (r.totalElev||0) + ' m', '⛰ Stoupání', 'up') +
      miniCard(avgMs ? fmtTime(avgMs) : '—', '⏱ Průměr') +
      miniCard(pbPaceMinKm ? fmtPace(pbPaceMinKm) : '—', '⚡ PB tempo');
  }

  // Profile — show only if elevation data exists
  const hasElev = (r.elevProfile?.altitude?.length > 2) || (r.elevPoints?.length > 2);
  const profileWrap = document.getElementById('det-profile-wrap');
  if (profileWrap) profileWrap.style.display = hasElev ? 'block' : 'none';
  if (hasElev) {
    document.getElementById('det-profile-hdr').innerHTML = `
      <div class="profile-stat"><span class="pos">+${r.totalElev||0}</span><small>m stoupání</small></div>
      <div class="profile-stat"><span class="neg">-${r.totalDesc||0}</span><small>m klesání</small></div>`;
    setTimeout(()=>drawElevation(r,'det-elev-canvas',110,true), 30);
  }

  // Checkpoints
  const cpEl = document.getElementById('det-cps');
  if (!r.checkpoints?.length) {
    cpEl.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0;">Žádné checkpointy</div>';
  } else {
    cpEl.innerHTML = r.checkpoints.map((cp,i) => {
      // Best split at this CP across all rides
      const splits = recs.map(rec => rec.checkpoints?.[i]?.splitMs).filter(Boolean);
      const bestSplit = splits.length ? Math.min(...splits) : null;
      return `<div class="cp-item">
        <div class="cp-num">${i+1}</div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">${cp.name||'CP '+(i+1)}</div>
          <div style="font-size:12px;color:var(--text2);font-family:var(--mono);">${cp.km.toFixed(2)} km</div>
        </div>
        ${bestSplit ? `<div style="font-size:11px;color:var(--gold);font-family:var(--mono);text-align:right;">🏆 ${fmtTime(bestSplit)}</div>` : ''}
      </div>`;
    }).join('');
  }

  renderLeaderboard('det-leaderboard', r);
}

function renderLeaderboard(elId, r) {
  const el = document.getElementById(elId);
  if (!r.records?.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0;">Zatím žádné jízdy. Pojeď první! 🚀</div>';
    return;
  }
  const medals = ['gold','silver','bronze'];
  const pb = r.records[0].totalMs;
  el.innerHTML = r.records.map((rec,i) => {
    const diff = rec.totalMs - pb;
    const diffStr = i === 0 ? '🏆 PB' : `+${fmtTime(diff)}`;
    const date = new Date(rec.date).toLocaleDateString('cs-CZ',{day:'2-digit',month:'2-digit',year:'2-digit'});
    const perfBadges = [];
    if (rec.avgWatts)   perfBadges.push(`<span class="perf-badge">⚡ ${rec.avgWatts}W</span>`);
    if (rec.avgHr)      perfBadges.push(`<span class="perf-badge">❤️ ${rec.avgHr}</span>`);
    if (rec.avgCadence) perfBadges.push(`<span class="perf-badge">🔄 ${rec.avgCadence}rpm</span>`);
    if (rec.calories)   perfBadges.push(`<span class="perf-badge">🔥 ${rec.calories}kcal</span>`);
    const perfHtml = perfBadges.length ? `<div style="margin-top:4px">${perfBadges.join('')}</div>` : '';
    return `<div class="lb-row" style="flex-wrap:wrap">
      <div class="lb-pos ${medals[i]||''}">${i+1}</div>
      <div class="lb-time">${fmtTime(rec.totalMs)}</div>
      <div class="lb-diff ${i===0?'sp-fast':'sp-slow'}">${diffStr}</div>
      <div class="lb-date">${date}</div>
      ${perfHtml ? `<div style="width:100%;padding-left:38px">${perfHtml}</div>` : ''}
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════
//  ADD / EDIT
// ════════════════════════════════════════════════
function initAddScreen() {
  editIdx = null;
  document.getElementById('add-screen-title').textContent = 'Nová trasa';
  clearAddForm();
  switchTab('manual');
  selectedWallpaper = DEFAULT_WALL;
  selectedWallpaperGPX = DEFAULT_WALL;
  renderWallpaperPicker('wp-picker', selectedWallpaper, w => selectedWallpaper = w);
  renderWallpaperPicker('wp-picker-gpx', selectedWallpaperGPX, w => selectedWallpaperGPX = w);
}

function openEdit(idx) {
  editIdx = idx; viewIdx = idx;
  const r = routes[idx];
  document.getElementById('add-screen-title').textContent = 'Upravit trasu';
  switchTab('manual');
  document.getElementById('add-tabs').style.display = 'none';
  document.getElementById('m-name').value = r.name;
  document.getElementById('m-dist').value = r.totalDist || '';
  document.getElementById('m-elev').value = r.totalElev || '';
  document.getElementById('m-desc').value = r.totalDesc || '';
  document.getElementById('m-base').value = r.baseElev  || '';
  const list = document.getElementById('m-cp-list');
  list.innerHTML = '';
  (r.checkpoints||[]).forEach(cp => addCPWithValues('m-cp-list', cp.km, cp.name));
  selectedWallpaper = r.wallpaper || DEFAULT_WALL;
  renderWallpaperPicker('wp-picker', selectedWallpaper, w => selectedWallpaper = w);
  navTo('add');
  setTimeout(()=>{
    document.getElementById('add-screen-title').textContent = 'Upravit trasu';
    document.getElementById('add-tabs').style.display = 'none';
  }, 50);
}

function editCurrentRoute() { openEdit(viewIdx); }

function clearAddForm() {
  ['m-name','m-dist','m-elev','m-desc','m-base'].forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
  document.getElementById('m-cp-list').innerHTML = '';
  document.getElementById('add-tabs').style.display = '';
  gpxTemp = null;
  document.getElementById('gpx-preview').style.display = 'none';
  document.getElementById('gpx-zone').classList.remove('loaded');
  document.getElementById('gpx-zone-txt').innerHTML = 'Klikni pro výběr GPX souboru<br><span style="font-size:12px;color:var(--text3);">Komoot · Strava · Garmin · RideWithGPS</span>';
  document.getElementById('gpx-cp-list').innerHTML = '';
}

function switchTab(tab) {
  document.getElementById('tab-manual-body').style.display = tab==='manual' ? '' : 'none';
  document.getElementById('tab-gpx-body').style.display    = tab==='gpx'    ? '' : 'none';
  document.getElementById('tab-manual').classList.toggle('active', tab==='manual');
  document.getElementById('tab-gpx').classList.toggle('active', tab==='gpx');
}

function renderWallpaperPicker(elId, selectedId, cb) {
  const el = document.getElementById(elId);
  el.innerHTML = WALLPAPERS.map(w =>
    `<div class="wp-thumb ${w.id===selectedId?'selected':''}"
          style="background-image:url(${w.file})"
          onclick="selectWallpaper('${elId}','${w.id}')"></div>`
  ).join('');
  el.dataset.cb = elId; // store
}

function selectWallpaper(elId, wid) {
  if (elId === 'wp-picker') selectedWallpaper = wid;
  else selectedWallpaperGPX = wid;
  renderWallpaperPicker(elId, wid, ()=>{});
}

// ── CHECKPOINTS ───────────────────────────────────
let _cpId = 0;
function addCP(listId) { addCPWithValues(listId, '', ''); }
function addCPWithValues(listId, km, name) {
  const id  = 'cp' + (++_cpId);
  const div = document.createElement('div');
  div.className = 'cp-item';
  div.id = id;
  const count = document.getElementById(listId).children.length + 1;
  div.innerHTML = `
    <div class="cp-num" id="${id}-num">${count}</div>
    <input class="cp-km-inp" type="number" placeholder="km" min="0" step="0.01" value="${km||''}">
    <input class="cp-name-inp" type="text" placeholder="Název CP" value="${name||''}">
    <button class="cp-del" onclick="removeCP('${id}','${listId}')">×</button>`;
  document.getElementById(listId).appendChild(div);
}
function removeCP(id, listId) { document.getElementById(id).remove(); renumberCPs(listId); }
function renumberCPs(listId) {
  document.querySelectorAll(`#${listId} .cp-num`).forEach((el,i) => el.textContent = i+1);
}
function getCPs(listId) {
  const out = [];
  document.querySelectorAll(`#${listId} .cp-item`).forEach(item => {
    const km = parseFloat(item.querySelector('.cp-km-inp').value);
    const name = item.querySelector('.cp-name-inp').value.trim();
    if (!isNaN(km) && km >= 0) out.push({ km, name: name || `CP ${out.length+1}` });
  });
  return out.sort((a,b) => a.km - b.km);
}

// ── SAVE MANUAL ───────────────────────────────────
function saveManual() {
  const name = document.getElementById('m-name').value.trim();
  const dist = parseFloat(document.getElementById('m-dist').value);
  const elev = parseInt(document.getElementById('m-elev').value) || 0;
  const desc = parseInt(document.getElementById('m-desc').value) || 0;
  const base = parseInt(document.getElementById('m-base').value) || 0;
  if (!name)            { toast('⚠️ Zadej název trasy'); return; }
  if (!dist || dist<=0) { toast('⚠️ Zadej délku trasy'); return; }

  const cps = getCPs('m-cp-list');
  const elevPts = genElevation(dist, elev, desc, base);
  const route = { name, totalDist:dist, totalElev:elev, totalDesc:desc, baseElev:base,
                  checkpoints:cps, type:'manual', records:[], elevPoints:elevPts,
                  wallpaper: selectedWallpaper };

  if (editIdx !== null) {
    route.records = routes[editIdx].records || [];
    routes[editIdx] = route;
    toast('✅ Trasa aktualizována');
    viewIdx = editIdx; editIdx = null;
    saveRoutes();
    navTo('detail');
  } else {
    routes.push(route);
    saveRoutes();
    toast('✅ Trasa uložena');
    navTo('home');
  }
}

// ── GPX ───────────────────────────────────────────
function loadGPX(inp) {
  const f = inp.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = e => { try { parseGPX(e.target.result, f.name); } catch(err) { toast('❌ ' + err.message); } };
  rd.readAsText(f);
}
function parseGPX(xml, fname) {
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  const pts = doc.querySelectorAll('trkpt');
  if (!pts.length) throw new Error('GPX neobsahuje body');
  const name = (doc.querySelector('name')?.textContent || fname.replace('.gpx','')).trim();
  let points = [], totalDist = 0, prevLat = null, prevLon = null;
  pts.forEach(p => {
    const lat = parseFloat(p.getAttribute('lat'));
    const lon = parseFloat(p.getAttribute('lon'));
    const ele = parseFloat(p.querySelector('ele')?.textContent||0);
    if (prevLat !== null) totalDist += haversine(prevLat,prevLon,lat,lon);
    prevLat=lat; prevLon=lon;
    points.push({lat,lon,ele,dist:totalDist});
  });
  let elev=0, desc=0;
  for (let i=1;i<points.length;i++) {
    const d = points[i].ele - points[i-1].ele;
    if (d>0) elev+=d; else desc+=Math.abs(d);
  }
  const elevPts = downsample(points,250).map(p=>({dist:p.dist,ele:p.ele}));
  gpxTemp = { name, totalDist, totalElev:Math.round(elev), totalDesc:Math.round(desc), elevPoints:elevPts };

  document.getElementById('gpx-zone').classList.add('loaded');
  document.getElementById('gpx-zone-txt').innerHTML = `<span style="color:var(--green);font-weight:700;">✓ ${fname}</span>`;
  document.getElementById('gpx-name').value = name;
  document.getElementById('gpx-profile-hdr').innerHTML = `
    <div class="profile-stat"><span class="pos">+${gpxTemp.totalElev}</span><small>m stoup.</small></div>
    <div class="profile-stat"><span class="neg">-${gpxTemp.totalDesc}</span><small>m kles.</small></div>
    <div class="profile-stat" style="margin-left:auto;font-size:14px;color:var(--text2);">${totalDist.toFixed(2)} km</div>`;
  document.getElementById('gpx-preview').style.display = '';
  setTimeout(()=>drawElevation(gpxTemp,'gpx-canvas',120,true), 30);
}
function saveGPX() {
  if (!gpxTemp) { toast('⚠️ Načti GPX soubor'); return; }
  const name = document.getElementById('gpx-name').value.trim() || gpxTemp.name;
  const cps = getCPs('gpx-cp-list');
  routes.push({ ...gpxTemp, name, checkpoints:cps, type:'gpx', records:[], wallpaper: selectedWallpaperGPX });
  saveRoutes();
  toast('✅ GPX trasa uložena');
  gpxTemp = null;
  navTo('home');
}

// ── DELETE ────────────────────────────────────────
function deleteRoute() { document.getElementById('modal-del').classList.add('open'); }
function doDeleteRoute() {
  closeModal('modal-del');
  routes.splice(viewIdx,1);
  saveRoutes();
  toast('🗑 Trasa smazána');
  navTo('home');
}

// ════════════════════════════════════════════════
//  RIDE
// ════════════════════════════════════════════════
function startRide() {
  const r = routes[viewIdx];
  rs = {
    running:false, startTs:null, elapsed:0,
    cps: (r.checkpoints||[]).map(cp => ({...cp, hitTime:null, splitMs:null})),
    cpIdx:0, finished:false, prevPos:null,
    _tvLastUpdate: -1
  };
  cancelAnimationFrame(rafId);
  document.getElementById('ride-name').textContent     = r.name;
  document.getElementById('ride-dist-lbl').textContent = `${(r.totalDist||0).toFixed(1)} km · ${(r.checkpoints||[]).length} CP`;
  document.getElementById('btn-sp').textContent  = '▶ START';
  document.getElementById('btn-sp').disabled     = false;
  document.getElementById('btn-rst').style.display = 'none';
  document.getElementById('sdot').className   = 'status-dot';
  document.getElementById('stxt').textContent = 'READY';
  document.getElementById('timer-main').className = 'timer-main';
  document.getElementById('timer-main').innerHTML = '0:00<span class="timer-ms" id="timer-ms">.00</span>';
  document.getElementById('prog-fill').style.width = '0%';
  // Progress markers for checkpoints
  const markersEl = document.getElementById('prog-markers');
  if (markersEl) {
    markersEl.innerHTML = (r.checkpoints||[]).map(cp => {
      const pct = r.totalDist ? Math.min(99, (cp.km / r.totalDist) * 100) : 0;
      return `<div class="prog-cp-marker" data-km="${cp.km}" style="left:${pct}%"></div>`;
    }).join('');
  }
  // Clear TV board
  const tvRows = document.getElementById('tv-rows');
  if (tvRows) tvRows.innerHTML = '<div class="tv-empty">Spusť jízdu a projeď 1. CP 🚀</div>';
  resetStatCards();
  renderRideCPs();
  renderTVBoard();
  updateCPCtrlButton();
  setTimeout(()=>drawElevation(r,'ride-elev',80,true), 30);
  // Set ghost PB
  const recs = routes[viewIdx]?.records;
  if (recs?.length > 0) {
    ghostPbMs = recs[0].totalMs;  // records[0] is best time (sorted ascending)
  } else {
    ghostPbMs = 0;
  }
  // Flip clock disabled (removed from UI — single timer display only)
  _flipDigits = {};

  // Feature E: reset motivational messages state
  _motiLastState = null;
  _motiLastPct = 0;

  // Reset CP control button
  const cpBtn = document.getElementById('btn-cp-tap');
  if (cpBtn) { cpBtn.style.display = 'none'; }
  const btnRst = document.getElementById('btn-rst');
  if (btnRst) { btnRst.style.display = 'none'; }

  // Feature H: clear tints on ride start
  const screenRide = document.getElementById('screen-ride');
  if (screenRide) { screenRide.classList.remove('tint-ahead', 'tint-behind'); }

  // Feature F: initialize elevation canvas
  drawRideElevation();

  // J: WakeLock — prevent screen from turning off
  acquireWakeLock();

  // K: Voice announcement
  speak('Jízda zahájena. Hodně štěstí!');

  showScreen('ride');
}

function resetStatCards() {
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  set('s-time', '0:00');
  set('s-pct',  '0%');
  set('s-pace', '—');
  set('s-eta',  '—');
  set('s-pb',   '—');
  set('s-pos',  '#—');
  set('s-pos-of', `z ${(routes[viewIdx]?.records?.length||0)+1}`);
  set('s-km',   `0 / ${(routes[viewIdx]?.totalDist||0).toFixed(1)} km`);
}

function toggleTimer() {
  if (rs.finished) return;
  if (!rs.running) {
    rs.startTs = rs.startTs === null ? performance.now() : performance.now() - rs.elapsed;
    rs.running = true;
    document.getElementById('btn-sp').textContent = '⏸ PAUZA';
    document.getElementById('sdot').className     = 'status-dot go';
    document.getElementById('stxt').textContent   = 'JEDE';
    document.getElementById('timer-main').classList.remove('paused');
    document.getElementById('timer-main').classList.add('running');
    renderRideCPs();
    updateCPCtrlButton();
    tick();
  } else {
    rs.elapsed = performance.now() - rs.startTs;
    rs.running = false;
    cancelAnimationFrame(rafId);
    document.getElementById('btn-sp').textContent = '▶ POKRAČOVAT';
    document.getElementById('sdot').className     = 'status-dot pause';
    document.getElementById('stxt').textContent   = 'PAUZA';
    document.getElementById('timer-main').classList.add('paused');
    document.getElementById('timer-main').classList.remove('running');
    document.getElementById('btn-rst').style.display = '';
    renderRideCPs();
    updateCPCtrlButton();
  }
}

function tick() {
  if (!rs.running) return;
  rs.elapsed = performance.now() - rs.startTs;
  updateRideUI();
  rafId = requestAnimationFrame(tick);
}

function updateRideUI() {
  const ms = rs.elapsed;
  const sec = Math.floor(ms/1000);
  const m = Math.floor(sec/60);
  const s = sec%60;
  const cs = String(Math.floor((ms%1000)/10)).padStart(2,'0');
  document.getElementById('timer-main').innerHTML =
    `${m}:${String(s).padStart(2,'0')}<span class="timer-ms" id="timer-ms">.${cs}</span>`;
  updateGhostBar(ms);

  const r = routes[viewIdx];
  const lastHit = [...rs.cps].reverse().find(c=>c.hitTime!==null);
  const curKm   = rs.finished ? r.totalDist : (lastHit ? lastHit.km : 0);
  const pct     = r.totalDist ? Math.min(100,(curKm/r.totalDist)*100) : 0;
  document.getElementById('s-pct').textContent = Math.round(pct)+'%';
  document.getElementById('s-km').textContent  = `${curKm.toFixed(1)} / ${(r.totalDist||0).toFixed(1)} km`;
  document.getElementById('prog-fill').style.width = pct+'%';
  document.getElementById('prog-lbl').textContent  = `${curKm.toFixed(1)} / ${(r.totalDist||0).toFixed(1)} km`;

  // Pace & ETA: use estimated km based on time-vs-PB-position rather than last CP only,
  // but for simplicity we keep CP-based km
  if (ms > 3000 && curKm > 0) {
    const pace = (ms/1000/60)/curKm;
    document.getElementById('s-pace').textContent = fmtPace(pace);
    const remain = (r.totalDist||0) - curKm;
    document.getElementById('s-eta').textContent  = fmtTime(remain*pace*60000);
  }

  // PB card
  const pb = r.records?.length ? r.records[0] : null;
  if (pb && lastHit) {
    const ci = rs.cps.indexOf(lastHit);
    const pbCp = pb.checkpoints?.[ci];
    if (pbCp?.hitTime != null) {
      const diff = lastHit.hitTime - pbCp.hitTime;
      const el = document.getElementById('s-pb');
      el.style.color = diff<=0 ? 'var(--green)' : 'var(--red)';
      el.textContent = (diff<=0?'▲ ':'▼ +') + fmtTime(Math.abs(diff));
    }
  }
  // Throttle TV board: update at most twice per second (smooth drop effect)
  if (rs._tvLastUpdate < 0 || (rs.elapsed - rs._tvLastUpdate) >= 500) {
    rs._tvLastUpdate = rs.elapsed;
    renderTVBoard();
  }

  // Feature A: Ghost racer dots on progress bar
  const totalDist = r?.totalDist || 0;
  const myDotEl = document.getElementById('my-dot');
  const ghostDotEl = document.getElementById('ghost-dot');
  if (myDotEl && ghostDotEl && totalDist > 0) {
    const cpsDone = rs.cps.filter(c => c.hitTime != null).length;
    const totalCps = rs.cps.length;
    let myPct;
    if (rs.finished) {
      myPct = 100;
    } else if (totalCps === 0) {
      myPct = ghostPbMs > 0 ? Math.min((rs.elapsed / ghostPbMs) * 100, 99) : 0;
    } else {
      const basePct = (cpsDone / (totalCps + 1)) * 100;
      const nextPct  = ((cpsDone + 1) / (totalCps + 1)) * 100;
      const nextCpMs = (() => {
        if (ghostPbMs <= 0) return ghostPbMs;
        const fraction = (cpsDone + 1) / (totalCps + 1);
        return fraction * ghostPbMs;
      })();
      const prevCpMs = (() => {
        if (cpsDone === 0) return 0;
        const fraction = cpsDone / (totalCps + 1);
        return fraction * ghostPbMs;
      })();
      const segDuration = nextCpMs - prevCpMs;
      const sinceLastCp = cpsDone > 0 ? rs.elapsed - (rs.cps[cpsDone-1]?.hitTime || 0) : rs.elapsed;
      const segPct = segDuration > 0 ? Math.min(sinceLastCp / segDuration, 1) : 0;
      myPct = Math.min(basePct + segPct * (nextPct - basePct), 99);
    }
    const ghostPct = ghostPbMs > 0 ? Math.min((rs.elapsed / ghostPbMs) * 100, 100) : 0;

    myDotEl.style.display = 'block';
    myDotEl.style.left = `calc(${myPct.toFixed(1)}% - 7px)`;

    if (ghostPbMs > 0) {
      ghostDotEl.style.display = 'block';
      ghostDotEl.style.left = `calc(${ghostPct.toFixed(1)}% - 6px)`;
    } else {
      ghostDotEl.style.display = 'none';
    }
  }

  // Feature C: Pacing zone indicator
  const pacingWrap = document.getElementById('pacing-zone-wrap');
  const pacingCursor = document.getElementById('pacing-cursor');
  const pacingLabel = document.getElementById('pacing-label');
  if (pacingWrap && rs.elapsed > 5000 && ghostPbMs > 0) {
    pacingWrap.style.display = 'block';
    const cpsDonePacing = rs.cps.filter(c => c.hitTime != null).length;
    const totalCpsPacing = rs.cps.length;
    const myProgressPacing = (() => {
      if (totalCpsPacing === 0) return rs.elapsed / ghostPbMs;
      const baseFrac = cpsDonePacing / (totalCpsPacing + 1);
      return baseFrac + (rs.elapsed - (rs.cps[cpsDonePacing-1]?.hitTime || 0)) / ghostPbMs / (totalCpsPacing + 1);
    })();
    const paceRatio = myProgressPacing > 0 ? (rs.elapsed / ghostPbMs) / myProgressPacing : 1;
    const zonePct = Math.max(0, Math.min(100, (1 - (paceRatio - 1) * 3.33) * 100));
    if (pacingCursor) pacingCursor.style.left = `${zonePct.toFixed(1)}%`;

    const totalDistPacing = r?.totalDist || 1;
    const estKm = totalDistPacing * (cpsDonePacing / ((rs.cps.length || 1) + 1));
    if (estKm > 0.5 && pacingLabel) {
      const minPerKm = (rs.elapsed / 60000) / estKm;
      const mPace = Math.floor(minPerKm); const sPace = Math.round((minPerKm - mPace) * 60);
      pacingLabel.textContent = `${mPace}:${sPace.toString().padStart(2,'0')} min/km`;
    }
  }

  // Feature D: Countdown to next CP
  const nextCpBar = document.getElementById('next-cp-bar');
  if (nextCpBar) {
    const nextCp = rs.cps[rs.cpIdx];
    if (nextCp && rs.running && !rs.finished) {
      nextCpBar.style.display = 'flex';
      document.getElementById('next-cp-name').textContent = `→ ${nextCp.name || `CP ${rs.cpIdx + 1}`}`;
      const cpsDoneD = rs.cps.filter(c => c.hitTime != null).length;
      const totalCpsD = rs.cps.length;
      const totalDistD = r?.totalDist || 0;
      const estKmDone = totalDistD * (cpsDoneD / (totalCpsD + 1));
      const cpKm = nextCp.km || totalDistD * ((rs.cpIdx + 1) / (totalCpsD + 1));
      const distToNext = Math.max(0, cpKm - estKmDone);
      document.getElementById('next-cp-dist').textContent = `${distToNext.toFixed(2)} km`;

      const etaEl = document.getElementById('next-cp-eta');
      if (estKmDone > 0.5 && distToNext > 0) {
        const paceSecPerKm = (rs.elapsed / 1000) / estKmDone;
        const etaSec = Math.round(distToNext * paceSecPerKm);
        const mEta = Math.floor(etaSec / 60); const sEta = etaSec % 60;
        etaEl.textContent = `~${mEta}:${sEta.toString().padStart(2,'0')}`;
        if (ghostPbMs > 0) {
          const pbPaceSecPerKm = (ghostPbMs / 1000) / (totalDistD || 1);
          const pbEtaSec = distToNext * pbPaceSecPerKm;
          etaEl.className = 'next-cp-eta ' + (etaSec < pbEtaSec ? 'fast' : etaSec > pbEtaSec * 1.05 ? 'slow' : 'normal');
        } else {
          etaEl.className = 'next-cp-eta normal';
        }
      } else {
        etaEl.textContent = '—';
      }
    } else {
      nextCpBar.style.display = 'none';
    }
  }

  // Feature F: elevation dot — throttled
  if (!rs._elevLastDraw || rs.elapsed - rs._elevLastDraw > 2000) {
    rs._elevLastDraw = rs.elapsed;
    drawRideElevation();
  }

  // Feature H: Background tint
  if (!rs._tintLast || rs.elapsed - rs._tintLast > 1000) {
    rs._tintLast = rs.elapsed;
    const screenEl = document.getElementById('screen-ride');
    if (screenEl && ghostPbMs > 0 && rs.elapsed > 3000) {
      const isAheadH = rs.elapsed < ghostPbMs * (_motiLastPct / 100 || 0.01);
      screenEl.classList.toggle('tint-ahead', isAheadH);
      screenEl.classList.toggle('tint-behind', !isAheadH);
    }
  }

  // PB Prediction
  updatePBPrediction(ms);

  // Auto-save ride progress every 30 seconds
  if (!rs._lastAutoSave || ms - rs._lastAutoSave > 30000) {
    rs._lastAutoSave = ms;
    localStorage.setItem('vt_ride_autosave', JSON.stringify({
      routeIdx: viewIdx,
      elapsed: ms,
      cps: rs.cps,
      cpIdx: rs.cpIdx,
      savedAt: Date.now(),
    }));
  }

  // Feature E: Motivational messages check
  const cpsDoneForMoti = rs.cps.filter(c => c.hitTime != null).length;
  const pctForMoti = rs.cps.length > 0
    ? (cpsDoneForMoti / (rs.cps.length + 1)) * 100
    : (ghostPbMs > 0 ? Math.min((rs.elapsed / ghostPbMs) * 100, 99) : 0);
  checkMotiMessages(rs.elapsed, cpsDoneForMoti, rs.cps.length, pctForMoti);
}

// ════════════════════════════════════════════════
//  TV BOARD — propadávající žebříček (DOM-diffing)
// ════════════════════════════════════════════════
const TV_ROW_H = 52; // px per row (must match CSS padding+content)

function buildTVEntries(r) {
  const recs      = r.records || [];
  const cps       = rs.cps;
  const nextCpIdx = rs.cpIdx;  // index of NEXT (not yet hit) checkpoint
  const lastHit   = [...cps].reverse().find(c => c.hitTime !== null);

  // ── Header: always show which target we're comparing to ──
  const nextCP = rs.finished ? null : cps[nextCpIdx];
  if (rs.finished) {
    document.getElementById('tv-cp-info').innerHTML = '<span class="tv-hdr-cp">🏁 CÍL</span>';
  } else if (nextCP) {
    document.getElementById('tv-cp-info').innerHTML =
      `→ <span class="tv-hdr-cp">${nextCP.name || ('CP '+(nextCpIdx+1))}</span>`;
  } else {
    // all CPs passed, heading to finish
    document.getElementById('tv-cp-info').innerHTML =
      '→ <span class="tv-hdr-cp">🏁 Cíl</span>';
  }

  // ── My time shown in board: always the raw elapsed ──
  // This creates the "dropping" effect — my live timer value grows,
  // and I sink through the rankings as it exceeds historical CP times.
  // (Projected ETA caused confusing inflated numbers; raw elapsed is intuitive.)
  let myETA = null;
  if (rs.finished) {
    myETA = rs.elapsed;
  } else if (rs.running || rs.elapsed > 0) {
    myETA = rs.elapsed;
  }

  // ── Historical rides: their ACTUAL time at the same target (nextCpIdx) ──
  const entries = recs.map((rec, idx) => {
    const date = new Date(rec.date).toLocaleDateString('cs-CZ', {day:'2-digit', month:'2-digit'});
    let refTime = null;
    if (rs.finished) {
      refTime = rec.totalMs;
    } else if (nextCpIdx >= cps.length) {
      // All CPs passed, heading to finish — compare to their total time
      refTime = rec.totalMs ?? null;
    } else {
      // Use their real split at the next checkpoint we're headed to
      refTime = rec.checkpoints?.[nextCpIdx]?.hitTime ?? null;
    }
    return { key: 'ride-' + idx, isMe: false, name: `Jízda #${idx+1}`, sub: date, refTime };
  });

  // Add "me"
  const meSub = rs.finished ? 'právě teď'
               : !rs.running && rs.elapsed === 0 ? 'připraven'
               : lastHit ? 'v jízdě'
               : 'na trati';
  entries.push({ key: 'me', isMe: true, name: '👤 Já', sub: meSub, refTime: myETA });

  // Sort: comparable first by refTime asc, non-comparable at bottom
  const ranked = [...entries].sort((a, b) => {
    if (a.refTime === null && b.refTime === null) return 0;
    if (a.refTime === null) return 1;
    if (b.refTime === null) return -1;
    return a.refTime - b.refTime;
  });

  return ranked;
}

function renderTVBoard() {
  const r = routes[viewIdx]; if (!r) return;

  const ranked = buildTVEntries(r);
  if (!ranked.length) return;

  const meEntry = ranked.find(e => e.isMe);
  const leader  = ranked[0];
  const isLeading = leader?.isMe;

  // Update position card (hidden element kept for JS compat)
  const myPos = ranked.findIndex(e => e.isMe) + 1;
  const sPosEl = document.getElementById('s-pos');
  const sPosOfEl = document.getElementById('s-pos-of');
  if (sPosEl) sPosEl.textContent  = '#' + myPos;
  if (sPosOfEl) sPosOfEl.textContent = `z ${ranked.length}`;

  // ── Mobile: limit to 5 rows centered on "me" (2 above, me, 2 below) ──
  const myIdx = ranked.findIndex(e => e.isMe);
  const start = Math.max(0, myIdx - 2);
  const end   = Math.min(ranked.length, myIdx + 3);
  const displayed = ranked.slice(start, end);

  const container = document.getElementById('tv-rows');

  // If container has the "empty" placeholder, clear it
  if (container.querySelector('.tv-empty')) container.innerHTML = '';

  // Set container height for absolute children
  container.style.height = (displayed.length * TV_ROW_H) + 'px';

  // Collect existing DOM rows keyed by data-key
  const existing = {};
  container.querySelectorAll('.tv-row[data-key]').forEach(el => {
    existing[el.dataset.key] = el;
  });

  displayed.forEach((entry, i) => {
    const newTop = i * TV_ROW_H;
    // Global rank position in full ranked list
    const globalRank = ranked.indexOf(entry);

    // Build diff HTML for this entry vs others
    let diffHTML;
    if (entry.isMe) {
      if (isLeading) {
        diffHTML = '<div class="tv-diff leader">🏆 LEAD</div>';
      } else if (entry.refTime != null && leader?.refTime != null) {
        const d = entry.refTime - leader.refTime;
        diffHTML = `<div class="tv-diff behind"><span class="tv-arrow">▼</span>+${fmtTime(d)}</div>`;
      } else {
        diffHTML = '<div class="tv-diff none">—</div>';
      }
    } else {
      if (entry.refTime != null && meEntry?.refTime != null) {
        const d = entry.refTime - meEntry.refTime;
        if (d < 0) diffHTML = `<div class="tv-diff ahead"><span class="tv-arrow">▲</span>-${fmtTime(Math.abs(d))}</div>`;
        else if (d > 0) diffHTML = `<div class="tv-diff behind"><span class="tv-arrow">▼</span>+${fmtTime(d)}</div>`;
        else diffHTML = '<div class="tv-diff none">=</div>';
      } else {
        diffHTML = '<div class="tv-diff none">—</div>';
      }
    }

    const posCls  = globalRank===0?'p1':globalRank===1?'p2':globalRank===2?'p3':'';
    const meCls   = entry.isMe ? (isLeading ? 'me leading' : 'me') : '';
    const refText = entry.refTime != null ? fmtTime(entry.refTime) : '—';
    const innerHTML = `
      <div class="tv-pos ${posCls}">${globalRank+1}</div>
      <div>
        <div class="tv-name">${entry.name}</div>
        <div class="tv-name-sub">${entry.sub}</div>
      </div>
      <div class="tv-time">${refText}</div>
      ${diffHTML}`;

    let row = existing[entry.key];
    if (!row) {
      row = document.createElement('div');
      row.dataset.key = entry.key;
      row.className = 'tv-row ' + meCls;
      row.style.top = newTop + 'px';
      row.style.opacity = '0';
      row.innerHTML = innerHTML;
      container.appendChild(row);
      requestAnimationFrame(() => { row.style.opacity = '1'; });
    } else {
      const oldTop = parseInt(row.style.top, 10) || 0;
      if (oldTop !== newTop) {
        if (entry.isMe) {
          row.classList.remove('flash-up','flash-down');
          void row.offsetWidth;
          row.classList.add(newTop < oldTop ? 'flash-up' : 'flash-down');
          setTimeout(() => row.classList.remove('flash-up','flash-down'), 900);
        }
        row.style.top = newTop + 'px';
      }
      row.className = 'tv-row ' + meCls;
      row.innerHTML = innerHTML;
    }
    delete existing[entry.key];
  });

  // Remove rows that no longer exist
  Object.values(existing).forEach(el => {
    el.style.opacity = '0';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 380);
  });
}

// ── TAP NEXT CP (from control bar) ────────────────
function tapNextCP() {
  if (!rs.running || rs.finished) return;
  if (rs.cpIdx < rs.cps.length) hitCP(rs.cpIdx);
}

function updateCPCtrlButton() {
  const btn = document.getElementById('btn-cp-tap');
  const nameEl = document.getElementById('btn-cp-name');
  if (!btn) return;
  const nextCp = rs.cps[rs.cpIdx];
  const showTap = rs.running && !rs.finished && nextCp;
  btn.style.display = showTap ? '' : 'none';
  if (nameEl && nextCp) nameEl.textContent = nextCp.name || ('CP '+(rs.cpIdx+1));
  // When all CPs done but not finished: show CÍLEM instead
  if (rs.running && !rs.finished && !nextCp && rs.cps.length > 0) {
    btn.style.display = '';
    btn.textContent = '🏁';
    btn.onclick = finishRide;
  } else if (showTap) {
    btn.onclick = tapNextCP;
    btn.innerHTML = `TAP ✓<br><span id="btn-cp-name" style="font-size:10px;opacity:0.8;font-weight:600;">${nextCp.name||'CP '+(rs.cpIdx+1)}</span>`;
  }
}

// ── HIT CHECKPOINT ────────────────────────────────
function hitCP(idx) {
  if (!rs.running || rs.cps[idx].hitTime!==null) return;
  const ms = performance.now() - rs.startTs;
  rs.cps[idx].hitTime = ms;
  rs.cps[idx].splitMs = idx===0 ? ms : (rs.cps[idx-1].hitTime!==null ? ms - rs.cps[idx-1].hitTime : null);
  rs.cpIdx = idx + 1;
  rs._tvLastUpdate = -1; // force immediate TV board refresh
  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
  toast(`✓ CP${idx+1}: ${fmtTime(ms)}`);
  showCpPulse();
  // K: Voice announcement
  speak(`Checkpoint ${idx + 1}, čas ${fmtTimeSpeech(ms)}`);
  // CP pulse animation on timer
  const timerEl = document.getElementById('timer-main');
  if (timerEl) {
    timerEl.classList.remove('cp-hit');
    void timerEl.offsetWidth; // reflow
    timerEl.classList.add('cp-hit');
    setTimeout(() => timerEl.classList.remove('cp-hit'), 900);
  }
  // Update progress marker to done
  const marker = document.querySelector(`#prog-markers .prog-cp-marker[data-km="${rs.cps[idx].km}"]`);
  if (marker) marker.classList.add('done');

  // Feature B: Split reveal overlay
  const cp = rs.cps[idx];
  const pbSplitMs = (() => {
    const recs = routes[viewIdx]?.records || [];
    if (!recs.length) return 0;
    const pbCps = recs[0].checkpoints || [];
    return pbCps[idx]?.splitMs || 0;
  })();
  showSplitOverlay(cp.name || `CP ${idx + 1}`, cp.splitMs, pbSplitMs);

  // Feature I: F1 split animation
  const pbSplitMs2 = (() => {
    const recs = routes[viewIdx]?.records || [];
    if (!recs.length) return 0;
    return (recs[0].checkpoints || [])[idx]?.splitMs || 0;
  })();
  showF1Split(cp.splitMs, pbSplitMs2, idx);

  // Feature E: Split record motivational message
  if (cp.splitMs && pbSplitMs > 0) {
    if (cp.splitMs < pbSplitMs) {
      setTimeout(() => showMotiMsg(`Split rekord na ${cp.name || 'CP'}! ⚡`, '#4CAF50'), 2300);
    }
  }

  renderRideCPs();
  renderTVBoard();
  updateCPCtrlButton();
}

function finishRide() {
  if (!rs.running) return;
  const ms = performance.now() - rs.startTs;
  rs.elapsed = ms; rs.running = false; rs.finished = true;
  rs._tvLastUpdate = -1;
  cancelAnimationFrame(rafId);
  document.getElementById('btn-sp').disabled = true;
  document.getElementById('sdot').className  = 'status-dot';
  document.getElementById('stxt').textContent = 'HOTOVO';
  document.getElementById('timer-main').classList.remove('running');
  document.getElementById('btn-rst').style.display = '';
  // Feature H: clear tints on finish
  const screenRideF = document.getElementById('screen-ride');
  if (screenRideF) { screenRideF.classList.remove('tint-ahead', 'tint-behind'); }
  // J: Release WakeLock
  releaseWakeLock();
  // K: Finish voice announcement
  speak(`Cíl! Celkový čas: ${fmtTimeSpeech(ms)}`);
  renderTVBoard();
  saveRecord(ms);
  setTimeout(()=>showResults(ms), 500);
}

function renderRideCPs() {
  const el = document.getElementById('ride-cps');
  const r  = routes[viewIdx];
  const cps = rs.cps;
  const pb  = r?.records?.length ? r.records[0] : null;

  // ── No checkpoints ──────────────────────────────
  if (!cps.length) {
    if (rs.running && !rs.finished) {
      el.innerHTML = `<div class="next-cp-focus done-all">
        <div class="ncf-num">🏁</div>
        <div class="ncf-body">
          <div class="ncf-name">Cíl je přímo před tebou!</div>
          <div class="ncf-km">Žádné checkpointy</div>
        </div>
        <button class="ncf-fin-btn" onclick="finishRide()">CÍLEM!<br>🏁</button>
      </div>`;
    } else {
      el.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:12px;">Žádné checkpointy</div>';
    }
    return;
  }

  const doneCps  = cps.filter(c => c.hitTime !== null);
  const nextIdx  = rs.cpIdx;           // index of next (not yet hit) CP
  const nextCp   = cps[nextIdx];       // undefined when all done
  const allDone  = nextIdx >= cps.length;
  const remaining = cps.length - doneCps.length;

  let html = '';

  // ── NEXT CP focus card ──────────────────────────
  if (!rs.finished) {
    if (allDone) {
      // All CPs hit, show FINISH button
      html += `<div class="next-cp-focus done-all">
        <div class="ncf-num">🏁</div>
        <div class="ncf-body">
          <div class="ncf-name">Všechny checkpointy splněny!</div>
          <div class="ncf-km">Dokončení jízdy</div>
        </div>
        ${rs.running ? `<button class="ncf-fin-btn" onclick="finishRide()">CÍLEM!<br>🏁</button>` : ''}
      </div>`;
    } else if (nextCp) {
      // Compare with PB split at this CP
      const pbCp = pb?.checkpoints?.[nextIdx];
      const pbSplitText = pbCp?.splitMs ? ` · PB: ${fmtTime(pbCp.splitMs)}` : '';
      html += `<div class="next-cp-focus">
        <div class="ncf-num">${nextIdx + 1}</div>
        <div class="ncf-body">
          <div class="ncf-name">${nextCp.name || 'Checkpoint ' + (nextIdx + 1)}</div>
          <div class="ncf-km">📏 ${nextCp.km.toFixed(2)} km${pbSplitText}</div>
          ${remaining > 1 ? `<div class="ncf-remaining">Zbývá: ${remaining} CP</div>` : ''}
        </div>
        ${rs.running ? `<button class="ncf-tap" onclick="hitCP(${nextIdx})">TAP<br>✓</button>` : ''}
      </div>`;
    }
  }

  // ── Past CPs (compact history) ──────────────────
  if (doneCps.length > 0) {
    html += `<div style="padding:4px 0 2px;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:var(--text3);margin-bottom:4px;">Splněné checkpointy</div>`;
    // Show in reverse order (most recent first)
    [...cps].reverse().forEach((cp, revI) => {
      const i = cps.length - 1 - revI;
      if (cp.hitTime === null) return;
      const pbCp = pb?.checkpoints?.[i];
      let diffHtml = '';
      if (pbCp?.hitTime != null) {
        const d = cp.hitTime - pbCp.hitTime;
        diffHtml = `<span style="font-size:10px;${d<=0?'color:var(--green)':'color:var(--red)'}">${d<=0?'▲':('▼+'+fmtTime(Math.abs(d)))}</span>`;
      }
      html += `<div class="cp-history-row">
        <div class="cp-hist-check">✓</div>
        <div class="cp-hist-name">${cp.name || 'CP '+(i+1)} <span style="font-size:10px;color:var(--text3)">${cp.km.toFixed(1)}km</span></div>
        <span class="cp-hist-time">${fmtTime(cp.hitTime)}</span>
        ${cp.splitMs ? `<span class="cp-hist-split">+${fmtTime(cp.splitMs)}</span>` : ''}
        ${diffHtml}
      </div>`;
    });
  }

  el.innerHTML = html;
}

// ── SAVE & RESULTS ────────────────────────────────
function saveRecord(ms) {
  const rec = {
    totalMs: ms,
    date: new Date().toISOString(),
    routeIdx: viewIdx,
    routeName: routes[viewIdx].name,
    checkpoints: rs.cps.map(c=>({ km:c.km, name:c.name, hitTime:c.hitTime, splitMs:c.splitMs }))
  };
  const r = routes[viewIdx];
  if (!r.records) r.records = [];
  r.records.push(rec);
  r.records.sort((a,b) => a.totalMs - b.totalMs);
  saveRoutes();
  // Track last used route
  localStorage.setItem('vt_last_route_idx', String(viewIdx));

  // PB/first ride detection
  const allTimes = r.records.map(rec2 => rec2.totalMs);
  const isNewPB = allTimes[0] === ms;
  if (allTimes.length === 1) {
    showAchievement('🎉', `První jízda na trase ${r.name}!`);
  } else if (isNewPB) {
    launchConfetti();
    showAchievement('🏆', `Nový osobní rekord na ${r.name}!`);
    starBurst(window.innerWidth/2, window.innerHeight/2);
  }

  // Check global achievements
  checkAchievements({ isNewPB, justFinishedAt: new Date() });
}

function showResults(ms) {
  showScreen('results');
  const r = routes[viewIdx];
  const pb = r.records[0];
  const thisRec = r.records.find(rec => rec.totalMs === ms);
  const isPB = pb.totalMs === ms;

  document.getElementById('res-route').textContent = r.name;
  document.getElementById('res-time').textContent = fmtTime(ms);

  const badge = document.getElementById('res-badge');
  if (isPB && r.records.length === 1) { badge.textContent = '🏆 První jízda na trase'; badge.className = 'res-badge badge-pb'; }
  else if (isPB) { badge.textContent = '🏆 Nový osobní rekord!'; badge.className = 'res-badge badge-pb'; }
  else { badge.textContent = `▼ +${fmtTime(ms-pb.totalMs)} za PB (${fmtTime(pb.totalMs)})`; badge.className = 'res-badge badge-nopb'; }

  // Splits — compare to previous best (excluding this ride if it's the PB)
  const pbForCompare = isPB ? (r.records[1] || null) : pb;
  const tbody = document.getElementById('splits-body');
  tbody.innerHTML = rs.cps.map((cp,i) => {
    const t  = cp.hitTime!=null ? fmtTime(cp.hitTime) : '—';
    const sp = cp.splitMs!=null ? fmtTime(cp.splitMs) : '—';
    let vs = '<span class="sp-none">—</span>';
    if (pbForCompare?.checkpoints?.[i]?.hitTime!=null && cp.hitTime!=null) {
      const d = cp.hitTime - pbForCompare.checkpoints[i].hitTime;
      vs = `<span class="${d<=0?'sp-fast':'sp-slow'}">${d<=0?'▲ ':'▼ +'}${fmtTime(Math.abs(d))}</span>`;
    }
    return `<tr>
      <td><div class="sp-name">${cp.name||'CP '+(i+1)}</div><div class="sp-km">${cp.km.toFixed(2)} km</div></td>
      <td>${t}</td><td>${sp}</td><td>${vs}</td>
    </tr>`;
  }).join('')
  + `<tr style="border-top:1px solid var(--glass-border);">
      <td><div class="sp-name" style="color:var(--blue);">🏁 Cíl</div></td>
      <td style="color:var(--blue);font-weight:700;">${fmtTime(ms)}</td>
      <td>—</td>
      <td>${pbForCompare?`<span class="${ms<=pbForCompare.totalMs?'sp-fast':'sp-slow'}">${ms<=pbForCompare.totalMs?'▲ -':'▼ +'}${fmtTime(Math.abs(ms-pbForCompare.totalMs))}</span>`:'<span class="sp-none">—</span>'}</td>
    </tr>`;

  renderLeaderboard('res-leaderboard', r);
  setTimeout(()=>drawElevation(r,'res-elev',120,true), 30);
}

function rideAgain() { startRide(); }
function resetRide()  { startRide(); }

// ── ABORT ─────────────────────────────────────────
function confirmAbort() {
  if (!rs.running && !rs.finished) { navTo('detail'); return; }
  document.getElementById('modal-abort').classList.add('open');
}
function abortRide() {
  closeModal('modal-abort');
  cancelAnimationFrame(rafId);
  releaseWakeLock();
  rs.running = false;
  // Feature H: clear tints on abort
  const screenRideA = document.getElementById('screen-ride');
  if (screenRideA) { screenRideA.classList.remove('tint-ahead', 'tint-behind'); }
  navTo('detail');
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ════════════════════════════════════════════════
//  STATS SCREEN
// ════════════════════════════════════════════════
function setStatsPeriod(p) {
  statsPeriod = p;
  document.querySelectorAll('.spt-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('spt-' + p).classList.add('active');
  renderStats();
}

function renderStats() {
  const stats = computeAggregateStats(statsPeriod);

  // Hero banner
  const heroKmEl = document.getElementById('stats-hero-km');
  if (heroKmEl) {
    heroKmEl.textContent = stats.totalKm >= 1000
      ? (stats.totalKm/1000).toFixed(2) + 'k'
      : stats.totalKm.toFixed(1);
    const ridesWord = stats.totalRides === 1 ? 'jízda' : stats.totalRides < 5 ? 'jízdy' : 'jízd';
    document.getElementById('stats-hero-sub').textContent =
      `${stats.totalRides} ${ridesWord} · ${fmtDuration(stats.totalMs)} na kole`;
    const heroWall = stats.allRides[0]?.route?.wallpaper || 'wall6';
    document.getElementById('stats-hero-bg').style.backgroundImage = `url(${wallpaperUrl(heroWall)})`;
  }

  document.getElementById('stats-overview').innerHTML = `
    <div class="so-card">
      <div class="so-ico">🚴</div>
      <div class="so-val">${stats.totalRides}</div>
      <div class="so-unit">${stats.totalRides===1?'jízda':stats.totalRides<5?'jízdy':'jízd'}</div>
      <div class="so-lbl">Celkem jízd</div>
    </div>
    <div class="so-card">
      <div class="so-ico">📏</div>
      <div class="so-val">${stats.totalKm.toFixed(1)}</div>
      <div class="so-unit">km</div>
      <div class="so-lbl">Vzdálenost</div>
    </div>
    <div class="so-card">
      <div class="so-ico">⏱</div>
      <div class="so-val">${fmtDuration(stats.totalMs)}</div>
      <div class="so-unit">h:mm</div>
      <div class="so-lbl">Čas na kole</div>
    </div>
    <div class="so-card">
      <div class="so-ico">⛰</div>
      <div class="so-val">${stats.totalElev}</div>
      <div class="so-unit">m</div>
      <div class="so-lbl">Nastoupáno</div>
    </div>
    <div class="so-card">
      <div class="so-ico">⚡</div>
      <div class="so-val">${stats.avgPace || '—'}</div>
      <div class="so-unit">min/km</div>
      <div class="so-lbl">Avg tempo</div>
    </div>
    <div class="so-card">
      <div class="so-ico">🏆</div>
      <div class="so-val">${stats.prCount}</div>
      <div class="so-unit">PR</div>
      <div class="so-lbl">Osobní rekordy</div>
    </div>`;

  // Extended stats: streak, PR, heat calendar, power curve, HR zones, weather
  const streak = computeStreak();
  const streakEl = document.getElementById('stats-streak');
  if (streakEl) {
    if (streak > 0) {
      streakEl.innerHTML = `<div class="streak-display">
        <div class="streak-fire">🔥</div>
        <div><div class="streak-num">${streak}</div><div class="streak-lbl">týdenní série</div></div>
        <div style="margin-left:auto;font-size:12px;color:var(--text2)">Jeď tento týden<br>pro udržení série!</div>
      </div>`;
    } else {
      streakEl.innerHTML = '';
    }
  }

  renderMonthlyGoalWidget('stats-monthly-goal');
  renderPersonalRecords('stats-pr');
  renderHeatCalendar('stats-heat');
  renderAchievements('stats-achievements');
  renderPowerCurve('stats-power');
  renderHRZones('stats-hrz');
  renderWeatherWidget('stats-weather');

  // Chart
  setTimeout(() => drawStatsChart(stats.timeline), 30);

  // History list
  const hist = document.getElementById('history-list');
  if (!stats.allRides.length) {
    hist.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Žádné jízdy</div><div class="empty-sub">V tomto období jsi ještě nejel.</div></div>';
    return;
  }
  hist.innerHTML = stats.allRides.slice(0,50).map(rd => {
    const date = new Date(rd.date).toLocaleDateString('cs-CZ',{day:'2-digit',month:'2-digit',year:'2-digit'});
    const wall = wallpaperUrl(rd.route.wallpaper || DEFAULT_WALL);
    const medal = rd.position === 1 ? '🥇' : rd.position === 2 ? '🥈' : rd.position === 3 ? '🥉' : '';
    return `<div class="hist-item" onclick="openDetail(${rd.routeIdx})">
      <div class="hist-thumb" style="background-image:url(${wall})"></div>
      <div class="hist-info">
        <div class="hist-route">${rd.route.name}</div>
        <div class="hist-date">${date} · ${(rd.route.totalDist||0).toFixed(1)} km</div>
      </div>
      <div style="text-align:right;">
        <div class="hist-time">${fmtTime(rd.totalMs)}</div>
        <div class="hist-medal">${medal}</div>
      </div>
    </div>`;
  }).join('');
}

function computeAggregateStats(period) {
  const now = Date.now();
  const periods = {
    week:  7*24*3600*1000,
    month: 30*24*3600*1000,
    year:  365*24*3600*1000,
    all:   Infinity
  };
  const cutoff = period === 'all' ? 0 : now - periods[period];

  let allRides = [];
  routes.forEach((r, ri) => {
    (r.records||[]).forEach(rec => {
      if (new Date(rec.date).getTime() >= cutoff) {
        // Find position of this ride in the route's leaderboard
        const sorted = [...r.records].sort((a,b)=>a.totalMs-b.totalMs);
        const pos = sorted.findIndex(x => x === rec) + 1;
        allRides.push({ ...rec, route: r, routeIdx: ri, position: pos });
      }
    });
  });
  allRides.sort((a,b) => new Date(b.date) - new Date(a.date));

  const totalRides = allRides.length;
  const totalKm = allRides.reduce((s,r) => s + (r.route.totalDist||0), 0);
  const totalMs = allRides.reduce((s,r) => s + r.totalMs, 0);
  const totalElev = Math.round(allRides.reduce((s,r) => s + (r.route.totalElev||0), 0));
  const prCount = allRides.filter(r => r.position === 1).length;
  const avgPaceMin = totalKm > 0 ? (totalMs/1000/60)/totalKm : 0;
  const avgPace = avgPaceMin > 0 ? fmtPace(avgPaceMin) : null;

  // Timeline: km per day for chart
  const timeline = buildTimeline(allRides, period);

  return { totalRides, totalKm, totalMs, totalElev, prCount, avgPace, allRides, timeline };
}

function buildTimeline(rides, period) {
  if (!rides.length) return [];
  const now = new Date();
  let days, granularity;
  if (period === 'week')      { days = 7;   granularity = 'day'; }
  else if (period === 'month'){ days = 30;  granularity = 'day'; }
  else if (period === 'year') { days = 12;  granularity = 'month'; }
  else                        { days = 12;  granularity = 'month'; }

  const buckets = new Array(days).fill(0);
  const labels  = new Array(days).fill('');

  for (let i=0;i<days;i++) {
    const idx = days-1-i;
    const d = new Date(now);
    if (granularity === 'day') {
      d.setDate(d.getDate() - i);
      labels[idx] = d.getDate() + '.' + (d.getMonth()+1) + '.';
    } else {
      d.setMonth(d.getMonth() - i);
      labels[idx] = (d.getMonth()+1) + '/' + (d.getFullYear()%100);
    }
  }

  rides.forEach(r => {
    const rd = new Date(r.date);
    const diffMs = now - rd;
    let bucketIdx;
    if (granularity === 'day') {
      const diffDays = Math.floor(diffMs / (24*3600*1000));
      bucketIdx = days - 1 - diffDays;
    } else {
      const diffMonths = (now.getFullYear()-rd.getFullYear())*12 + (now.getMonth()-rd.getMonth());
      bucketIdx = days - 1 - diffMonths;
    }
    if (bucketIdx >= 0 && bucketIdx < days) {
      buckets[bucketIdx] += (r.route.totalDist||0);
    }
  });
  return { buckets, labels };
}

function drawStatsChart(tl) {
  const c = document.getElementById('stats-chart');
  if (!c || !tl || !tl.buckets) return;
  const W = c.parentElement.offsetWidth || 340;
  c.width = W;
  c.height = 160;
  const ctx = c.getContext('2d');
  const data = tl.buckets;
  const labels = tl.labels;
  const max = Math.max(...data, 1);
  const pad = { t:10, b:30, l:8, r:8 };
  const w2 = W - pad.l - pad.r;
  const h2 = 160 - pad.t - pad.b;
  const barW = w2 / data.length;

  ctx.clearRect(0,0,W,160);
  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  for (let i=0;i<=3;i++) {
    const y = pad.t + (h2/3)*i;
    ctx.moveTo(pad.l, y); ctx.lineTo(W-pad.r, y);
  }
  ctx.stroke();

  // Bars
  data.forEach((v,i) => {
    const h = max>0 ? (v/max)*h2 : 0;
    const x = pad.l + i*barW + 3;
    const y = pad.t + h2 - h;
    const bw = barW - 6;
    if (h > 0) {
      const grd = ctx.createLinearGradient(0,y,0,y+h);
      grd.addColorStop(0, '#4d9fff');
      grd.addColorStop(1, 'rgba(77,159,255,0.3)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      const r = Math.min(4, bw/2);
      ctx.roundRect(x, y, bw, h, [r,r,0,0]);
      ctx.fill();
    }
    // Label every nth
    if (data.length <= 12 || i%Math.ceil(data.length/8)===0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x+bw/2, 160-10);
    }
  });

  // Max label
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(max.toFixed(0)+' km', pad.l+2, pad.t+10);
}

// ════════════════════════════════════════════════
//  EXPORT / IMPORT
// ════════════════════════════════════════════════
function exportData() {
  closeDrawer();
  const blob = new Blob([JSON.stringify(routes, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `velotimer-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 100);
  toast('💾 Data exportována');
}

function importData(inp) {
  closeDrawer();
  const f = inp.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Neplatný formát');
      routes = data;
      saveRoutes();
      toast(`✅ Importováno ${data.length} tras`);
      navTo('home');
    } catch(err) { toast('❌ ' + err.message); }
  };
  rd.readAsText(f);
  inp.value = '';
}

// ════════════════════════════════════════════════
//  ELEVATION CHART
// ════════════════════════════════════════════════
function drawElevation(route, canvasId, h, showGradient) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !route?.elevPoints?.length) return;
  const W = canvas.parentElement?.offsetWidth || 340;
  canvas.width = W; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const pts = route.elevPoints;
  const maxD = route.totalDist || pts[pts.length-1].dist || 1;
  const eles = pts.map(p=>p.ele);
  const minE = Math.min(...eles);
  const maxE = Math.max(...eles);
  const rngE = maxE - minE || 1;
  const pad = { t:14, b:22, l:8, r:8 };
  const W2 = W - pad.l - pad.r;
  const H2 = h - pad.t - pad.b;
  const px = d => pad.l + (d/maxD)*W2;
  const py = e => pad.t + H2 - ((e-minE)/rngE)*H2;
  ctx.clearRect(0,0,W,h);

  if (showGradient && pts.length > 1) {
    for (let i=1;i<pts.length;i++) {
      const slope = ((pts[i].ele-pts[i-1].ele)/((( pts[i].dist-pts[i-1].dist)||0.001)*1000))*100;
      const col = slopeColor(slope);
      const grd = ctx.createLinearGradient(0, py(pts[i-1].ele), 0, h-pad.b);
      grd.addColorStop(0, col+'AA');
      grd.addColorStop(1, col+'15');
      ctx.beginPath();
      ctx.moveTo(px(pts[i-1].dist), py(pts[i-1].ele));
      ctx.lineTo(px(pts[i].dist),   py(pts[i].ele));
      ctx.lineTo(px(pts[i].dist),   h-pad.b);
      ctx.lineTo(px(pts[i-1].dist), h-pad.b);
      ctx.closePath();
      ctx.fillStyle = grd;
      ctx.fill();
    }
  } else {
    const grd = ctx.createLinearGradient(0,pad.t,0,h-pad.b);
    grd.addColorStop(0,'rgba(77,159,255,0.4)');
    grd.addColorStop(1,'rgba(77,159,255,0.05)');
    ctx.beginPath();
    ctx.moveTo(px(pts[0].dist),py(pts[0].ele));
    pts.forEach(p=>ctx.lineTo(px(p.dist),py(p.ele)));
    ctx.lineTo(px(pts[pts.length-1].dist), h-pad.b);
    ctx.lineTo(px(pts[0].dist), h-pad.b);
    ctx.closePath();
    ctx.fillStyle = grd; ctx.fill();
  }

  // Line
  ctx.beginPath();
  ctx.moveTo(px(pts[0].dist), py(pts[0].ele));
  pts.forEach(p => ctx.lineTo(px(p.dist), py(p.ele)));
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.stroke();

  // Checkpoint markers
  if (showGradient) {
    (route.checkpoints||[]).forEach((cp,i) => {
      const x = px(cp.km);
      const y = py(elevAtKm(pts, cp.km));
      ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2);
      ctx.fillStyle = '#4d9fff'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      // Number label above
      ctx.fillStyle = '#fff';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(i+1, x, y-10);
    });
  }

  // Labels
  ctx.fillStyle = '#94a3b8'; ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign='left';  ctx.fillText(Math.round(minE)+'m', pad.l+2, h-6);
  ctx.textAlign='right'; ctx.fillText(Math.round(maxE)+'m', W-pad.r-2, pad.t+10);
  ctx.textAlign='right'; ctx.fillText(maxD.toFixed(1)+' km', W-pad.r-2, h-6);
}

function slopeColor(slope) {
  if (slope <= 0)   return '#4d9fff';
  if (slope < 3)    return '#3ddc84';
  if (slope < 6)    return '#b8e840';
  if (slope < 9)    return '#ffc857';
  if (slope < 12)   return '#ff7a3d';
  return '#ff5566';
}

function elevAtKm(pts, km) {
  for (let i=1;i<pts.length;i++) if (pts[i].dist >= km) return pts[i].ele;
  return pts[pts.length-1]?.ele || 0;
}

// ════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════
function genElevation(dist, elev, desc, base) {
  const N = 120, pts = [];
  for (let i=0;i<=N;i++) {
    const t = i/N;
    const d = dist*t;
    const e = base + elev*Math.sin(t*Math.PI*0.9+0.1) - desc*(t*t*0.3);
    pts.push({ dist:d, ele: Math.max(base-20, e) });
  }
  return pts;
}

function fmtTime(ms, noH) {
  if (ms == null || isNaN(ms)) return '—';
  const ts = Math.floor(Math.abs(ms)/1000);
  const h = Math.floor(ts/3600);
  const m = Math.floor((ts%3600)/60);
  const s = ts%60;
  if (h > 0 && !noH) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function fmtDuration(ms) {
  if (!ms) return '0:00';
  const totalMin = Math.floor(ms/60000);
  const h = Math.floor(totalMin/60);
  const m = totalMin % 60;
  if (h === 0) return `0:${String(m).padStart(2,'0')}`;
  return `${h}:${String(m).padStart(2,'0')}`;
}

function fmtPace(mPerKm) {
  const m = Math.floor(mPerKm);
  const s = Math.round((mPerKm-m)*60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function haversine(la1,lo1,la2,lo2) {
  const R = 6371;
  const dr = (la2-la1)*Math.PI/180;
  const dg = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dr/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dg/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function downsample(arr, n) {
  if (arr.length <= n) return arr;
  const s = arr.length/n, out = [];
  for (let i=0;i<n;i++) out.push(arr[Math.floor(i*s)]);
  return out;
}

// toast() is defined in ANIMATION UTILITIES section above

function saveRoutes() { localStorage.setItem('vt_routes', JSON.stringify(routes)); }

// Polyfill for roundRect on older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
    if (typeof r === 'number') r = [r,r,r,r];
    if (Array.isArray(r) && r.length === 4) {
      this.beginPath();
      this.moveTo(x+r[0], y);
      this.lineTo(x+w-r[1], y);
      this.quadraticCurveTo(x+w, y, x+w, y+r[1]);
      this.lineTo(x+w, y+h-r[2]);
      this.quadraticCurveTo(x+w, y+h, x+w-r[2], y+h);
      this.lineTo(x+r[3], y+h);
      this.quadraticCurveTo(x, y+h, x, y+h-r[3]);
      this.lineTo(x, y+r[0]);
      this.quadraticCurveTo(x, y, x+r[0], y);
      this.closePath();
    }
    return this;
  };
}

// ════════════════════════════════════════════════
//  ANIMATION UTILITIES
// ════════════════════════════════════════════════

// ── Ripple effect ────────────────────────────────
function addRipple(e) {
  const btn = e.currentTarget;
  const circle = document.createElement('span');
  const diameter = Math.max(btn.clientWidth, btn.clientHeight);
  const radius = diameter / 2;
  const rect = btn.getBoundingClientRect();
  circle.style.cssText = `width:${diameter}px;height:${diameter}px;left:${e.clientX - rect.left - radius}px;top:${e.clientY - rect.top - radius}px`;
  circle.classList.add('ripple');
  btn.querySelector('.ripple')?.remove();
  btn.appendChild(circle);
}

// ── Toast (slide from right) ──────────────────────
function toast(msg, duration = 2800) {
  let el = document.getElementById('toast-el');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-el';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), duration);
}

// ── Confetti ─────────────────────────────────────
function launchConfetti(duration = 3000) {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F'];
  const particles = Array.from({length: 120}, () => ({
    x: Math.random() * canvas.width,
    y: -10,
    r: Math.random() * 6 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 4 + 2,
    rot: Math.random() * 360,
    rotV: (Math.random() - 0.5) * 10,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  }));
  const start = Date.now();
  function frame() {
    if (Date.now() - start > duration) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.rotV; p.vy += 0.05;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI/180);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2); ctx.fill(); }
      else { ctx.fillRect(-p.r, -p.r/2, p.r*2, p.r); }
      ctx.restore();
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── Achievement popup ─────────────────────────────
function showAchievement(icon, text) {
  const popup = document.getElementById('achievement-popup');
  if (!popup) return;
  document.getElementById('ach-icon').textContent = icon;
  document.getElementById('ach-text').textContent = text;
  popup.classList.add('show');
  setTimeout(() => popup.classList.remove('show'), 3500);
}

// ── Star burst on save ────────────────────────────
function starBurst(x, y) {
  const container = document.createElement('div');
  container.className = 'star-burst';
  container.style.cssText = `left:${x}px;top:${y}px`;
  const colors = ['#FFD700','#FF6B6B','#4ECDC4','#96CEB4','#DDA0DD'];
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('div');
    p.className = 'star-particle';
    const angle = (i / 10) * Math.PI * 2;
    const dist = 40 + Math.random() * 40;
    p.style.cssText = `background:${colors[i%colors.length]};--dx:${Math.cos(angle)*dist}px;--dy:${Math.sin(angle)*dist}px`;
    container.appendChild(p);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 900);
}

// ── Checkpoint pulse overlay ──────────────────────
function showCpPulse() {
  const el = document.createElement('div');
  el.className = 'cp-pulse-ring';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

// ── Count-up animation ────────────────────────────
function animateCountUp(el, target, duration = 800) {
  const start = parseFloat(el.textContent) || 0;
  const startTime = performance.now();
  function update(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const current = start + (target - start) * ease;
    el.textContent = Number.isInteger(target) ? Math.round(current) : current.toFixed(1);
    if (t < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── Digit-flip timer ──────────────────────────────
let _flipDigits = {};  // track per-digit current values

function initFlipClock(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="flip-clock">
      <div class="flip-digit" id="fd-h1"><div class="flip-card">0</div></div>
      <div class="flip-digit" id="fd-h2"><div class="flip-card">0</div></div>
      <div class="flip-sep">:</div>
      <div class="flip-digit" id="fd-m1"><div class="flip-card">0</div></div>
      <div class="flip-digit" id="fd-m2"><div class="flip-card">0</div></div>
      <div class="flip-sep">:</div>
      <div class="flip-digit" id="fd-s1"><div class="flip-card">0</div></div>
      <div class="flip-digit" id="fd-s2"><div class="flip-card">0</div></div>
    </div>`;
}

function updateFlipClock(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const digits = [
    ['fd-h1', Math.floor(h/10)],
    ['fd-h2', h%10],
    ['fd-m1', Math.floor(m/10)],
    ['fd-m2', m%10],
    ['fd-s1', Math.floor(s/10)],
    ['fd-s2', s%10],
  ];
  digits.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const card = el.querySelector('.flip-card');
    if (!card) return;
    if (_flipDigits[id] !== val) {
      _flipDigits[id] = val;
      el.classList.remove('flipping');
      void el.offsetWidth;
      el.classList.add('flipping');
      card.textContent = val;
      setTimeout(() => el.classList.remove('flipping'), 260);
    }
  });
}

// ── Sparkline SVG ──────────────────────────────────
function renderSparkline(container, values, color = '#4B9EFF') {
  if (!values || values.length < 2) { container.innerHTML = ''; return; }
  const W = 80, H = 22;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(' ');
  container.innerHTML = `<svg class="route-sparkline" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
  </svg>`;
}

// ── Gauge SVG ────────────────────────────────────
function renderGauge(container, value, max, unit, color = '#4B9EFF') {
  const pct = Math.min(value / max, 1);
  const angle = pct * 180;
  const r = 36, cx = 44, cy = 44;
  const startAngle = -Math.PI;
  const endAngle = startAngle + (angle / 180) * Math.PI;
  const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle);
  const largeArc = angle > 180 ? 1 : 0;
  container.innerHTML = `<div class="gauge-wrap">
    <svg class="gauge-svg" width="88" height="50" viewBox="0 0 88 50">
      <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="5" stroke-linecap="round"/>
      <path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="white" font-size="13" font-weight="800" font-family="monospace">${value}</text>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="8">${unit}</text>
    </svg>
  </div>`;
}

// ── Elevation profile SVG ─────────────────────────
function renderElevationProfile(containerId, svgId, altitudes, distances) {
  const wrap = document.getElementById(containerId);
  const svg = document.getElementById(svgId);
  if (!wrap || !svg || !altitudes?.length) return;

  wrap.style.display = 'block';
  const W = 300, H = 80;
  const minA = Math.min(...altitudes), maxA = Math.max(...altitudes);
  const range = maxA - minA || 1;
  const maxD = distances ? Math.max(...distances) : altitudes.length - 1;

  const pts = altitudes.map((a, i) => {
    const x = ((distances ? distances[i] : i) / maxD) * W;
    const y = H - ((a - minA) / range) * (H - 10) - 5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = 'M ' + pts.join(' L ');
  const fillD = pathD + ` L ${W},${H} L 0,${H} Z`;
  const pathLen = altitudes.length * (W / altitudes.length) * 1.2;

  svg.innerHTML = `
    <defs>
      <linearGradient id="elev-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4B9EFF" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#4B9EFF" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <path d="${fillD}" fill="url(#elev-grad)" class="elev-fill"/>
    <path d="${pathD}" class="elev-path" stroke-dasharray="${pathLen}" stroke-dashoffset="${pathLen}"/>
    <text x="2" y="12" class="elev-label">${Math.round(maxA)}m</text>
    <text x="2" y="${H - 2}" class="elev-label">${Math.round(minA)}m</text>
  `;

  const path = svg.querySelector('.elev-path');
  if (path) {
    path.style.animation = 'none';
    void path.offsetWidth;
    path.style.animation = '';
  }
}

// ── Feature B: Split reveal overlay ──────────────
function showSplitOverlay(cpName, splitMs, ghostSplitMs) {
  const ov = document.getElementById('split-overlay');
  if (!ov) return;
  document.getElementById('sov-cp').textContent = cpName;
  document.getElementById('sov-time').textContent = fmtTime(splitMs);

  const deltaEl = document.getElementById('sov-delta');
  const r = routes[viewIdx];
  const recs = r?.records || [];

  if (ghostSplitMs && ghostSplitMs > 0) {
    const delta = splitMs - ghostSplitMs;
    const sign = delta > 0 ? '+' : '';
    deltaEl.textContent = `${sign}${fmtTime(Math.abs(delta))} vs PB`;
    deltaEl.className = 'split-overlay-delta ' + (delta > 0 ? 'behind' : 'ahead');
    document.getElementById('sov-time').style.color = delta > 0 ? '#FF5566' : '#4CAF50';
  } else {
    deltaEl.textContent = 'První čas!';
    deltaEl.className = 'split-overlay-delta ahead';
    document.getElementById('sov-time').style.color = '#FFD700';
  }

  const rankEl = document.getElementById('sov-rank');
  if (recs.length > 0) {
    rankEl.textContent = `Jízda ${recs.length + 1} na trase`;
  } else {
    rankEl.textContent = 'První jízda na trase!';
  }

  ov.classList.add('show');
  clearTimeout(ov._t);
  ov._t = setTimeout(() => ov.classList.remove('show'), 2200);
}

// ── Feature E: Motivational messages ─────────────
function showMotiMsg(text, color = '#FFD700') {
  document.querySelectorAll('.moti-msg').forEach(el => el.remove());
  const el = document.createElement('div');
  el.className = 'moti-msg';
  el.style.color = color;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function checkMotiMessages(elapsed, cpsDone, totalCps, pctProgress) {
  if (!rs.running || rs.finished) return;

  const isAhead = ghostPbMs > 0 && elapsed < ghostPbMs * (pctProgress / 100);
  const stateKey = isAhead ? 'ahead' : 'behind';

  if (_motiLastState !== null && _motiLastState !== stateKey) {
    if (isAhead) {
      showMotiMsg('Nabiráš náskok! 🔥', '#4CAF50');
    } else {
      showMotiMsg('Zrychluj — ztrácíš! 💨', '#FF5566');
    }
  }
  _motiLastState = stateKey;

  // Halfway milestone
  if (_motiLastPct < 50 && pctProgress >= 50) {
    setTimeout(() => showMotiMsg('Polovina za tebou! 💪', '#4B9EFF'), 500);
  }

  // PB in reach (within 5 seconds)
  if (ghostPbMs > 0 && isAhead) {
    const gap = ghostPbMs * (pctProgress / 100) - elapsed;
    if (gap < 5000 && gap > 0 && _motiLastPct >= pctProgress - 2) {
      showMotiMsg('PB v dosahu! 🏆', '#FFD700');
    }
  }

  _motiLastPct = pctProgress;
}

// ── Feature F: Elevation dot on ride canvas ───────
function drawRideElevation() {
  const canvas = document.getElementById('ride-elev');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.offsetWidth || 300;
  const H = canvas.height = 90;
  ctx.clearRect(0, 0, W, H);

  const r = routes[viewIdx];
  if (!r) return;

  const altitudes = r.elevProfile?.altitude;
  const distances = r.elevProfile?.distance;

  if (!altitudes || altitudes.length < 2) {
    // Fall back to elevPoints-based drawing with live position
    if (r.elevPoints && r.elevPoints.length >= 2) {
      const pts = r.elevPoints;
      const maxD = r.totalDist || pts[pts.length-1].dist || 1;
      const eles = pts.map(p => p.ele);
      const minE = Math.min(...eles), maxE = Math.max(...eles);
      const rngE = maxE - minE || 1;
      const pad = { t:8, b:8, l:4, r:4 };
      const W2 = W - pad.l - pad.r;
      const H2 = H - pad.t - pad.b;
      const px = d => pad.l + (d / maxD) * W2;
      const py = e => pad.t + H2 - ((e - minE) / rngE) * H2;

      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(75,158,255,0.35)');
      grad.addColorStop(1, 'rgba(75,158,255,0.05)');
      ctx.beginPath();
      ctx.moveTo(px(pts[0].dist), py(pts[0].ele));
      pts.forEach(p => ctx.lineTo(px(p.dist), py(p.ele)));
      ctx.lineTo(px(pts[pts.length-1].dist), H);
      ctx.lineTo(px(pts[0].dist), H);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(px(p.dist), py(p.ele)) : ctx.lineTo(px(p.dist), py(p.ele)));
      ctx.strokeStyle = '#4B9EFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Live position dot
      const cpsDone = rs.cps.filter(c => c.hitTime != null).length;
      const totalCps = rs.cps.length;
      const fraction = totalCps > 0 ? cpsDone / (totalCps + 1) : (rs.elapsed / (ghostPbMs || 1));
      const posD = Math.min(fraction * maxD, maxD);
      const posX = px(posD);
      let posY = py(pts[pts.length-1].ele);
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].dist >= posD) { posY = py(pts[i].ele); break; }
      }

      ctx.shadowBlur = 12;
      ctx.shadowColor = '#4CAF50';
      ctx.beginPath();
      ctx.arc(posX, posY, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#4CAF50';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(posX, posY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    } else {
      // No data — draw minimal indicator
      ctx.fillStyle = 'rgba(75,158,255,0.08)';
      ctx.fillRect(0, H * 0.6, W, H * 0.4);
      if (r.elevM || r.totalElev) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '11px monospace';
        ctx.fillText(`+${r.elevM || r.totalElev || 0}m`, 8, H - 8);
      }
    }
    return;
  }

  // Draw from Strava elevation profile streams
  const minA = Math.min(...altitudes), maxA = Math.max(...altitudes);
  const range = maxA - minA || 1;
  const maxD = distances ? Math.max(...distances) : altitudes.length - 1;

  const toX = (i) => ((distances ? distances[i] : i) / maxD) * W;
  const toY = (a) => H - 8 - ((a - minA) / range) * (H - 20);

  ctx.beginPath();
  ctx.moveTo(0, H);
  altitudes.forEach((a, i) => ctx.lineTo(toX(i), toY(a)));
  ctx.lineTo(W, H);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(75,158,255,0.35)');
  grad.addColorStop(1, 'rgba(75,158,255,0.05)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  altitudes.forEach((a, i) => i === 0 ? ctx.moveTo(toX(i), toY(a)) : ctx.lineTo(toX(i), toY(a)));
  ctx.strokeStyle = '#4B9EFF';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Live position dot
  const cpsDone = rs.cps.filter(c => c.hitTime != null).length;
  const totalCps = rs.cps.length;
  const fraction = totalCps > 0 ? cpsDone / (totalCps + 1) : (rs.elapsed / (ghostPbMs || 1));
  const posX = Math.min(fraction * W, W - 4);
  const altIdx = Math.min(Math.floor(fraction * altitudes.length), altitudes.length - 1);
  const posY = toY(altitudes[altIdx]);

  ctx.shadowBlur = 12;
  ctx.shadowColor = '#4CAF50';
  ctx.beginPath();
  ctx.arc(posX, posY, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#4CAF50';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(posX, posY, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '9px monospace';
  ctx.fillText(`${Math.round(maxA)}m`, 4, 14);
  ctx.fillText(`${Math.round(minA)}m`, 4, H - 4);
}

// ── Feature I: F1-style split animation ──────────
function showF1Split(splitMs, ghostSplitMs, cpIdx) {
  const el = document.createElement('div');
  el.className = 'f1-split-fly';

  const cpRow = document.getElementById(`cp-row-${cpIdx}`);
  const startY = cpRow ? cpRow.getBoundingClientRect().top : window.innerHeight * 0.6;
  el.style.left = '50%';
  el.style.bottom = `${window.innerHeight - startY}px`;

  if (ghostSplitMs > 0) {
    const delta = splitMs - ghostSplitMs;
    const sign = delta > 0 ? '+' : '';
    el.textContent = `${sign}${fmtTime(Math.abs(delta))}`;
    el.classList.add(delta > 0 ? 'behind' : 'ahead');
  } else {
    el.textContent = fmtTime(splitMs);
    el.classList.add('ahead');
  }

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}

// ── Feature G: Landscape / Race mode toggle ───────
function toggleRaceMode() {
  _raceModeForced = !_raceModeForced;
  const layout = document.getElementById('ride-race-layout');
  if (layout) {
    layout.style.cssText = _raceModeForced
      ? 'display:grid;grid-template-columns:1fr 1fr;height:calc(100vh - 52px);overflow:hidden'
      : '';
  }
  const btn = document.getElementById('race-mode-btn');
  if (btn) btn.style.opacity = _raceModeForced ? '1' : '0.5';
}

// ── Ghost timer update ────────────────────────────
function updateGhostBar(elapsedMs) {
  const bar = document.getElementById('ghost-bar');
  const deltaEl = document.getElementById('ghost-delta');
  if (!bar || !deltaEl || ghostPbMs <= 0) { if(bar) bar.style.display='none'; return; }
  bar.style.display = 'flex';
  const pbTimeEl = document.getElementById('ghost-pb-time');
  if (pbTimeEl) pbTimeEl.textContent = 'PB ' + fmtTime(ghostPbMs);
  const delta = elapsedMs - ghostPbMs;
  const sign = delta > 0 ? '+' : '';
  deltaEl.textContent = sign + fmtTime(Math.abs(delta));
  deltaEl.className = 'ride-meta-val ' + (delta > 0 ? 'behind' : 'ahead');
}

// ── Tablet sidebar update ─────────────────────────
function updateSidebar() {
  if (window.innerWidth < 768) return;
  const stats = computeAggregateStats('all');
  const ridesEl = document.getElementById('sb-rides');
  const kmEl = document.getElementById('sb-km');
  const routEl = document.getElementById('sb-routes');
  if (ridesEl) animateCountUp(ridesEl, stats.totalRides);
  if (kmEl) animateCountUp(kmEl, Math.round(stats.totalKm));
  if (routEl) animateCountUp(routEl, routes.length);

  ['home','stats','add','strava','garage','training','settings'].forEach(name => {
    const el = document.getElementById(`sb-nav-${name}`);
    if (el) el.classList.toggle('active', curScreen === name || (name === 'home' && (curScreen === 'splash' || curScreen === 'home')));
  });

  const list = document.getElementById('sidebar-routes-list');
  if (!list) return;
  list.innerHTML = routes.map((r,i) => `
    <div class="sidebar-route-item ${viewIdx === i ? 'active' : ''}" onclick="viewIdx=${i};navTo('detail')">
      <div class="sidebar-route-dot" style="background:${['#4B9EFF','#FF6B6B','#4CAF50','#FFD700','#DDA0DD','#4ECDC4'][i%6]}"></div>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.name)}</span>
      <span style="font-size:10px;color:var(--text3);font-family:var(--mono)">${(r.totalDist||0).toFixed(0)}km</span>
    </div>
  `).join('');
}

// ── Card flip ─────────────────────────────────────
function toggleCardFlip(idx) {
  const card = document.getElementById(`route-card-${idx}`);
  if (!card) return;
  card.classList.toggle('flipped');
}

// ════════════════════════════════════════════════
//  STRAVA INTEGRATION
// ════════════════════════════════════════════════

// Called once on app start — check if Strava is linked, update UI
async function checkStravaOnStart() {
  if (!STRAVA_WORKER_URL || STRAVA_WORKER_URL.includes('YOUR_SUBDOMAIN')) return;
  // Handle OAuth redirect return (?strava=connected or ?strava=error)
  const params = new URLSearchParams(location.search);
  if (params.get('strava') === 'connected') {
    history.replaceState({}, '', location.pathname);
    toast('✅ Strava připojena!');
  } else if (params.get('strava') === 'error') {
    history.replaceState({}, '', location.pathname);
    toast('❌ Strava připojení selhalo');
  }
  try {
    const res = await fetch(`${STRAVA_WORKER_URL}/auth/status`);
    const data = await res.json();
    stravaConnected = data.connected;
    updateStravaDrawerItem(data);
    if (data.connected) {
      // Silently check for new activities (don't block startup)
      checkNewStravaActivities();
    }
  } catch (e) {
    // Worker unreachable — ignore silently
    console.warn('Strava worker unreachable:', e.message);
  }
}

function updateStravaDrawerItem(status) {
  const el = document.getElementById('strava-drawer-item');
  if (!el) return;
  if (status.connected) {
    el.innerHTML = `<span class="di-ico">🟠</span> Strava · ${status.athleteName || 'Připojeno'}<span class="di-badge">✓</span>`;
  } else {
    el.innerHTML = `<span class="di-ico">🟠</span> Připojit Strava`;
  }
}

function openStravaConnect() {
  closeDrawer();
  if (stravaConnected) {
    navTo('strava');
  } else {
    window.location.href = `${STRAVA_WORKER_URL}/auth/login`;
  }
}

async function disconnectStrava() {
  try {
    await fetch(`${STRAVA_WORKER_URL}/auth/logout`, { method: 'DELETE' });
  } catch(e) {}
  stravaConnected = false;
  updateStravaDrawerItem({ connected: false });
  toast('Strava odpojena');
  navTo('home');
}

// Check for Strava activities newer than the most recent imported one
async function checkNewStravaActivities() {
  try {
    const res  = await fetch(`${STRAVA_WORKER_URL}/api/activities?per_page=20`);
    const data = await res.json();
    if (!data.activities?.length) return;
    const imported = getImportedStravaIds();
    const newOnes  = data.activities.filter(a => !imported.has(String(a.id)));
    if (newOnes.length > 0) {
      // Show badge on Strava drawer item
      const el = document.getElementById('strava-drawer-item');
      if (el) {
        const badge = el.querySelector('.di-badge');
        if (badge) badge.textContent = `${newOnes.length} nových`;
      }
      toast(`🟠 ${newOnes.length} nových Strava jízd k importu`);
    }
  } catch(e) {
    console.warn('Strava sync check failed:', e.message);
  }
}

function getImportedStravaIds() {
  const ids = new Set();
  routes.forEach(r => {
    (r.records || []).forEach(rec => {
      if (rec.stravaId) ids.add(String(rec.stravaId));
    });
  });
  return ids;
}

async function renderStravaScreen() {
  const screen = document.getElementById('screen-strava');
  const content = document.getElementById('strava-content');
  if (!content) return;
  content.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--text2)">⏳ Načítám aktivity…</div>`;
  showScreen('strava');

  if (!stravaConnected) {
    content.innerHTML = `
      <div style="padding:40px 20px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">🟠</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Strava není připojena</div>
        <div style="font-size:14px;color:var(--text2);margin-bottom:24px;">Připoj svůj Strava účet pro import jízd</div>
        <button class="btn btn-blue btn-lg" onclick="window.location.href='${STRAVA_WORKER_URL}/auth/login'">Připojit Strava</button>
      </div>`;
    return;
  }

  try {
    const res  = await fetch(`${STRAVA_WORKER_URL}/api/activities?per_page=30`);
    const data = await res.json();
    if (data.error === 'not_authenticated') {
      stravaConnected = false;
      renderStravaScreen();
      return;
    }
    renderStravaActivities(data.activities || []);
  } catch(e) {
    content.innerHTML = `<div style="padding:30px 20px;text-align:center;color:var(--red)">❌ Chyba při načítání aktivit<br><small>${e.message}</small></div>`;
  }
}

function renderStravaActivities(activities) {
  const content = document.getElementById('strava-content');
  const imported = getImportedStravaIds();

  if (!activities.length) {
    content.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--text2)">Žádné jízdy na Stravě</div>`;
    return;
  }

  content.innerHTML = activities.map(a => {
    const alreadyImported = imported.has(String(a.id));
    const date = new Date(a.date).toLocaleDateString('cs-CZ', { day:'2-digit', month:'2-digit', year:'2-digit' });
    const dur  = fmtTime(a.durationMs);
    const actJson = JSON.stringify(a).replace(/"/g,'&quot;');
    return `
      <div class="strava-item ${alreadyImported ? 'imported' : ''}" id="sa-${a.id}">
        <div class="strava-item-left">
          <div class="strava-item-name">${escHtml(a.name)}</div>
          <div class="strava-item-meta">
            <span>📅 ${date}</span>
            <span>📏 ${a.distKm} km</span>
            <span>⏱ ${dur}</span>
            <span>⛰ +${a.elevM} m</span>
          </div>
        </div>
        <div class="strava-item-right" style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          ${alreadyImported
            ? '<span class="strava-badge-done">✓ Importováno</span>'
            : `<button class="btn btn-blue btn-sm" onclick="showImportModal(${actJson})">Importovat</button>`
          }
          <button class="btn btn-glass btn-sm" onclick="openStravaRouteCreator(${actJson})">+ Nová trasa</button>
        </div>
      </div>`;
  }).join('');
}

// Show route-picker modal and confirm import
function showImportModal(activity) {
  if (!routes.length) {
    toast('❌ Nejdříve vytvoř aspoň jednu trasu');
    return;
  }
  // Populate modal
  document.getElementById('import-modal-name').textContent = activity.name;
  document.getElementById('import-modal-meta').textContent =
    `${activity.distKm} km · ${fmtTime(activity.durationMs)} · +${activity.elevM} m`;

  const sel = document.getElementById('import-modal-route-sel');
  sel.innerHTML = routes.map((r, i) => {
    const diff = r.totalDist ? Math.abs(r.totalDist - activity.distKm) : 999;
    const match = diff < 1 ? ' ✓' : diff < 3 ? ' ~' : '';
    return `<option value="${i}">${escHtml(r.name)} (${(r.totalDist||0).toFixed(1)} km)${match}</option>`;
  }).join('');

  // Store activity data on confirm button
  document.getElementById('import-modal-confirm').onclick = () => confirmImport(activity, parseInt(sel.value));
  document.getElementById('modal-strava-import').classList.add('open');
}

function confirmImport(activity, routeIdx) {
  closeModal('modal-strava-import');
  const r = routes[routeIdx];
  if (!r) return;

  // Create record (no checkpoint splits available from Strava)
  const record = {
    date:        activity.date,
    totalMs:     activity.durationMs,
    stravaId:    activity.id,
    stravaName:  activity.name,
    distKm:      activity.distKm,
    elevM:       activity.elevM,
    checkpoints: (r.checkpoints || []).map(cp => ({ km: cp.km, name: cp.name, hitTime: null, splitMs: null })),
  };

  if (!r.records) r.records = [];
  // Insert sorted by totalMs ascending (best time first)
  r.records.push(record);
  r.records.sort((a, b) => a.totalMs - b.totalMs);
  saveRoutes();

  // Mark item as imported in UI
  const el = document.getElementById(`sa-${activity.id}`);
  if (el) {
    el.classList.add('imported');
    el.querySelector('.strava-item-right').innerHTML = '<span class="strava-badge-done">✓ Importováno</span>';
  }
  toast(`✅ Jízda importována do „${r.name}"`);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ════════════════════════════════════════════════
//  STRAVA → NEW ROUTE CREATOR
// ════════════════════════════════════════════════

async function openStravaRouteCreator(activity) {
  stravaCreatorActivity = activity;
  navTo('strava-creator');

  // Prefill form
  document.getElementById('src-name').value = activity.name || '';
  document.getElementById('src-dist').value = activity.distKm || '';
  document.getElementById('src-elev').value = activity.elevM || '';
  document.getElementById('src-desc').value = '';

  // Stats preview
  const statsEl = document.getElementById('src-stats');
  if (statsEl) {
    statsEl.innerHTML = [
      { val: activity.distKm + ' km', lbl: 'Vzdálenost' },
      { val: fmtTime(activity.durationMs), lbl: 'Čas' },
      { val: '+' + activity.elevM + ' m', lbl: 'Převýšení' },
      { val: (activity.avgSpeedKmh || '?') + ' km/h', lbl: 'Avg. rychlost' },
    ].map(s => `<div class="sds-item"><div class="sds-val">${s.val}</div><div class="sds-lbl">${s.lbl}</div></div>`).join('');
  }

  // Wallpaper picker
  const wallPick = document.getElementById('src-wall-pick');
  if (wallPick) {
    wallPick.innerHTML = WALLPAPERS.map(w => `
      <div onclick="selectSrcWall('${w.id}')" id="src-wall-${w.id}"
        style="width:52px;height:36px;border-radius:8px;background-image:url(${w.file});background-size:cover;cursor:pointer;border:2px solid transparent;transition:border-color 0.2s"
        title="${w.label}"></div>`).join('');
    selectSrcWall('wall1');
  }

  // Fetch full activity detail (polyline + perf data)
  if (STRAVA_WORKER_URL && !STRAVA_WORKER_URL.includes('YOUR_SUBDOMAIN')) {
    try {
      const res = await fetch(`${STRAVA_WORKER_URL}/api/activity/${activity.id}`);
      const detail = await res.json();
      stravaCreatorActivity = { ...activity, ...detail };

      // Performance badges
      const perfEl = document.getElementById('src-perf-badges');
      if (perfEl) {
        const badges = [];
        if (detail.avgWatts)    badges.push({ ico:'⚡', val: detail.avgWatts + 'W', lbl:'Avg. výkon' });
        if (detail.avgHr)       badges.push({ ico:'❤️', val: detail.avgHr, lbl:'Avg. TF' });
        if (detail.avgCadence)  badges.push({ ico:'🔄', val: detail.avgCadence + ' rpm', lbl:'Kadence' });
        if (detail.calories)    badges.push({ ico:'🔥', val: detail.calories + ' kcal', lbl:'Kalorie' });
        if (detail.sufferScore) badges.push({ ico:'💪', val: detail.sufferScore, lbl:'Effort' });
        perfEl.innerHTML = badges.map(b => `<span class="perf-badge">${b.ico} <strong>${b.val}</strong> <span style="color:var(--text2)">${b.lbl}</span></span>`).join('');
      }

      // Load Leaflet map with polyline
      if (detail.polyline) {
        loadStravaMap(detail.polyline);
      }

      // Fetch streams for elevation profile
      const streamsRes = await fetch(`${STRAVA_WORKER_URL}/api/activity/${activity.id}/streams`);
      const streamsData = await streamsRes.json();
      if (streamsData.streams?.altitude) {
        renderElevationProfile('src-elev-wrap', 'src-elev-svg', streamsData.streams.altitude, streamsData.streams.distance);
        // Store elevation profile data on creator activity for Feature F
        stravaCreatorActivity._elevProfile = {
          altitude: streamsData.streams.altitude,
          distance: streamsData.streams.distance
        };
      }
    } catch(e) {
      console.warn('Could not fetch activity detail:', e.message);
    }
  }
}

let _srcWall = 'wall1';
function selectSrcWall(id) {
  _srcWall = id;
  document.querySelectorAll('[id^="src-wall-"]').forEach(el => {
    el.style.borderColor = el.id === `src-wall-${id}` ? '#4B9EFF' : 'transparent';
  });
}

function loadStravaMap(polyline) {
  const mapEl = document.getElementById('strava-route-map');
  if (!mapEl) return;
  mapEl.style.display = 'block';

  if (!window.L) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => renderLeafletMap(polyline, mapEl);
    document.head.appendChild(script);
  } else {
    renderLeafletMap(polyline, mapEl);
  }
}

function decodePolyline(encoded) {
  let index = 0, lat = 0, lng = 0;
  const coords = [];
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

let _leafletMap = null;
function renderLeafletMap(polyline, container) {
  if (_leafletMap) { _leafletMap.remove(); _leafletMap = null; }
  const coords = decodePolyline(polyline);
  if (!coords.length) return;
  _leafletMap = L.map(container, { zoomControl: true, scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 18
  }).addTo(_leafletMap);
  const poly = L.polyline(coords, { color: '#4B9EFF', weight: 3, opacity: 0.8 }).addTo(_leafletMap);
  _leafletMap.fitBounds(poly.getBounds(), { padding: [10, 10] });
  L.circleMarker(coords[0], { radius: 6, color: '#4CAF50', fillColor: '#4CAF50', fillOpacity: 1 }).addTo(_leafletMap);
  L.circleMarker(coords[coords.length-1], { radius: 6, color: '#FF5566', fillColor: '#FF5566', fillOpacity: 1 }).addTo(_leafletMap);
}

function confirmCreateRouteFromStrava() {
  if (!stravaCreatorActivity) return;
  const name = document.getElementById('src-name').value.trim();
  if (!name) { toast('❌ Zadej název trasy'); return; }
  const dist = parseFloat(document.getElementById('src-dist').value) || stravaCreatorActivity.distKm;
  const elev = parseInt(document.getElementById('src-elev').value) || stravaCreatorActivity.elevM;
  const desc = document.getElementById('src-desc').value.trim();

  const newRoute = {
    name,
    totalDist: dist,
    totalElev: elev,
    totalDesc: 0,
    description: desc,
    wallpaper: _srcWall,
    checkpoints: [],
    type: 'strava',
    elevPoints: [],
    // Feature F: store elevation profile from Strava streams
    elevProfile: stravaCreatorActivity._elevProfile || null,
    records: [{
      date:        stravaCreatorActivity.date,
      totalMs:     stravaCreatorActivity.durationMs,
      stravaId:    stravaCreatorActivity.id,
      stravaName:  stravaCreatorActivity.name,
      distKm:      dist,
      elevM:       elev,
      avgWatts:    stravaCreatorActivity.avgWatts || null,
      avgHr:       stravaCreatorActivity.avgHr || null,
      avgCadence:  stravaCreatorActivity.avgCadence || null,
      calories:    stravaCreatorActivity.calories || null,
      checkpoints: [],
    }],
    polyline: stravaCreatorActivity.polyline || null,
  };

  routes.unshift(newRoute);
  saveRoutes();
  viewIdx = 0;
  toast('✅ Trasa vytvořena!');
  starBurst(window.innerWidth/2, window.innerHeight/3);
  showAchievement('🗺️', `Trasa "${name}" přidána!`);
  navTo('detail', false);
}

// ════════════════════════════════════════════════
//  COMPARE RIDES
// ════════════════════════════════════════════════

function showCompareRides() {
  const r = routes[viewIdx];
  if (!r || !r.records || r.records.length < 2) { toast('Potřebuješ alespoň 2 záznamy'); return; }

  const a = r.records[0], b = r.records[1];
  const dateA = new Date(a.date).toLocaleDateString('cs-CZ', {day:'2-digit',month:'2-digit',year:'2-digit'});
  const dateB = new Date(b.date).toLocaleDateString('cs-CZ', {day:'2-digit',month:'2-digit',year:'2-digit'});

  let rows = `<tr>
    <th>Parametr</th>
    <th>${dateA}</th>
    <th>${dateB}</th>
  </tr>
  <tr>
    <td style="color:var(--text2)">Celkový čas</td>
    <td class="compare-better">${fmtTime(a.totalMs)}</td>
    <td class="${b.totalMs > a.totalMs ? 'compare-worse' : ''}">${fmtTime(b.totalMs)}</td>
  </tr>`;

  const cpsA = a.checkpoints || [], cpsB = b.checkpoints || [];
  const maxCps = Math.max(cpsA.length, cpsB.length);
  for (let i = 0; i < maxCps; i++) {
    const cpA = cpsA[i], cpB = cpsB[i];
    const tA = cpA?.splitMs, tB = cpB?.splitMs;
    const name = cpA?.name || cpB?.name || `CP ${i+1}`;
    const betterA = tA != null && tB != null && tA <= tB;
    rows += `<tr>
      <td style="color:var(--text2);font-size:11px">${name}</td>
      <td class="${tA != null && betterA ? 'compare-better' : ''}">${tA != null ? fmtTime(tA) : '—'}</td>
      <td class="${tB != null && !betterA ? 'compare-better' : ''}">${tB != null ? fmtTime(tB) : '—'}</td>
    </tr>`;
  }

  if (a.avgWatts || b.avgWatts) {
    rows += `<tr><td style="color:var(--text2)">Avg. výkon</td><td>${a.avgWatts ? a.avgWatts+'W' : '—'}</td><td>${b.avgWatts ? b.avgWatts+'W' : '—'}</td></tr>`;
  }
  if (a.avgHr || b.avgHr) {
    rows += `<tr><td style="color:var(--text2)">Avg. TF</td><td>${a.avgHr || '—'}</td><td>${b.avgHr || '—'}</td></tr>`;
  }

  const delta = b.totalMs - a.totalMs;
  rows += `<tr style="border-top:1px solid rgba(255,255,255,0.1)">
    <td style="color:var(--text2)">Rozdíl</td>
    <td colspan="2" style="color:var(--text2);font-size:11px">
      Jízda 2 je o <strong style="color:${delta>0?'var(--red)':'var(--green)'}">${fmtTime(Math.abs(delta))}</strong> ${delta>0?'pomalejší':'rychlejší'}
    </td>
  </tr>`;

  document.getElementById('compare-content').innerHTML = `<table class="compare-table">${rows}</table>`;
  document.getElementById('modal-compare').classList.add('open');
}

// ════════════════════════════════════════════════
//  GOALS
// ════════════════════════════════════════════════

function saveGoal() {
  const type = document.getElementById('goal-type').value;
  const target = parseFloat(document.getElementById('goal-target').value);
  if (!target || target <= 0) { toast('❌ Zadej cílovou hodnotu'); return; }
  goals = goals.filter(g => g.type !== type);
  goals.push({ type, target, created: Date.now() });
  localStorage.setItem('vt_goals', JSON.stringify(goals));
  document.getElementById('add-goal-form').style.display = 'none';
  renderGoals();
  toast('✅ Cíl uložen');
}

function showAddGoalForm() {
  const f = document.getElementById('add-goal-form');
  if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

function renderGoals() {
  const el = document.getElementById('goals-content');
  if (!el) return;
  if (!goals.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2)">Žádné cíle. Přidej svůj první! 🎯</div>';
    return;
  }
  const allRecs = routes.flatMap(r => r.records || []);
  const now = new Date();

  el.innerHTML = goals.map(g => {
    let current = 0, label = '', unit = '';
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart  = new Date(now.getFullYear(), 0, 1);

    if (g.type === 'weekly_km') {
      current = allRecs.filter(r => new Date(r.date) >= weekStart).reduce((s,r) => s + (r.distKm || 0), 0);
      label = 'Týdenní km'; unit = 'km';
    } else if (g.type === 'monthly_km') {
      current = allRecs.filter(r => new Date(r.date) >= monthStart).reduce((s,r) => s + (r.distKm || 0), 0);
      label = 'Měsíční km'; unit = 'km';
    } else if (g.type === 'yearly_km') {
      current = allRecs.filter(r => new Date(r.date) >= yearStart).reduce((s,r) => s + (r.distKm || 0), 0);
      label = 'Roční km'; unit = 'km';
    } else if (g.type === 'yearly_rides') {
      current = allRecs.filter(r => new Date(r.date) >= yearStart).length;
      label = 'Roční jízdy'; unit = 'jízd';
    }
    current = Math.round(current * 10) / 10;
    const pct = Math.min((current / g.target) * 100, 100).toFixed(1);
    const done = current >= g.target;

    return `<div class="goal-card">
      <div class="goal-header">
        <div class="goal-title">${done ? '✅' : '🎯'} ${label}</div>
        <button onclick="deleteGoal('${g.type}')" style="background:none;border:none;color:var(--text2);font-size:16px;cursor:pointer">✕</button>
      </div>
      <div class="goal-progress-bg">
        <div class="goal-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="goal-stats">
        <span>${current} ${unit} z ${g.target} ${unit}</span>
        <span>${pct}%</span>
      </div>
    </div>`;
  }).join('');

  // Animate progress bars after render
  setTimeout(() => {
    document.querySelectorAll('.goal-progress-fill').forEach(bar => {
      const w = bar.style.width;
      bar.style.width = '0%';
      setTimeout(() => bar.style.width = w, 50);
    });
  }, 0);
}

function deleteGoal(type) {
  goals = goals.filter(g => g.type !== type);
  localStorage.setItem('vt_goals', JSON.stringify(goals));
  renderGoals();
}

// ════════════════════════════════════════════════
//  ACHIEVEMENTS
// ════════════════════════════════════════════════
function checkAchievements({ isNewPB = false, justFinishedAt = null } = {}) {
  const allRecs = routes.flatMap(r => r.records || []);
  const totalKm = allRecs.reduce((s, r) => s + (r.distKm || 0), 0);
  const totalRides = allRecs.length;
  const earnedIds = new Set(achievements.map(a => a.id));
  const now = new Date().toISOString();
  const newOnes = [];

  const earn = (id) => {
    if (!earnedIds.has(id)) {
      achievements.push({ id, earnedAt: now });
      earnedIds.add(id);
      newOnes.push(id);
    }
  };

  if (totalRides >= 1)  earn('first_ride');
  if (totalKm >= 100)   earn('km_100');
  if (totalKm >= 500)   earn('km_500');
  if (totalKm >= 1000)  earn('km_1000');
  if (totalRides >= 10) earn('rides_10');
  if (totalRides >= 50) earn('rides_50');
  if (isNewPB) earn('pb_new');
  if (computeStreak() >= 4) earn('streak_4w');
  if (routes.length >= 5)  earn('routes_5');
  if (justFinishedAt) {
    const h = justFinishedAt.getHours();
    if (h < 7)  earn('early_bird');
    if (h >= 22) earn('night_rider');
  }

  if (newOnes.length > 0) {
    localStorage.setItem('vt_achievements', JSON.stringify(achievements));
    // Show popup for each new achievement
    newOnes.forEach((id, i) => {
      const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
      if (def) setTimeout(() => showAchievement(def.icon, def.name), i * 1200);
    });
  }
}

// ════════════════════════════════════════════════
//  MONTHLY GOAL WIDGET
// ════════════════════════════════════════════════
function renderMonthlyGoalWidget(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthName  = now.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

  const allRecs = routes.flatMap(r => r.records || []);
  const monthKm = allRecs
    .filter(r => new Date(r.date) >= monthStart)
    .reduce((s, r) => s + (r.distKm || 0), 0);

  const goal = appSettings.monthlyGoalKm || 200;
  const pct  = Math.min((monthKm / goal) * 100, 100).toFixed(1);
  const done = monthKm >= goal;

  el.innerHTML = `
    <div class="monthly-goal-wrap">
      <div class="monthly-goal-header">
        <div class="monthly-goal-title">📅 ${monthName} ${done ? '✅' : ''}</div>
        <span class="monthly-goal-edit" onclick="toggleMonthlyGoalEdit()">✏️ Cíl</span>
      </div>
      <div class="monthly-goal-bar-bg">
        <div class="monthly-goal-bar-fill" id="mgfill" style="width:0%"></div>
      </div>
      <div class="monthly-goal-stats">
        <span>${monthKm.toFixed(1)} km z ${goal} km</span>
        <span class="monthly-goal-pct">${pct}%</span>
      </div>
      <div id="monthly-goal-edit-row" style="display:none" class="monthly-goal-input-row">
        <input type="number" id="monthly-goal-inp" value="${goal}" min="10" max="10000" step="10">
        <span>km</span>
        <button class="btn btn-glass btn-sm" onclick="saveMonthlyGoal()">Uložit</button>
      </div>
    </div>`;

  setTimeout(() => {
    const fill = document.getElementById('mgfill');
    if (fill) fill.style.width = pct + '%';
  }, 50);
}

function toggleMonthlyGoalEdit() {
  const row = document.getElementById('monthly-goal-edit-row');
  if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
}

function saveMonthlyGoal() {
  const inp = document.getElementById('monthly-goal-inp');
  const val = parseInt(inp?.value || '200', 10);
  if (val > 0) {
    appSettings.monthlyGoalKm = val;
    saveSettings();
    renderMonthlyGoalWidget('stats-monthly-goal');
    toast(`✅ Měsíční cíl: ${val} km`);
  }
}

function renderAchievements(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const earnedMap = {};
  achievements.forEach(a => { earnedMap[a.id] = a.earnedAt; });

  el.innerHTML = ACHIEVEMENT_DEFS.map(def => {
    const earned = !!earnedMap[def.id];
    const date = earned ? new Date(earnedMap[def.id]).toLocaleDateString('cs-CZ', {day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
    return `<div class="ach-card ${earned ? 'earned' : 'locked'}" title="${def.desc}">
      <div class="ach-ico">${def.icon}</div>
      <div class="ach-name">${def.name}</div>
      ${earned ? `<div class="ach-date">${date}</div>` : ''}
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════
//  VOICE ANNOUNCEMENTS (Web Speech API)
// ════════════════════════════════════════════════
function speak(text) {
  if (!appSettings.voiceAnnouncements) return;
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'cs-CZ';
  utterance.rate = 1.05;
  utterance.volume = 1.0;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function fmtTimeSpeech(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h} hodin ${min} minut ${sec} sekund`;
  if (min > 0) return `${min} minut ${sec} sekund`;
  return `${sec} sekund`;
}

// ════════════════════════════════════════════════
//  WAKE LOCK
// ════════════════════════════════════════════════
let _wakeLock = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
  } catch(e) { console.warn('WakeLock failed:', e.message); }
}

function releaseWakeLock() {
  if (_wakeLock) { _wakeLock.release().catch(() => {}); _wakeLock = null; }
}

// ════════════════════════════════════════════════
//  APPLY SETTINGS
// ════════════════════════════════════════════════
function applySettings() {
  const root = document.documentElement;
  // Theme colors
  const themes = {
    blue:   { main:'#4B9EFF', sec:'#2979FF' },
    green:  { main:'#4CAF50', sec:'#2E7D32' },
    orange: { main:'#FF6B35', sec:'#E64A19' },
    purple: { main:'#9C27B0', sec:'#6A1B9A' },
  };
  const t = themes[appSettings.themeColor] || themes.blue;
  root.style.setProperty('--blue', t.main);
  root.style.setProperty('--accent', t.sec);

  // Night mode
  const nightEl = document.getElementById('night-overlay');
  if (nightEl) {
    nightEl.style.display = appSettings.nightRed ? 'block' : 'none';
    nightEl.style.opacity = appSettings.nightRed ? '0.15' : '0';
  }

  // Light mode
  document.body.classList.toggle('light-mode', !!appSettings.lightMode);
}

// ════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════
function renderSettings() {
  // Sync toggle states
  const syncToggle = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', !!appSettings[key]);
  };
  syncToggle('tog-nightred', 'nightRed');
  syncToggle('toggle-lightmode', 'lightMode');
  syncToggle('toggle-voice', 'voiceAnnouncements');

  // Sync inputs
  const syncInp = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.value = appSettings[key] || '';
  };
  syncInp('inp-ftp', 'ftp');
  syncInp('inp-maxhr', 'maxHr');
  syncInp('inp-weight', 'weight');

  // Sync theme swatches
  ['blue','green','orange','purple'].forEach(c => {
    const el = document.getElementById(`sw-${c}`);
    if (el) el.classList.toggle('active', appSettings.themeColor === c);
  });

  // Units select
  const unitSel = document.querySelector('#screen-settings select');
  if (unitSel) unitSel.value = appSettings.units || 'km';
}

function toggleSetting(key) {
  appSettings[key] = !appSettings[key];
  saveSettings();
  renderSettings();
}

function clearAllAppData() {
  if (!confirm('⚠️ Opravdu smazat VŠECHNA data?\n\nVymaže se: trasy, záznamy, achievementy, nastavení, kola.\n\nTato akce je NEVRATNÁ.')) return;
  localStorage.clear();
  toast('🗑 Data smazána, restartuji…');
  setTimeout(() => location.reload(), 800);
}

function setTheme(color) {
  appSettings.themeColor = color;
  saveSettings();
  renderSettings();
}

function exportAllData() {
  const data = {
    vt_routes:   localStorage.getItem('vt_routes'),
    vt_goals:    localStorage.getItem('vt_goals'),
    vt_bikes:    localStorage.getItem('vt_bikes'),
    vt_workouts: localStorage.getItem('vt_workouts'),
    vt_training: localStorage.getItem('vt_training'),
    vt_settings: localStorage.getItem('vt_settings'),
    exportedAt:  new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `velotimer-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  toast('✅ Data exportována');
}

function importAllData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.vt_routes)   { localStorage.setItem('vt_routes', data.vt_routes); routes = JSON.parse(data.vt_routes); }
      if (data.vt_goals)    { localStorage.setItem('vt_goals', data.vt_goals); goals = JSON.parse(data.vt_goals); }
      if (data.vt_bikes)    { localStorage.setItem('vt_bikes', data.vt_bikes); bikes = JSON.parse(data.vt_bikes); }
      if (data.vt_workouts) { localStorage.setItem('vt_workouts', data.vt_workouts); workouts = JSON.parse(data.vt_workouts); }
      if (data.vt_training) { localStorage.setItem('vt_training', data.vt_training); trainingPlan = JSON.parse(data.vt_training); }
      if (data.vt_settings) { localStorage.setItem('vt_settings', data.vt_settings); appSettings = JSON.parse(data.vt_settings); }
      toast('✅ Data importována — restartuj aplikaci');
      renderHome();
    } catch(err) {
      toast('❌ Chyba při importu: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ════════════════════════════════════════════════
//  GARAGE / BIKES
// ════════════════════════════════════════════════

function calcRouteDifficulty(route) {
  const dist = route.totalDist || 0;
  const elev = route.elevM || route.totalElev || 0;
  // Score = dist * 0.5 + elev * 0.1 (rough)
  const score = dist * 0.5 + elev * 0.1;
  if (score < 15)  return { label: 'Lehká',   cls: 'diff-easy',   ico: '🟢' };
  if (score < 40)  return { label: 'Střední',  cls: 'diff-medium', ico: '🟡' };
  if (score < 80)  return { label: 'Těžká',   cls: 'diff-hard',   ico: '🟠' };
  return              { label: 'Epická',  cls: 'diff-epic',   ico: '🔴' };
}

let _bikeIconSel = '🚴';

function showAddBikeModal() {
  document.getElementById('bike-name').value = '';
  document.getElementById('bike-brand').value = '';
  document.getElementById('bike-model').value = '';
  document.getElementById('bike-km').value = '0';
  document.getElementById('modal-add-bike').classList.add('open');
  // Icon picker
  const icons = ['🚴','🚵','⚡','🔴','🔵','🏎️','🌟','💪'];
  const pick = document.getElementById('bike-icon-pick');
  if (pick) pick.innerHTML = icons.map(ic =>
    `<div onclick="selectBikeIcon('${ic}')" id="bico-${ic.codePointAt(0)}" style="font-size:26px;cursor:pointer;padding:4px;border-radius:8px;transition:background 0.2s">${ic}</div>`
  ).join('');
  selectBikeIcon('🚴');
}

function selectBikeIcon(ic) {
  _bikeIconSel = ic;
  document.querySelectorAll('[id^="bico-"]').forEach(el => el.style.background = '');
  const el = document.getElementById(`bico-${ic.codePointAt(0)}`);
  if (el) el.style.background = 'rgba(255,255,255,0.15)';
}

function saveBike() {
  const name = document.getElementById('bike-name').value.trim();
  if (!name) { toast('❌ Zadej název kola'); return; }
  const bike = {
    id:         Date.now().toString(),
    icon:       _bikeIconSel,
    name,
    brand:      document.getElementById('bike-brand').value.trim(),
    model:      document.getElementById('bike-model').value.trim(),
    totalKm:    parseFloat(document.getElementById('bike-km').value) || 0,
    components: [
      { name: 'Řetěz',         intervalKm: 2500, warnAt: 2200, currentKm: 0 },
      { name: 'Plášť předek',  intervalKm: 5000, warnAt: 4500, currentKm: 0 },
      { name: 'Plášť zadek',   intervalKm: 4000, warnAt: 3500, currentKm: 0 },
      { name: 'Brzdové guma',  intervalKm: 3000, warnAt: 2700, currentKm: 0 },
      { name: 'Kaseta',        intervalKm: 8000, warnAt: 7000, currentKm: 0 },
    ],
  };
  bikes.push(bike);
  saveBikes();
  closeModal('modal-add-bike');
  renderGarage();
  toast(`✅ ${name} přidáno do garáže`);
}

function renderGarage() {
  const el = document.getElementById('garage-content');
  if (!el) return;

  if (!bikes.length) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text2)">
      <div style="font-size:48px;margin-bottom:12px">🚲</div>
      <div style="font-weight:700;margin-bottom:8px">Prázdná garáž</div>
      <div style="font-size:13px">Přidej své kolo a sleduj opotřebení komponent</div>
    </div>`;
    return;
  }

  el.innerHTML = bikes.map((bike, bi) => {
    const compsHtml = bike.components.map((c, ci) => {
      const pct = Math.min((c.currentKm / c.intervalKm) * 100, 100);
      const worn = c.currentKm >= c.warnAt;
      const color = pct < 70 ? '#4CAF50' : pct < 90 ? '#FFC107' : '#FF5566';
      return `<div class="component-row">
        <span class="comp-name ${worn ? 'comp-warn' : ''}">${c.name}${worn ? ' ⚠️' : ''}</span>
        <div class="comp-bar-bg"><div class="comp-bar" style="width:${pct.toFixed(0)}%;background:${color}"></div></div>
        <span class="comp-pct" style="color:${color}">${Math.round(pct)}%</span>
        <span style="font-size:10px;color:var(--text3);font-family:var(--mono)">${Math.round(c.currentKm)}/${c.intervalKm}km</span>
        <button onclick="resetComponent(${bi},${ci})" style="background:none;border:none;color:var(--text3);font-size:12px;cursor:pointer;padding:2px 4px">↺</button>
      </div>`;
    }).join('');

    return `<div class="bike-card">
      <div class="bike-card-header">
        <div class="bike-icon">${bike.icon}</div>
        <div style="flex:1">
          <div class="bike-name">${escHtml(bike.name)}</div>
          <div class="bike-brand">${escHtml(bike.brand)} ${escHtml(bike.model)}</div>
          <div class="bike-km">${bike.totalKm.toFixed(0)} km celkem</div>
        </div>
        <button onclick="deleteBike(${bi})" style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer">✕</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Komponenty</div>
      ${compsHtml}
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn btn-glass btn-sm btn-block" onclick="addKmToBike(${bi})">+ Přidat km</button>
      </div>
    </div>`;
  }).join('');
}

function resetComponent(bikeIdx, compIdx) {
  bikes[bikeIdx].components[compIdx].currentKm = 0;
  saveBikes();
  renderGarage();
  toast('✅ Komponenta resetována');
}

function deleteBike(idx) {
  if (!confirm(`Smazat ${bikes[idx].name}?`)) return;
  bikes.splice(idx, 1);
  saveBikes();
  renderGarage();
}

function addKmToBike(idx) {
  const km = parseFloat(prompt('Kolik km přidat?') || '0');
  if (!km || km <= 0) return;
  bikes[idx].totalKm += km;
  bikes[idx].components.forEach(c => c.currentKm += km);
  saveBikes();
  renderGarage();
  toast(`✅ ${km} km přidáno`);
}

// ════════════════════════════════════════════════
//  EXTENDED STATS
// ════════════════════════════════════════════════

function computePersonalRecords() {
  const allRecs = routes.flatMap((r, ri) => (r.records || []).map(rec => ({ ...rec, route: r, routeIdx: ri })));

  const prs = {
    longestKm:    allRecs.reduce((m, r) => (r.distKm || r.route?.totalDist || 0) > ((m?.distKm || m?.route?.totalDist) || 0) ? r : m, null),
    fastestAvgKmh:allRecs.reduce((m, r) => (r.avgSpeedKmh || 0) > (m?.avgSpeedKmh || 0) ? r : m, null),
    mostElevM:    allRecs.reduce((m, r) => (r.elevM || 0) > (m?.elevM || 0) ? r : m, null),
    longestMs:    allRecs.reduce((m, r) => r.totalMs > (m?.totalMs || 0) ? r : m, null),
    mostWatts:    allRecs.reduce((m, r) => (r.avgWatts || 0) > (m?.avgWatts || 0) ? r : m, null),
    totalRides:   allRecs.length,
    totalKm:      allRecs.reduce((s, r) => s + (r.distKm || r.route?.totalDist || 0), 0),
    totalElev:    allRecs.reduce((s, r) => s + (r.elevM || 0), 0),
    totalMs:      allRecs.reduce((s, r) => s + (r.totalMs || 0), 0),
  };
  return prs;
}

function renderPersonalRecords(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const pr = computePersonalRecords();

  const fmtRec = (rec, valFn, unit, ico, label) => {
    if (!rec) return `<div class="pr-card"><div class="pr-ico">${ico}</div><div class="pr-val">—</div><div class="pr-lbl">${label}</div></div>`;
    const val = valFn(rec);
    const date = rec.date ? new Date(rec.date).toLocaleDateString('cs-CZ',{day:'2-digit',month:'2-digit'}) : '';
    return `<div class="pr-card"><div class="pr-ico">${ico}</div><div class="pr-val">${val}${unit}</div><div class="pr-lbl">${label}</div><div class="pr-date">${date} · ${escHtml(rec.route?.name || '')}</div></div>`;
  };

  const kmVal = r => (r.distKm || r.route?.totalDist || 0).toFixed(1);

  el.innerHTML = `
    <div style="padding:0 16px 8px;font-weight:800;font-size:15px">🏅 Osobní rekordy</div>
    <div class="pr-grid">
      ${fmtRec(pr.longestKm,     kmVal,                           ' km',   '📏', 'Nejdelší jízda')}
      ${fmtRec(pr.fastestAvgKmh, r => (r.avgSpeedKmh||0).toFixed(1), ' km/h','⚡','Nejvyšší avg. rychlost')}
      ${fmtRec(pr.mostElevM,     r => Math.round(r.elevM||0),    ' m',    '⛰️', 'Nejvíce výšky')}
      ${fmtRec(pr.longestMs,     r => fmtTime(r.totalMs),        '',      '⏱️', 'Nejdelší čas')}
      ${pr.mostWatts ? fmtRec(pr.mostWatts, r => r.avgWatts, ' W', '💪', 'Nejvyšší výkon') : '<div class="pr-card"><div class="pr-ico">💪</div><div class="pr-val">—</div><div class="pr-lbl">Nejvyšší výkon</div></div>'}
      <div class="pr-card">
        <div class="pr-ico">🚴</div>
        <div class="pr-val">${pr.totalRides}</div>
        <div class="pr-lbl">Celkem jízd</div>
        <div class="pr-date">${pr.totalKm.toFixed(0)} km · ${fmtDuration(pr.totalMs)}</div>
      </div>
    </div>
  `;
}

function computeStreak() {
  const allRecs = routes.flatMap(r => r.records || []);
  const today = new Date();
  // Count consecutive weeks (not days — more realistic for cycling)
  const weeks = new Set();
  allRecs.forEach(rec => {
    const dt = new Date(rec.date);
    const startOfYear = new Date(dt.getFullYear(), 0, 1);
    const weekKey = `${dt.getFullYear()}-${Math.ceil((dt - startOfYear) / 604800000)}`;
    weeks.add(weekKey);
  });
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const curWeek = Math.ceil((today - startOfYear) / 604800000);
  let streak = 0;
  for (let w = curWeek; w > 0; w--) {
    const key = `${today.getFullYear()}-${w}`;
    if (weeks.has(key)) streak++;
    else break;
  }
  return streak;
}

function renderHeatCalendar(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const allRecs = routes.flatMap(r => r.records || []);
  const dayCounts = {};
  allRecs.forEach(r => {
    const d = r.date?.slice(0,10);
    if (d) dayCounts[d] = (dayCounts[d] || 0) + 1;
  });

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 364);

  let cells = '';
  let col = 0;

  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0,10);
    const count = dayCounts[key] || 0;
    const heat = count === 0 ? '' : count === 1 ? 'h1' : count === 2 ? 'h2' : count === 3 ? 'h3' : 'h4';
    const isToday = key === today.toISOString().slice(0,10);
    const title = `${key}: ${count} jízd`;

    cells += `<div class="heat-cell ${heat} ${isToday ? 'today' : ''}" title="${title}"></div>`;
    col++;
  }

  el.innerHTML = `
    <div style="padding:0 4px;font-size:11px;color:var(--text2);margin-bottom:4px">Aktivita za poslední rok</div>
    <div class="heat-calendar">${cells}</div>
    <div style="display:flex;align-items:center;gap:4px;margin-top:6px;font-size:10px;color:var(--text3);padding:0 4px">
      Méně
      <div class="heat-cell" style="width:10px;height:10px;flex-shrink:0"></div>
      <div class="heat-cell h1" style="width:10px;height:10px;flex-shrink:0"></div>
      <div class="heat-cell h2" style="width:10px;height:10px;flex-shrink:0"></div>
      <div class="heat-cell h3" style="width:10px;height:10px;flex-shrink:0"></div>
      <div class="heat-cell h4" style="width:10px;height:10px;flex-shrink:0"></div>
      Více
    </div>
  `;
}

// ════════════════════════════════════════════════
//  WEATHER (Open-Meteo — free, no key)
// ════════════════════════════════════════════════
let _weatherCache = null;
let _weatherCacheTime = 0;

async function fetchWeather(lat, lon) {
  const now = Date.now();
  if (_weatherCache && now - _weatherCacheTime < 30 * 60 * 1000) return _weatherCache;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=5&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();
    _weatherCache = data;
    _weatherCacheTime = now;
    return data;
  } catch(e) {
    console.warn('Weather fetch failed:', e.message);
    return null;
  }
}

function weatherCodeToInfo(code) {
  if (code === 0) return { ico:'☀️', desc:'Jasno' };
  if (code <= 2)  return { ico:'🌤️', desc:'Skoro jasno' };
  if (code <= 3)  return { ico:'☁️', desc:'Zataženo' };
  if (code <= 48) return { ico:'🌫️', desc:'Mlha' };
  if (code <= 55) return { ico:'🌦️', desc:'Mrholení' };
  if (code <= 65) return { ico:'🌧️', desc:'Déšť' };
  if (code <= 77) return { ico:'❄️', desc:'Sníh' };
  if (code <= 82) return { ico:'🌧️', desc:'Přeháňky' };
  if (code <= 99) return { ico:'⛈️', desc:'Bouřka' };
  return { ico:'🌡️', desc:'Neznámo' };
}

async function renderWeatherWidget(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<div style="padding:12px;color:var(--text2);font-size:13px">⏳ Načítám počasí…</div>';

  if (!navigator.geolocation) {
    el.innerHTML = '<div style="padding:12px;color:var(--text2);font-size:13px">Geolokace není dostupná</div>';
    return;
  }

  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    const data = await fetchWeather(lat, lon);
    if (!data) { el.innerHTML = '<div style="padding:12px;color:var(--text2)">Počasí nedostupné (offline?)</div>'; return; }

    const cur = data.current;
    const curInfo = weatherCodeToInfo(cur.weathercode);
    const daily = data.daily;

    const forecastHtml = (daily.time || []).slice(1, 5).map((day, i) => {
      const info = weatherCodeToInfo(daily.weathercode[i + 1]);
      const dayName = new Date(day).toLocaleDateString('cs-CZ', { weekday: 'short' });
      return `<div class="forecast-item">
        <div class="forecast-day">${dayName}</div>
        <div class="forecast-ico">${info.ico}</div>
        <div class="forecast-temp">${Math.round(daily.temperature_2m_max[i+1])}°</div>
        <div style="font-size:9px;color:var(--text3)">${daily.precipitation_sum?.[i+1]?.toFixed(0) || 0}mm</div>
      </div>`;
    }).join('');

    el.innerHTML = `<div class="weather-widget">
      <div class="weather-current">
        <div class="weather-ico">${curInfo.ico}</div>
        <div>
          <div class="weather-temp">${Math.round(cur.temperature_2m)}°C</div>
          <div class="weather-desc">${curInfo.desc}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="weather-detail">💨 ${Math.round(cur.windspeed_10m)} km/h</div>
          <div class="weather-detail">💧 ${cur.relativehumidity_2m}%</div>
        </div>
      </div>
      <div class="weather-forecast">${forecastHtml}</div>
    </div>`;
  }, () => {
    el.innerHTML = '<div style="padding:12px;color:var(--text2);font-size:13px">Povol přístup k poloze pro zobrazení počasí</div>';
  });
}

// ════════════════════════════════════════════════
//  GPX EXPORT
// ════════════════════════════════════════════════
function exportRouteGPX(routeIdx) {
  const r = routes[routeIdx];
  if (!r) return;

  const now = new Date().toISOString();
  const cps = r.checkpoints || [];

  // Build waypoints from checkpoints
  const wpts = cps.map((cp, i) => {
    const lat = cp.lat || 0, lon = cp.lon || 0;
    return `  <wpt lat="${lat}" lon="${lon}">
    <name>${escHtml(cp.name || `CP ${i+1}`)}</name>
    <sym>Flag</sym>
  </wpt>`;
  }).join('\n');

  // Build track from polyline if available
  let trkSeg = '';
  if (r.polyline) {
    const coords = decodePolyline(r.polyline);
    const trkpts = coords.map(([lat, lon]) =>
      `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"></trkpt>`
    ).join('\n');
    trkSeg = `  <trk>
    <name>${escHtml(r.name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>`;
  }

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="VeloTimer" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escHtml(r.name)}</name>
    <time>${now}</time>
    <desc>Vzdálenost: ${r.totalDist || 0} km, Převýšení: ${r.totalElev || 0} m</desc>
  </metadata>
${wpts}
${trkSeg}
</gpx>`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${r.name.replace(/[^a-z0-9]/gi,'_')}.gpx`;
  a.click();
  toast('✅ GPX exportováno');
}

// ════════════════════════════════════════════════
//  TRAINING CALENDAR
// ════════════════════════════════════════════════
let calViewDate = new Date();

function changeCalMonth(delta) {
  calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + delta, 1);
  renderTrainingCalendar();
}

function showTrainingTab(tab) {
  document.getElementById('training-tab-calendar').style.display = tab === 'calendar' ? '' : 'none';
  document.getElementById('training-tab-workouts').style.display  = tab === 'workouts'  ? '' : 'none';
  if (tab === 'calendar') renderTrainingCalendar();
  if (tab === 'workouts') renderWorkouts();
}

function renderTrainingCalendar() {
  const el = document.getElementById('cal-days');
  const lbl = document.getElementById('cal-month-label');
  if (!el) return;

  const year = calViewDate.getFullYear();
  const month = calViewDate.getMonth();
  const months = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
  if (lbl) lbl.textContent = `${months[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const today = new Date().toISOString().slice(0,10);

  // Start from Monday
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // Convert to Mon=0

  const allRecs = routes.flatMap(r => r.records || []);
  const rideDays = new Set(allRecs.map(r => r.date?.slice(0,10)));

  let html = '';

  // Empty cells before first day
  for (let i = 0; i < startDow; i++) {
    html += '<div class="cal-day other-month"></div>';
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const planned = trainingPlan.find(p => p.date === dateStr);
    const hasRide = rideDays.has(dateStr);
    const isToday = dateStr === today;

    let cls = 'cal-day';
    if (isToday) cls += ' today';
    if (hasRide) cls += ' completed';
    else if (planned) cls += ' planned';

    html += `<div class="${cls}" onclick="clickCalDay('${dateStr}')">${d}</div>`;
  }

  el.innerHTML = html;
}

function clickCalDay(dateStr) {
  // If ride exists on this day, show it; otherwise show plan dialog
  const allRecs = routes.flatMap((r,i) => (r.records||[]).map(rec => ({...rec, routeIdx:i, route:r})));
  const dayRides = allRecs.filter(r => r.date?.slice(0,10) === dateStr);

  if (dayRides.length > 0) {
    const info = dayRides.map(r => `${r.route.name}: ${fmtTime(r.totalMs)}`).join('\n');
    toast(`🚴 ${dateStr}: ${dayRides.length} jízda`);
    return;
  }

  if (!routes.length) { toast('❌ Nejdříve vytvoř trasu'); return; }

  // Show plan dialog
  document.getElementById('plan-day-title').textContent = `Plán: ${dateStr}`;
  document.getElementById('plan-route-sel').innerHTML = routes.map((r,i) => `<option value="${i}">${escHtml(r.name)}</option>`).join('');
  document.getElementById('plan-workout-sel').innerHTML = `<option value="">Volná jízda</option>` +
    workouts.map(w => `<option value="${w.id}">${w.icon} ${w.name}</option>`).join('');
  document.getElementById('plan-notes').value = '';
  document.getElementById('plan-day-title').dataset.date = dateStr;
  document.getElementById('modal-plan-day').classList.add('open');
}

function savePlanDay() {
  const dateStr = document.getElementById('plan-day-title').dataset.date;
  if (!dateStr) return;
  const entry = {
    id:        Date.now().toString(),
    date:      dateStr,
    routeIdx:  parseInt(document.getElementById('plan-route-sel').value),
    workoutId: document.getElementById('plan-workout-sel').value,
    notes:     document.getElementById('plan-notes').value.trim(),
    completed: false,
  };
  trainingPlan = trainingPlan.filter(p => p.date !== dateStr);
  trainingPlan.push(entry);
  saveTraining();
  closeModal('modal-plan-day');
  renderTrainingCalendar();
  toast('✅ Plán uložen');
}

function renderWorkouts() {
  const el = document.getElementById('workouts-list');
  if (!el) return;
  el.innerHTML = workouts.map(w => {
    const totalMin = w.segments.reduce((s,seg) => s + seg.min, 0);
    const colors = { warmup:'#4B9EFF', cooldown:'#4B9EFF', on:'#FF5566', off:'#4CAF50', steady:'#FFD700', easy:'#4CAF50' };
    const barsHtml = w.segments.map(seg => {
      const h = Math.max(4, (seg.pct / 110) * 30);
      return `<div class="workout-seg-bar" style="height:${h}px;background:${colors[seg.type]||'#aaa'}" title="${seg.type} ${seg.min}min ${seg.pct}%"></div>`;
    }).join('');

    return `<div class="workout-card">
      <div class="workout-icon">${w.icon}</div>
      <div class="workout-info">
        <div class="workout-name">${w.name}</div>
        <div class="workout-meta">${totalMin} min · ${w.segments.length} segmentů</div>
        <div class="workout-bars">${barsHtml}</div>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════
//  PB PREDICTION
// ════════════════════════════════════════════════
function updatePBPrediction(elapsedMs) {
  const bar = document.getElementById('pb-predict-bar');
  const valEl = document.getElementById('pb-predict-val');
  const deltaEl = document.getElementById('pb-predict-delta');
  if (!bar || !valEl || !deltaEl) return;

  if (rs.elapsed < 10000 || ghostPbMs <= 0) { bar.style.display = 'none'; return; }

  // Estimate finish time from current pace
  const cpsDone = rs.cps.filter(c => c.hitTime != null).length;
  const totalCps = rs.cps.length;
  const progressFrac = cpsDone / (totalCps + 1);

  if (progressFrac < 0.1) { bar.style.display = 'none'; return; }

  const projectedMs = elapsedMs / progressFrac;
  bar.style.display = 'flex';
  valEl.textContent = '⏱ ' + fmtTime(Math.round(projectedMs));

  const delta = projectedMs - ghostPbMs;
  const sign = delta > 0 ? '+' : '';
  deltaEl.textContent = `${sign}${fmtTime(Math.abs(Math.round(delta)))}`;
  deltaEl.className = 'ride-meta-val ' + (delta < 0 ? 'ahead' : 'behind');
}

// ════════════════════════════════════════════════
//  POWER CURVE
// ════════════════════════════════════════════════
function computePowerCurve() {
  const allRecs = routes.flatMap(r => r.records || []);
  const durations = [5/60, 1, 5, 20, 60]; // minutes — use as reference points
  const labels = ['5s','1m','5m','20m','60m'];
  const results = durations.map((minDur, i) => {
    const relevant = allRecs.filter(r => r.avgWatts && r.totalMs > 0);
    if (!relevant.length) return { label: labels[i], watts: null };
    const best = Math.max(...relevant.map(r => r.avgWatts || 0));
    return { label: labels[i], watts: best > 0 ? Math.round(best) : null };
  });
  return results;
}

function renderPowerCurve(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const curve = computePowerCurve();
  const hasData = curve.some(c => c.watts);
  if (!hasData) { el.innerHTML = '<div style="padding:12px 16px;color:var(--text2);font-size:12px;text-align:center">Není k dispozici (potřeba Strava data s výkonem)</div>'; return; }
  const { ftp } = appSettings;
  const pct = (w) => w && ftp ? Math.round((w / ftp) * 100) + '% FTP' : '';
  el.innerHTML = `<div class="power-curve-wrap">
    <div class="power-curve-title">⚡ Power Curve</div>
    <div class="power-curve-grid">
      ${curve.map(c => `<div class="pc-item">
        <div class="pc-val" style="color:${c.watts ? (c.watts > ftp ? '#FF5566' : '#4CAF50') : 'var(--text3)'}">${c.watts ? c.watts + 'W' : '—'}</div>
        <div class="pc-lbl">${c.label}</div>
        ${c.watts && ftp ? `<div style="font-size:9px;color:var(--text3)">${pct(c.watts)}</div>` : ''}
      </div>`).join('')}
    </div>
  </div>`;
}

// HR Zones from Strava data
function renderHRZones(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const allRecs = routes.flatMap(r => r.records || []).filter(r => r.avgHr);
  if (!allRecs.length) { el.innerHTML = ''; return; }
  const { maxHr } = appSettings;
  const zones = [
    { name:'Z1 Aktivní odpočinek', pct:50, color:'#4B9EFF' },
    { name:'Z2 Aerobní',          pct:60, color:'#4CAF50' },
    { name:'Z3 Tempo',            pct:70, color:'#FFD700' },
    { name:'Z4 Laktátový práh',   pct:80, color:'#FF6B35' },
    { name:'Z5 VO2 Max',          pct:90, color:'#FF5566' },
  ];
  // Estimate time in each zone (rough — from avg HR of each ride)
  const zoneTime = [0, 0, 0, 0, 0];
  allRecs.forEach(rec => {
    const hrPct = (rec.avgHr / maxHr) * 100;
    const z = hrPct < 60 ? 0 : hrPct < 70 ? 1 : hrPct < 80 ? 2 : hrPct < 90 ? 3 : 4;
    zoneTime[z] += rec.totalMs || 0;
  });
  const total = zoneTime.reduce((a,b) => a+b, 0) || 1;
  el.innerHTML = `<div style="padding:0 16px 12px">
    <div style="font-size:12px;font-weight:700;margin-bottom:8px">❤️ HR Zóny</div>
    <div class="hrz-bar-wrap">${zones.map((z,i) => `<div class="hrz-segment" style="flex:${zoneTime[i]||0.01};background:${z.color}" title="${z.name}: ${Math.round(zoneTime[i]/60000)} min"></div>`).join('')}</div>
    <div style="display:flex;flex-direction:column;gap:4px;margin-top:8px">
      ${zones.map((z,i) => `<div style="display:flex;align-items:center;gap:8px;font-size:11px">
        <div style="width:10px;height:10px;border-radius:2px;background:${z.color};flex-shrink:0"></div>
        <span style="flex:1;color:var(--text2)">${z.name}</span>
        <span style="font-family:var(--mono);color:var(--text3)">${Math.round((zoneTime[i]/total)*100)}%</span>
        <span style="font-family:var(--mono)">${Math.round(zoneTime[i]/60000)} min</span>
      </div>`).join('')}
    </div>
  </div>`;
}

// ── INIT ──────────────────────────────────────────
curScreen = 'splash';
renderSplash();
updateBackground();
applySettings();
checkStravaOnStart();

// Preload all wallpapers so background switches are instant (no black flash)
(function preloadWallpapers() {
  WALLPAPERS.forEach(w => { const img = new Image(); img.src = w.file; });
})();

// Check for autosave from interrupted ride
(function checkAutosave() {
  const autosaveRaw = localStorage.getItem('vt_ride_autosave');
  if (autosaveRaw) {
    try {
      const save = JSON.parse(autosaveRaw);
      const age = (Date.now() - save.savedAt) / 1000 / 60; // minutes
      if (age < 60) {
        // Autosave found but less than 1 hour old — just clean up for now
        console.info(`[VeloTimer] Autosave found (${Math.round(age)} min old), route ${save.routeIdx}`);
      }
    } catch(e) {}
    localStorage.removeItem('vt_ride_autosave');
  }
})();

// Ripple on all buttons (global delegation)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn');
  if (btn) addRipple({ currentTarget: btn, clientX: e.clientX, clientY: e.clientY });
});

// Update sidebar on resize
window.addEventListener('resize', () => updateSidebar());

// Initial sidebar update
updateSidebar();

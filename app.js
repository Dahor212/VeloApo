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
function wallpaperUrl(id) {
  return (WALLPAPERS.find(w => w.id === id) || WALLPAPERS[0]).file;
}

// ── DATA ─────────────────────────────────────────
let routes = JSON.parse(localStorage.getItem('vt_routes') || '[]');
let editIdx = null;
let viewIdx = null;
let gpxTemp = null;
let curScreen = 'home';
let statsPeriod = 'all';
let selectedWallpaper = DEFAULT_WALL;
let selectedWallpaperGPX = DEFAULT_WALL;
let navStack = [];  // navigation history for goBack()

// ── RIDE STATE ────────────────────────────────────
let rs = {
  running: false, startTs: null, elapsed: 0,
  cps: [], cpIdx: 0, finished: false,
  prevPos: null,       // for legacy compatibility
  _tvLastUpdate: -1    // throttle TV board updates
};
let rafId = null;

// ════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════
function showScreen(name) {
  curScreen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
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
  if (name === 'stats')  renderStats();
  showScreen(name);
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

  const el = document.getElementById('home-routes');
  document.getElementById('home-routes-count').textContent = `${routes.length} ${routes.length===1?'trasa':routes.length<5?'trasy':'tras'}`;

  if (!routes.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🚴‍♂️</div>
      <div class="empty-title">Žádné trasy</div>
      <div class="empty-sub">Vytvoř první trasu tlačítkem<br><strong>+ Trasa</strong> nahoře nebo z menu.</div>
    </div>`;
    return;
  }

  el.innerHTML = routes.map((r, i) => {
    const pb   = r.records?.length ? r.records[0] : null;
    const wall = wallpaperUrl(r.wallpaper || DEFAULT_WALL);
    const dist = r.totalDist ? r.totalDist.toFixed(1) : '—';
    return `<div class="route-card" onclick="openDetail(${i})">
      <div class="route-card-bg" style="background-image:url(${wall})"></div>
      <div class="route-card-grad"></div>
      <div class="route-card-actions">
        <div class="rc-btn" onclick="event.stopPropagation();openEdit(${i})">✏️</div>
      </div>
      <div class="route-card-body">
        <div class="route-card-top">
          <div>
            <div class="route-card-name">${r.name}</div>
          </div>
          <div class="route-card-badge">${r.type === 'gpx' ? 'GPX' : 'Manual'}</div>
        </div>
        <div>
          <div class="route-card-stats">
            <span>📏 <strong>${dist}</strong> km</span>
            <span>⛰ <strong>+${r.totalElev||0}</strong> m</span>
            <span>🏁 <strong>${(r.checkpoints||[]).length}</strong> CP</span>
            <span>📊 <strong>${(r.records||[]).length}</strong> jízd</span>
          </div>
          ${pb ? `<div class="route-card-pb">🏆 PB: ${fmtTime(pb.totalMs)}</div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
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
  document.getElementById('det-hero-sub').textContent = `${r.type === 'gpx' ? 'GPX trasa' : 'Ručně zadáno'} · ${(r.checkpoints||[]).length} CP · ${(r.records||[]).length} jízd`;
  document.getElementById('dh-dist').textContent = (r.totalDist||0).toFixed(1);
  document.getElementById('dh-up').textContent   = '+' + (r.totalElev||0);
  document.getElementById('dh-down').textContent = '-' + (r.totalDesc||0);

  // Profile
  document.getElementById('det-profile-hdr').innerHTML = `
    <div class="profile-stat"><span class="pos">+${r.totalElev||0}</span><small>m stoupání</small></div>
    <div class="profile-stat"><span class="neg">-${r.totalDesc||0}</span><small>m klesání</small></div>`;
  setTimeout(()=>drawElevation(r,'det-elev-canvas',120,true), 30);

  // Checkpoints
  const cpEl = document.getElementById('det-cps');
  if (!r.checkpoints?.length) {
    cpEl.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0;">Žádné checkpointy</div>';
  } else {
    cpEl.innerHTML = r.checkpoints.map((cp,i) =>
      `<div class="cp-item">
        <div class="cp-num">${i+1}</div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">${cp.name||'CP '+(i+1)}</div>
          <div style="font-size:12px;color:var(--text2);font-family:var(--mono);">${cp.km.toFixed(2)} km</div>
        </div>
      </div>`
    ).join('');
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
    return `<div class="lb-row">
      <div class="lb-pos ${medals[i]||''}">${i+1}</div>
      <div class="lb-time">${fmtTime(rec.totalMs)}</div>
      <div class="lb-diff ${i===0?'sp-fast':'sp-slow'}">${diffStr}</div>
      <div class="lb-date">${date}</div>
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
  setTimeout(()=>drawElevation(r,'ride-elev',90,true), 30);
  showScreen('ride');
}

function resetStatCards() {
  document.getElementById('s-time').textContent = '0:00';
  document.getElementById('s-pct').textContent  = '0%';
  document.getElementById('s-pace').textContent = '—';
  document.getElementById('s-eta').textContent  = '—';
  document.getElementById('s-pb').textContent   = '—';
  document.getElementById('s-pos').textContent  = '#—';
  document.getElementById('s-pos-of').textContent = `z ${(routes[viewIdx]?.records?.length||0)+1}`;
  document.getElementById('s-km').textContent   = `0 / ${(routes[viewIdx]?.totalDist||0).toFixed(1)} km`;
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
  document.getElementById('s-time').textContent = fmtTime(ms);

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

  // ── My estimated time AT the next target ──
  // Rule: from the very first second the timer runs, "me" has a refTime
  // so the row immediately appears and gradually drops as time passes.
  let myETA = null;
  if (rs.finished) {
    myETA = rs.elapsed;
  } else if (rs.running || rs.elapsed > 0) {
    if (lastHit && lastHit.km > 0) {
      // Interpolate pace from last-hit CP → project onto next CP distance
      const distTarget = nextCP ? nextCP.km : (r.totalDist || lastHit.km);
      myETA = rs.elapsed * (distTarget / lastHit.km);
    } else {
      // Before first CP: live elapsed IS the reference (pace unknown, use raw time)
      myETA = rs.elapsed;
    }
  }

  // ── Historical rides: their ACTUAL time at the same target (nextCpIdx) ──
  const entries = recs.map((rec, idx) => {
    const date = new Date(rec.date).toLocaleDateString('cs-CZ', {day:'2-digit', month:'2-digit'});
    let refTime = null;
    if (rs.finished) {
      refTime = rec.totalMs;
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

  // Update position card
  const myPos = ranked.findIndex(e => e.isMe) + 1;
  document.getElementById('s-pos').textContent  = '#' + myPos;
  document.getElementById('s-pos-of').textContent = `z ${ranked.length}`;

  const container = document.getElementById('tv-rows');

  // If container has the "empty" placeholder, clear it
  if (container.querySelector('.tv-empty')) container.innerHTML = '';

  // Set container height for absolute children
  container.style.height = (ranked.length * TV_ROW_H) + 'px';

  // Collect existing DOM rows keyed by data-key
  const existing = {};
  container.querySelectorAll('.tv-row[data-key]').forEach(el => {
    existing[el.dataset.key] = el;
  });

  ranked.forEach((entry, i) => {
    const newTop = i * TV_ROW_H;

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

    const posCls  = i===0?'p1':i===1?'p2':i===2?'p3':'';
    const meCls   = entry.isMe ? (isLeading ? 'me leading' : 'me') : '';
    const refText = entry.refTime != null ? fmtTime(entry.refTime) : '—';
    const innerHTML = `
      <div class="tv-pos ${posCls}">${i+1}</div>
      <div>
        <div class="tv-name">${entry.name}</div>
        <div class="tv-name-sub">${entry.sub}</div>
      </div>
      <div class="tv-time">${refText}</div>
      ${diffHTML}`;

    let row = existing[entry.key];
    if (!row) {
      // New row: create, position at target, fade in
      row = document.createElement('div');
      row.dataset.key = entry.key;
      row.className = 'tv-row ' + meCls;
      row.style.top = newTop + 'px';
      row.style.opacity = '0';
      row.innerHTML = innerHTML;
      container.appendChild(row);
      // Fade in next frame
      requestAnimationFrame(() => { row.style.opacity = '1'; });
    } else {
      // Existing row: check if position changed
      const oldTop = parseInt(row.style.top, 10) || 0;
      if (oldTop !== newTop) {
        // Flash animation on "me" row, subtle on others
        if (entry.isMe) {
          row.classList.remove('flash-up','flash-down');
          void row.offsetWidth; // reflow to restart animation
          row.classList.add(newTop < oldTop ? 'flash-up' : 'flash-down');
          setTimeout(() => row.classList.remove('flash-up','flash-down'), 900);
        }
        row.style.top = newTop + 'px';
      }
      // Update class and content
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

// ── HIT CHECKPOINT ────────────────────────────────
function hitCP(idx) {
  if (!rs.running || rs.cps[idx].hitTime!==null) return;
  const ms = performance.now() - rs.startTs;
  rs.cps[idx].hitTime = ms;
  rs.cps[idx].splitMs = idx===0 ? ms : (rs.cps[idx-1].hitTime!==null ? ms - rs.cps[idx-1].hitTime : null);
  rs.cpIdx = idx + 1;
  rs._tvLastUpdate = -1; // force immediate TV board refresh
  if (navigator.vibrate) navigator.vibrate(100);
  toast(`✓ CP${idx+1}: ${fmtTime(ms)}`);
  // Update progress marker to done
  const marker = document.querySelector(`#prog-markers .prog-cp-marker[data-km="${rs.cps[idx].km}"]`);
  if (marker) marker.classList.add('done');
  renderRideCPs();
  renderTVBoard();
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
  renderTVBoard();
  saveRecord(ms);
  setTimeout(()=>showResults(ms), 500);
}

function renderRideCPs() {
  const el = document.getElementById('ride-cps');
  const r  = routes[viewIdx];
  const cps = rs.cps;
  if (!cps.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;text-align:center;padding:16px;">Žádné checkpointy — přidej je v editaci trasy</div>';
    if (rs.running && !rs.finished) {
      el.innerHTML += `<button class="btn btn-green btn-block btn-lg" style="margin-top:8px;" onclick="finishRide()">🏁 CÍLEM!</button>`;
    }
    return;
  }
  const pb = r.records?.length ? r.records[0] : null;
  el.innerHTML = cps.map((cp,i) => {
    const done = cp.hitTime !== null;
    const isNext = !done && i===rs.cpIdx;
    const cls = done ? 'done' : isNext ? 'next' : '';
    const pbCp = pb?.checkpoints?.[i];
    let gDiff = '';
    if (done && pbCp?.hitTime != null) {
      const d = cp.hitTime - pbCp.hitTime;
      gDiff = `<div class="cp-gdiff ${d<=0?'g-fast':'g-slow'}">${d<=0?'▲ ':'▼ +'}${fmtTime(Math.abs(d))}</div>`;
    }
    const tap = (isNext && rs.running && !rs.finished)
      ? `<button class="tap-btn" onclick="hitCP(${i})">TAP ✓</button>` : '';
    return `<div class="cp-row ${cls}">
      <div class="cp-circ">${done?'✓':i+1}</div>
      <div class="cp-info">
        <div class="cp-iname">${cp.name||'CP '+(i+1)}</div>
        <div class="cp-idist">${cp.km.toFixed(2)} km</div>
      </div>
      <div class="cp-times">
        ${done ? `<div class="cp-t">${fmtTime(cp.hitTime)}</div>` : ''}
        ${done && cp.splitMs ? `<div class="cp-split">split: ${fmtTime(cp.splitMs)}</div>` : ''}
        ${gDiff}
      </div>
      ${tap}
    </div>`;
  }).join('');
  if (rs.cpIdx >= cps.length && rs.running && !rs.finished) {
    el.innerHTML += `<button class="btn btn-green btn-block btn-lg" style="margin-top:10px;" onclick="finishRide()">🏁 CÍLEM!</button>`;
  }
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
  rs.running = false;
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

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 2100);
}

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

// ── INIT ──────────────────────────────────────────
curScreen = 'splash';
renderSplash();
updateBackground();

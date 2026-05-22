// ════════════════════════════════════════════════
//  VeloTimer v2 — app.js
// ════════════════════════════════════════════════

// ── ROUTE BACKGROUNDS ────────────────────────────
const ROUTE_BG_CLASSES = [
  'bg-mountains','bg-sunset','bg-alpine','bg-plains','bg-coastal','bg-volcano','bg-7'
];

// ── DATA ─────────────────────────────────────────
let routes   = JSON.parse(localStorage.getItem('vt_routes') || '[]');
let editIdx  = null;   // route being edited
let viewIdx  = null;   // route being viewed
let gpxTemp  = null;   // parsed GPX data

// ── RIDE STATE ────────────────────────────────────
let rs = {
  running: false, startTs: null, elapsed: 0,
  cps: [], cpIdx: 0, finished: false
};
let rafId = null;

// ════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  if (name === 'home') renderHome();
  if (name === 'detail') renderDetail();
}

// ════════════════════════════════════════════════
//  HOME
// ════════════════════════════════════════════════
function renderHome() {
  const el = document.getElementById('home-routes');
  if (!routes.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🚴</div>
      <div class="empty-title">Žádné trasy</div>
      <div class="empty-sub">Přidej první trasu tlačítkem<br><strong>+ Trasa</strong> nahoře.</div>
    </div>`;
    return;
  }
  el.innerHTML = routes.map((r, i) => {
    const pb    = r.records?.length ? r.records[0] : null;
    const bgCls = ROUTE_BG_CLASSES[i % ROUTE_BG_CLASSES.length];
    const dist  = r.totalDist ? r.totalDist.toFixed(1) : '—';
    return `<div class="route-card ${bgCls}" onclick="openDetail(${i})">
      <div class="route-card-body">
        <div class="route-card-name">${r.name}</div>
        <div class="route-card-sub">
          <span>📏 ${dist} km</span>
          <span>⛰ ${r.totalElev||0} m</span>
          <span>🏁 ${(r.checkpoints||[]).length} CP</span>
          <span>📊 ${(r.records||[]).length} jízd</span>
        </div>
        ${pb ? `<div class="route-card-pb">🏆 PB: ${fmtTime(pb.totalMs)}</div>` : ''}
      </div>
      <div class="route-card-actions">
        <div class="rc-edit-btn" onclick="event.stopPropagation();openEdit(${i})">✏️</div>
        <div class="rc-edit-btn" onclick="event.stopPropagation();openDetail(${i})">›</div>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════
//  DETAIL
// ════════════════════════════════════════════════
function openDetail(idx) {
  viewIdx = idx;
  showScreen('detail');
}

function renderDetail() {
  const r = routes[viewIdx];
  if (!r) return;
  document.getElementById('det-title').textContent = r.name;

  // Stats row
  const dist = r.totalDist ? r.totalDist.toFixed(1) : '—';
  document.getElementById('det-stats-row').innerHTML = `
    <div class="gcard" style="flex:1;text-align:center;">
      <div style="font-size:22px;font-weight:800;">${dist}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:2px;">km</div>
    </div>
    <div class="gcard" style="flex:1;text-align:center;">
      <div style="font-size:22px;font-weight:800;color:var(--green);">+${r.totalElev||0}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:2px;">m stoupání</div>
    </div>
    <div class="gcard" style="flex:1;text-align:center;">
      <div style="font-size:22px;font-weight:800;color:var(--orange);">-${r.totalDesc||0}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:2px;">m klesání</div>
    </div>`;

  // Elevation profile header
  document.getElementById('det-profile-hdr').innerHTML = `
    <div class="profile-stat"><span class="pos">+${r.totalElev||0}</span><small>m stoupání</small></div>
    <div class="profile-stat"><span class="neg">-${r.totalDesc||0}</span><small>m klesání</small></div>`;
  setTimeout(() => drawElevation(r, 'det-elev-canvas', 110, true), 30);

  // Checkpoints
  const cpEl = document.getElementById('det-cps');
  if (!r.checkpoints?.length) {
    cpEl.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0;">Žádné checkpointy</div>';
  } else {
    cpEl.innerHTML = r.checkpoints.map((cp, i) =>
      `<div class="cp-item" style="margin-bottom:8px;background:var(--bg2);">
        <div class="cp-num">${i+1}</div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">${cp.name||'CP '+(i+1)}</div>
          <div style="font-size:12px;color:var(--text2);font-family:var(--mono);">${cp.km.toFixed(2)} km</div>
        </div>
      </div>`
    ).join('');
  }

  // Leaderboard
  renderLeaderboard('det-leaderboard', r);
}

function renderLeaderboard(elId, r) {
  const el = document.getElementById(elId);
  if (!r.records?.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0;">Zatím žádné jízdy</div>';
    return;
  }
  const medals = ['gold','silver','bronze'];
  const pb = r.records[0].totalMs;
  el.innerHTML = r.records.map((rec, i) => {
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
}

function openEdit(idx) {
  editIdx = idx;
  viewIdx = idx;
  const r = routes[idx];
  document.getElementById('add-screen-title').textContent = 'Upravit trasu';
  switchTab('manual');
  document.getElementById('add-tabs').style.display = 'none'; // hide GPX tab when editing
  // Fill form
  document.getElementById('m-name').value  = r.name;
  document.getElementById('m-dist').value  = r.totalDist || '';
  document.getElementById('m-elev').value  = r.totalElev || '';
  document.getElementById('m-desc').value  = r.totalDesc || '';
  document.getElementById('m-base').value  = r.baseElev  || '';
  // Load checkpoints
  const list = document.getElementById('m-cp-list');
  list.innerHTML = '';
  (r.checkpoints||[]).forEach(cp => addCPWithValues('m-cp-list', cp.km, cp.name));
  showScreen('add');
}

function editCurrentRoute() { openEdit(viewIdx); }

function clearAddForm() {
  ['m-name','m-dist','m-elev','m-desc','m-base'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
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

// ── CHECKPOINTS ───────────────────────────────────
let _cpId = 0;
function addCP(listId) { addCPWithValues(listId, '', ''); }
function addCPWithValues(listId, km, name) {
  const id  = 'cp' + (++_cpId);
  const div = document.createElement('div');
  div.className = 'cp-item';
  div.id = id;
  // Count existing items for numbering
  const count = document.getElementById(listId).children.length + 1;
  div.innerHTML = `
    <div class="cp-num" id="${id}-num">${count}</div>
    <input class="cp-km-inp" type="number" placeholder="km" min="0" step="0.01" value="${km||''}">
    <input class="cp-name-inp" type="text"   placeholder="Název CP" value="${name||''}">
    <button class="cp-del" onclick="removeCP('${id}','${listId}')">×</button>`;
  document.getElementById(listId).appendChild(div);
}
function removeCP(id, listId) {
  document.getElementById(id).remove();
  renumberCPs(listId);
}
function renumberCPs(listId) {
  document.querySelectorAll(`#${listId} .cp-num`).forEach((el,i) => el.textContent = i+1);
}
function getCPs(listId) {
  const out = [];
  document.querySelectorAll(`#${listId} .cp-item`).forEach(item => {
    const km   = parseFloat(item.querySelector('.cp-km-inp').value);
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
  if (!name)            { showToast('⚠️ Zadej název trasy'); return; }
  if (!dist || dist<=0) { showToast('⚠️ Zadej délku trasy'); return; }

  const cps       = getCPs('m-cp-list');
  const elevPts   = genElevation(dist, elev, desc, base);

  const route = { name, totalDist:dist, totalElev:elev, totalDesc:desc, baseElev:base,
                  checkpoints:cps, type:'manual', records:[], elevPoints:elevPts };

  if (editIdx !== null) {
    route.records = routes[editIdx].records || [];
    routes[editIdx] = route;
    toast('✅ Trasa aktualizována');
    viewIdx = editIdx; editIdx = null;
    showScreen('detail');
  } else {
    routes.push(route);
    toast('✅ Trasa uložena');
    showScreen('home');
  }
  saveRoutes();
}

// ── GPX ───────────────────────────────────────────
function loadGPX(inp) {
  const f = inp.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = e => { try { parseGPX(e.target.result, f.name); } catch(err) { toast('❌ '+err.message); } };
  rd.readAsText(f);
}

function parseGPX(xml, fname) {
  const doc  = new DOMParser().parseFromString(xml,'application/xml');
  const pts  = doc.querySelectorAll('trkpt');
  if (!pts.length) throw new Error('GPX neobsahuje body');

  const name = (doc.querySelector('name')?.textContent || fname.replace('.gpx','')).trim();
  let points = [], totalDist=0, prevLat=null, prevLon=null;

  pts.forEach(p => {
    const lat = parseFloat(p.getAttribute('lat'));
    const lon = parseFloat(p.getAttribute('lon'));
    const ele = parseFloat(p.querySelector('ele')?.textContent||0);
    if (prevLat!==null) totalDist += haversine(prevLat,prevLon,lat,lon);
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

  // UI update
  document.getElementById('gpx-zone').classList.add('loaded');
  document.getElementById('gpx-zone-txt').innerHTML = `<span style="color:var(--green);font-weight:700;">✓ ${fname}</span>`;
  document.getElementById('gpx-name').value = name;
  document.getElementById('gpx-profile-hdr').innerHTML = `
    <div class="profile-stat"><span class="pos">+${gpxTemp.totalElev}</span><small>m stoupání</small></div>
    <div class="profile-stat"><span class="neg">-${gpxTemp.totalDesc}</span><small>m klesání</small></div>
    <div class="profile-stat" style="margin-left:auto;font-size:14px;color:var(--text2);">${totalDist.toFixed(2)} km</div>`;
  document.getElementById('gpx-preview').style.display = '';
  setTimeout(() => drawElevation(gpxTemp,'gpx-canvas',110,true), 30);
}

function saveGPX() {
  if (!gpxTemp) { toast('⚠️ Načti GPX soubor'); return; }
  const name = document.getElementById('gpx-name').value.trim() || gpxTemp.name;
  const cps  = getCPs('gpx-cp-list');
  routes.push({ ...gpxTemp, name, checkpoints:cps, type:'gpx', records:[] });
  saveRoutes();
  toast('✅ GPX trasa uložena');
  gpxTemp = null;
  showScreen('home');
}

// ── DELETE ────────────────────────────────────────
function deleteRoute() { document.getElementById('modal-del').classList.add('open'); }
function doDeleteRoute() {
  closeModal('modal-del');
  routes.splice(viewIdx,1);
  saveRoutes();
  showScreen('home');
  toast('🗑 Trasa smazána');
}

// ════════════════════════════════════════════════
//  RIDE
// ════════════════════════════════════════════════
function startRide() {
  const r = routes[viewIdx];
  rs = {
    running:false, startTs:null, elapsed:0,
    cps: (r.checkpoints||[]).map(cp => ({...cp, hitTime:null, splitMs:null})),
    cpIdx:0, finished:false
  };
  cancelAnimationFrame(rafId);
  document.getElementById('ride-name').textContent   = r.name;
  document.getElementById('ride-dist-lbl').textContent = `${(r.totalDist||0).toFixed(1)} km`;
  document.getElementById('btn-sp').textContent      = '▶ START';
  document.getElementById('btn-sp').disabled         = false;
  document.getElementById('btn-rst').style.display   = 'none';
  document.getElementById('sdot').className          = 'status-dot';
  document.getElementById('stxt').textContent        = 'READY';
  document.getElementById('timer-main').className    = 'timer-main';
  document.getElementById('timer-main').innerHTML    = '0:00<span class="timer-ms" id="timer-ms">.00</span>';
  document.getElementById('prog-fill').style.width   = '0%';
  document.getElementById('s-cptotal').textContent   = `z ${rs.cps.length}`;
  document.getElementById('s-cpdone').textContent    = '0';
  resetStatCards();
  renderRideCPs();
  updateTVGhost(0);
  setTimeout(() => drawElevation(r,'ride-elev',70,false), 30);
  showScreen('ride');
}

function resetStatCards() {
  ['s-time','s-pct','s-pace','s-eta','s-pb'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = id==='s-time'||id==='s-pct' ? '0:00' : '—';
  });
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
    renderRideCPs();
    tick();
  } else {
    rs.elapsed  = performance.now() - rs.startTs;
    rs.running  = false;
    cancelAnimationFrame(rafId);
    document.getElementById('btn-sp').textContent = '▶ POKRAČOVAT';
    document.getElementById('sdot').className     = 'status-dot pause';
    document.getElementById('stxt').textContent   = 'PAUZA';
    document.getElementById('timer-main').classList.add('paused');
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
  const ms  = rs.elapsed;
  const sec = Math.floor(ms/1000);
  const m   = Math.floor(sec/60);
  const s   = sec%60;
  const cs  = String(Math.floor((ms%1000)/10)).padStart(2,'0');
  document.getElementById('timer-main').innerHTML =
    `${m}:${String(s).padStart(2,'0')}<span class="timer-ms" id="timer-ms">.${cs}</span>`;

  document.getElementById('s-time').textContent = fmtTime(ms);

  // Progress
  const r   = routes[viewIdx];
  const cps = rs.cps;
  const lastHit = [...cps].reverse().find(c=>c.hitTime!==null);
  const curKm   = rs.finished ? r.totalDist : (lastHit ? lastHit.km : 0);
  const pct     = r.totalDist ? Math.min(100,(curKm/r.totalDist)*100) : 0;
  document.getElementById('s-pct').textContent = Math.round(pct)+'%';
  document.getElementById('s-km').textContent  = `${curKm.toFixed(1)} / ${(r.totalDist||0).toFixed(1)} km`;
  document.getElementById('prog-fill').style.width = pct+'%';
  document.getElementById('prog-lbl').textContent  = `${curKm.toFixed(1)} / ${(r.totalDist||0).toFixed(1)} km`;
  document.getElementById('s-cpdone').textContent  = cps.filter(c=>c.hitTime!==null).length;

  // Pace & ETA
  if (ms>3000 && curKm>0) {
    const pace = (ms/1000/60)/curKm;
    document.getElementById('s-pace').textContent = fmtPace(pace);
    const remain = (r.totalDist||0) - curKm;
    document.getElementById('s-eta').textContent  = fmtTime(remain*pace*60000);
  }

  // PB card
  const pb = r.records?.length ? r.records[0] : null;
  if (pb && lastHit) {
    const pbCp = pb.checkpoints?.[cps.indexOf(lastHit)];
    if (pbCp?.hitTime != null) {
      const diff = lastHit.hitTime - pbCp.hitTime;
      const el = document.getElementById('s-pb');
      el.style.color = diff<=0 ? 'var(--green)' : 'var(--red)';
      el.textContent = (diff<=0?'▲ ':' ▼ +') + fmtTime(Math.abs(diff));
    }
  }

  updateTVGhost(ms);
}

// ── TV GHOST ──────────────────────────────────────
function updateTVGhost(ms) {
  const r    = routes[viewIdx];
  const recs = r.records || [];
  const cps  = rs.cps;
  const lastHit = [...cps].reverse().find(c=>c.hitTime!==null);

  // Build leaderboard positions using last hit checkpoint
  const positions = recs.map((rec, recIdx) => {
    let refTime = null;
    if (lastHit) {
      const ci = cps.indexOf(lastHit);
      refTime = rec.checkpoints?.[ci]?.hitTime ?? null;
    }
    return { idx: recIdx, name: `Jízda ${recIdx+1}`, recTime: rec.totalMs, refTime };
  });

  // Current "me"
  const myRefTime = lastHit ? lastHit.hitTime : (ms > 0 ? ms : null);
  const myEntry   = { idx: -1, name: 'Já', refTime: myRefTime, isMe: true };

  // Insert me into leaderboard
  let allEntries = [...positions.filter(p=>p.refTime!==null), myEntry].sort((a,b) => {
    if (a.refTime===null && b.refTime===null) return 0;
    if (a.refTime===null) return 1;
    if (b.refTime===null) return -1;
    return a.refTime - b.refTime;
  });

  const myPos = allEntries.findIndex(e => e.isMe);
  document.getElementById('tv-pos').textContent = '#' + (myPos+1);

  // Delta to leader
  const leader = allEntries[0];
  const tvD    = document.getElementById('tv-delta');
  const tvDval = document.getElementById('tv-dval');
  const tvDlbl = document.getElementById('tv-dlbl');
  if (leader?.isMe || !lastHit || !leader?.refTime) {
    tvD.className    = 'tv-delta neutral';
    tvDval.textContent = '—';
    tvDlbl.textContent = myPos===0 ? 'vedoucí! 🔥' : 'na vedoucím';
  } else {
    const diff = myRefTime - leader.refTime;
    if (diff < 0) {
      tvD.className     = 'tv-delta ahead';
      tvDval.textContent = '▲ ' + fmtTime(Math.abs(diff));
      tvDlbl.textContent = 'před vedoucím';
    } else {
      tvD.className     = 'tv-delta behind';
      tvDval.textContent = '▼ +' + fmtTime(diff);
      tvDlbl.textContent = 'za vedoucím';
    }
  }
  if (myPos === 0 && lastHit) {
    tvD.className = 'tv-delta ahead';
    tvDval.textContent = '🔥 1. místo';
    tvDlbl.textContent = '';
  }

  // Podium chips
  const podium = document.getElementById('tv-podium');
  podium.innerHTML = allEntries.slice(0,6).map((e,i) => {
    const cls    = e.isMe ? 'me' : (e.refTime < myRefTime ? 'faster' : '');
    const diff   = e.refTime !== null && myRefTime !== null ? e.refTime - myRefTime : null;
    const diffStr = e.isMe ? '' : (diff!==null ? (diff<0?`▲ ${fmtTime(Math.abs(diff))}`:`▼ +${fmtTime(diff)}`) : '—');
    return `<div class="tv-rider ${cls}">
      <div class="tv-rider-pos">#${i+1}</div>
      <div class="tv-rider-name">${e.name}</div>
      <div class="tv-rider-time" style="color:${e.isMe?'var(--blue)':diff<0?'var(--green)':'var(--red)'}">${diffStr}</div>
    </div>`;
  }).join('');
}

// ── HIT CHECKPOINT ────────────────────────────────
function hitCP(idx) {
  if (!rs.running || rs.cps[idx].hitTime!==null) return;
  const ms = performance.now() - rs.startTs;
  rs.cps[idx].hitTime = ms;
  rs.cps[idx].splitMs = idx===0 ? ms : (rs.cps[idx-1].hitTime!==null ? ms-rs.cps[idx-1].hitTime : null);
  rs.cpIdx = idx+1;
  if (navigator.vibrate) navigator.vibrate(100);
  toast(`✓ CP${idx+1}: ${fmtTime(ms)}`);
  renderRideCPs();
}

function finishRide() {
  if (!rs.running) return;
  const ms = performance.now() - rs.startTs;
  rs.elapsed = ms; rs.running = false; rs.finished = true;
  cancelAnimationFrame(rafId);
  document.getElementById('btn-sp').disabled = true;
  document.getElementById('sdot').className  = 'status-dot';
  document.getElementById('stxt').textContent = 'HOTOVO';
  document.getElementById('btn-rst').style.display = '';
  saveRecord(ms);
  setTimeout(()=>showResults(ms), 500);
}

function renderRideCPs() {
  const el   = document.getElementById('ride-cps');
  const r    = routes[viewIdx];
  const cps  = rs.cps;
  if (!cps.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;text-align:center;padding:16px;">Žádné checkpointy — přidej je v nastavení trasy</div>';
    if (rs.running && !rs.finished) {
      el.innerHTML += `<button class="btn btn-green btn-block btn-lg" style="margin-top:8px;" onclick="finishRide()">🏁 CÍLEM!</button>`;
    }
    return;
  }
  const pb   = r.records?.length ? r.records[0] : null;
  el.innerHTML = cps.map((cp,i) => {
    const done   = cp.hitTime !== null;
    const isNext = !done && i===rs.cpIdx;
    const cls    = done ? 'done' : isNext ? 'next' : '';
    const pbCp   = pb?.checkpoints?.[i];
    let gDiff = '';
    if (done && pbCp?.hitTime!=null) {
      const d = cp.hitTime - pbCp.hitTime;
      gDiff = `<div class="cp-gdiff ${d<=0?'g-fast':'g-slow'}">${d<=0?'▲ ':' ▼ +'}${fmtTime(Math.abs(d))}</div>`;
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

  // Finish button when all CPs done
  if (rs.cpIdx >= cps.length && rs.running && !rs.finished) {
    el.innerHTML += `<button class="btn btn-green btn-block btn-lg" style="margin-top:10px;" onclick="finishRide()">🏁 CÍLEM!</button>`;
  }
}

// ── SAVE & RESULTS ────────────────────────────────
function saveRecord(ms) {
  const rec = {
    totalMs: ms,
    date: new Date().toISOString(),
    checkpoints: rs.cps.map(c=>({ km:c.km, name:c.name, hitTime:c.hitTime, splitMs:c.splitMs }))
  };
  const r = routes[viewIdx];
  if (!r.records) r.records=[];
  r.records.push(rec);
  r.records.sort((a,b)=>a.totalMs-b.totalMs);
  saveRoutes();
}

function showResults(ms) {
  showScreen('results');
  const r  = routes[viewIdx];
  const pb = r.records[0];
  const isPB = pb.totalMs === ms;

  document.getElementById('res-route').textContent = r.name;
  document.getElementById('res-time').textContent  = fmtTime(ms);

  const badge = document.getElementById('res-badge');
  if (isPB && r.records.length===1) { badge.textContent='🏆 První jízda!'; badge.className='res-badge badge-pb'; }
  else if (isPB) { badge.textContent='🏆 Nový osobní rekord!'; badge.className='res-badge badge-pb'; }
  else { badge.textContent=`▼ +${fmtTime(ms-pb.totalMs)} za PB (${fmtTime(pb.totalMs)})`; badge.className='res-badge badge-nopb'; }

  // Splits
  const tbody = document.getElementById('splits-body');
  const pbRec  = r.records.find(rec=>rec!==r.records.find(x=>x.totalMs===ms)) || (r.records.length>1?r.records[0]:null);
  tbody.innerHTML = rs.cps.map((cp,i) => {
    const t  = cp.hitTime!=null ? fmtTime(cp.hitTime) : '—';
    const sp = cp.splitMs!=null ? fmtTime(cp.splitMs) : '—';
    let vs = '<span class="sp-none">—</span>';
    if (pbRec?.checkpoints?.[i]?.hitTime!=null && cp.hitTime!=null) {
      const d = cp.hitTime - pbRec.checkpoints[i].hitTime;
      vs = `<span class="${d<=0?'sp-fast':'sp-slow'}">${d<=0?'▲ ':' ▼ +'}${fmtTime(Math.abs(d))}</span>`;
    }
    return `<tr>
      <td><div class="sp-name">${cp.name||'CP '+(i+1)}</div><div class="sp-km">${cp.km.toFixed(2)} km</div></td>
      <td>${t}</td><td>${sp}</td><td>${vs}</td>
    </tr>`;
  }).join('')
  + `<tr style="border-top:1px solid var(--glass-border)">
      <td><div class="sp-name" style="color:var(--blue)">🏁 Cíl</div></td>
      <td style="color:var(--blue);font-weight:700;">${fmtTime(ms)}</td>
      <td>—</td><td>—</td>
    </tr>`;

  renderLeaderboard('res-leaderboard', r);
  setTimeout(()=>drawElevation(r,'res-elev',110,true), 30);
}

function rideAgain() { startRide(); }
function resetRide()  { startRide(); }

// ── ABORT ─────────────────────────────────────────
function confirmAbort() { document.getElementById('modal-abort').classList.add('open'); }
function abortRide() {
  closeModal('modal-abort');
  cancelAnimationFrame(rafId);
  rs.running = false;
  showScreen('home');
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ════════════════════════════════════════════════
//  ELEVATION CHART
// ════════════════════════════════════════════════
function drawElevation(route, canvasId, h, showGradient) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !route?.elevPoints?.length) return;
  const W     = canvas.parentElement?.offsetWidth || 340;
  canvas.width  = W;
  canvas.height = h;
  const ctx   = canvas.getContext('2d');
  const pts   = route.elevPoints;
  const maxD  = route.totalDist || pts[pts.length-1].dist || 1;
  const eles  = pts.map(p=>p.ele);
  const minE  = Math.min(...eles);
  const maxE  = Math.max(...eles);
  const rngE  = maxE - minE || 1;
  const pad   = { t:12, b:22, l:8, r:8 };
  const W2    = W - pad.l - pad.r;
  const H2    = h - pad.t - pad.b;

  const px = d  => pad.l + (d/maxD)*W2;
  const py = e  => pad.t + H2 - ((e-minE)/rngE)*H2;

  ctx.clearRect(0,0,W,h);

  // Gradient under curve — colour by slope
  if (showGradient && pts.length > 1) {
    for (let i=1; i<pts.length; i++) {
      const slope = ((pts[i].ele-pts[i-1].ele)/(((pts[i].dist-pts[i-1].dist)||0.001)*1000))*100;
      const col   = slopeColor(slope);
      const grd   = ctx.createLinearGradient(0, py(pts[i-1].ele), 0, h-pad.b);
      grd.addColorStop(0, col+'88');
      grd.addColorStop(1, col+'11');
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
    // simple gradient fill
    const grd = ctx.createLinearGradient(0,pad.t,0,h-pad.b);
    grd.addColorStop(0,'rgba(74,158,255,.3)');
    grd.addColorStop(1,'rgba(74,158,255,.03)');
    ctx.beginPath();
    ctx.moveTo(px(pts[0].dist),py(pts[0].ele));
    pts.forEach(p=>ctx.lineTo(px(p.dist),py(p.ele)));
    ctx.lineTo(px(pts[pts.length-1].dist),h-pad.b);
    ctx.lineTo(px(pts[0].dist),h-pad.b);
    ctx.closePath();
    ctx.fillStyle=grd; ctx.fill();
  }

  // Line
  ctx.beginPath();
  ctx.moveTo(px(pts[0].dist),py(pts[0].ele));
  pts.forEach(p=>ctx.lineTo(px(p.dist),py(p.ele)));
  ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.stroke();

  // Checkpoint dots
  if (showGradient) {
    (route.checkpoints||[]).forEach((cp,i) => {
      const x = px(cp.km); const y = py(elevAtKm(pts, cp.km));
      ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2);
      ctx.fillStyle='#4a9eff'; ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
    });
  }

  // Labels
  ctx.fillStyle='#8b949e'; ctx.font='10px JetBrains Mono, monospace';
  ctx.textAlign='left';  ctx.fillText(Math.round(minE)+'m', pad.l+2, h-6);
  ctx.textAlign='right'; ctx.fillText(Math.round(maxE)+'m', W-pad.r-2, pad.t+12);
  ctx.textAlign='right'; ctx.fillText(maxD.toFixed(1)+' km', W-pad.r-2, h-6);
}

function slopeColor(slope) {
  if (slope <= 0)  return '#4a9eff'; // blue = flat/descent
  if (slope < 3)   return '#3ddc84'; // green
  if (slope < 6)   return '#b8e840'; // yellow-green
  if (slope < 9)   return '#ffb800'; // yellow
  if (slope < 12)  return '#ff6b35'; // orange
  return '#ff4757';                  // red = steep
}

function elevAtKm(pts, km) {
  for (let i=1;i<pts.length;i++) {
    if (pts[i].dist >= km) return pts[i].ele;
  }
  return pts[pts.length-1]?.ele || 0;
}

// ════════════════════════════════════════════════
//  SYNTHETIC ELEVATION
// ════════════════════════════════════════════════
function genElevation(dist, elev, desc, base) {
  const N=120, pts=[];
  for (let i=0;i<=N;i++) {
    const t = i/N;
    const d = dist*t;
    // Simple climb-then-descent profile
    const e = base + elev*(Math.sin(t*Math.PI*0.9+0.1)) - desc*(Math.pow(t,2)*0.3);
    pts.push({dist:d, ele:Math.max(base-20, e)});
  }
  return pts;
}

// ════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════
function fmtTime(ms, noH) {
  if (ms==null||isNaN(ms)) return '—';
  const ts  = Math.floor(Math.abs(ms)/1000);
  const h   = Math.floor(ts/3600);
  const m   = Math.floor((ts%3600)/60);
  const s   = ts%60;
  if (h>0 && !noH) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}
function fmtPace(mPerKm) {
  const m=Math.floor(mPerKm), s=Math.round((mPerKm-m)*60);
  return `${m}:${String(s).padStart(2,'0')}`;
}
function haversine(la1,lo1,la2,lo2) {
  const R=6371, dr=(la2-la1)*Math.PI/180, dg=(lo2-lo1)*Math.PI/180;
  const a=Math.sin(dr/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dg/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function downsample(arr,n) {
  if (arr.length<=n) return arr;
  const s=arr.length/n, out=[];
  for (let i=0;i<n;i++) out.push(arr[Math.floor(i*s)]);
  return out;
}
function toast(msg) {
  const t=document.createElement('div');
  t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),2100);
}
function saveRoutes() { localStorage.setItem('vt_routes',JSON.stringify(routes)); }

// ── INIT ──────────────────────────────────────────
renderHome();

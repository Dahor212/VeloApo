// ============================================================
// VELOTIMER — app.js
// ============================================================

// ---- State ------------------------------------------------
let routes = JSON.parse(localStorage.getItem('vt_routes') || '[]');
let currentRoute = null;
let rideState = {
  running: false,
  startTime: null,
  elapsed: 0,         // ms since start (excl. pauses)
  pausedAt: null,
  checkpoints: [],    // { km, name, hitTime(ms)|null, splitMs|null }
  currentCpIdx: 0,
  finished: false,
  lastFinishedTime: null,
};
let timerRAF = null;

// GPX temp data
let gpxData = null; // { points:[{lat,lon,ele,dist}], totalDist, totalElev, elevPoints }
let manualCpCount = 0;
let gpxCpCount = 0;

// ---- NAVIGATION ------------------------------------------
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  if (name === 'home') renderRouteList();
}

// ---- ROUTE LIST ------------------------------------------
function renderRouteList() {
  const el = document.getElementById('routes-list');
  if (!routes.length) {
    el.innerHTML = `<div class="empty-routes">
      <div class="empty-icon">🚴</div>
      Zatím nemáte žádné trasy.<br>
      Přidejte první trasu tlačítkem <strong>+ Trasa</strong>.
    </div>`;
    return;
  }
  el.innerHTML = routes.map((r, i) => {
    const pb = r.records && r.records.length ? r.records[0] : null;
    const pbStr = pb ? `🏆 PB: ${formatTime(pb.totalMs)}` : '';
    return `<div class="route-card" onclick="selectRoute(${i})">
      <div class="route-card-header">
        <div class="route-name">${r.name}</div>
        <div class="route-badge ${r.type === 'gpx' ? 'badge-gpx' : 'badge-manual'}">${r.type === 'gpx' ? 'GPX' : 'Ručně'}</div>
      </div>
      <div class="route-stats">
        <div>📏 <span>${(r.totalDist||0).toFixed(1)} km</span></div>
        <div>⛰️ <span>${r.totalElev||0} m</span></div>
        <div>🏁 <span>${(r.checkpoints||[]).length} CP</span></div>
      </div>
      ${pbStr ? `<div class="route-pb">${pbStr}</div>` : ''}
    </div>`;
  }).join('');
}

// ---- SELECT ROUTE ----------------------------------------
function selectRoute(idx) {
  currentRoute = routes[idx];
  currentRoute._idx = idx;
  prepareRide();
  showScreen('ride');
}

function prepareRide() {
  rideState = {
    running: false, startTime: null, elapsed: 0,
    pausedAt: null,
    checkpoints: (currentRoute.checkpoints || []).map(cp => ({
      ...cp, hitTime: null, splitMs: null
    })),
    currentCpIdx: 0, finished: false, lastFinishedTime: null,
  };
  // Update UI
  document.getElementById('ride-route-name').textContent = currentRoute.name;
  document.getElementById('timer-display').innerHTML = '0:00<span class="timer-ms" id="timer-ms">.00</span>';
  document.getElementById('timer-display').classList.remove('paused');
  document.getElementById('status-dot').className = 'status-dot';
  document.getElementById('status-text').textContent = 'PŘIPRAVENO';
  document.getElementById('ghost-indicator').innerHTML = '';
  document.getElementById('btn-start-pause').textContent = '▶ START';
  document.getElementById('btn-reset-ride').style.display = 'none';
  document.getElementById('s-elapsed').textContent = '0:00';
  document.getElementById('s-progress').textContent = '0%';
  document.getElementById('s-avgpace').textContent = '—';
  document.getElementById('s-eta').textContent = '—';
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-km').textContent = `0 / ${(currentRoute.totalDist||0).toFixed(1)} km`;
  renderRideCheckpoints();
  drawElevationMini(currentRoute, 'ride-elev-canvas', 80);
}

// ---- RIDE CHECKPOINTS UI --------------------------------
function renderRideCheckpoints() {
  const el = document.getElementById('ride-checkpoints');
  const cps = rideState.checkpoints;
  if (!cps.length) {
    el.innerHTML = '<div style="color:var(--text3); font-size:13px; text-align:center; padding:16px;">Žádné checkpointy</div>';
    return;
  }
  el.innerHTML = cps.map((cp, i) => {
    const isDone = cp.hitTime !== null;
    const isNext = !isDone && i === rideState.currentCpIdx;
    const cls = isDone ? 'completed' : isNext ? 'next-up' : '';
    const pb = currentRoute.records && currentRoute.records[0];
    const pbCp = pb ? pb.checkpoints[i] : null;
    let ghostDiff = '';
    if (isDone && pbCp && pbCp.hitTime !== null) {
      const diff = cp.hitTime - pbCp.hitTime;
      const sign = diff < 0 ? '▲ ' : '▼ +';
      const cls2 = diff < 0 ? 'faster' : 'slower';
      ghostDiff = `<div class="cp-ghost-diff ${cls2}">${sign}${formatTime(Math.abs(diff))}</div>`;
    }
    const timeStr = isDone ? formatTime(cp.hitTime) : '';
    const splitStr = isDone && cp.splitMs !== null ? `+${formatTime(cp.splitMs)}` : '';
    const actionBtn = isNext && rideState.running
      ? `<button class="cp-tap-btn" onclick="hitCheckpoint(${i})">TAP ✓</button>` : '';

    return `<div class="cp-row ${cls}" id="cp-row-${i}">
      <div class="cp-circle">${isDone ? '✓' : i+1}</div>
      <div class="cp-info">
        <div class="cp-name">${cp.name || 'CP ' + (i+1)}</div>
        <div class="cp-dist">${cp.km.toFixed(1)} km</div>
      </div>
      <div class="cp-time-col">
        ${timeStr ? `<div class="cp-time">${timeStr}</div>` : ''}
        ${splitStr ? `<div class="cp-split">${splitStr}</div>` : ''}
        ${ghostDiff}
      </div>
      ${actionBtn}
    </div>`;
  }).join('');

  // Finish button if all CP done and running
  if (rideState.currentCpIdx >= cps.length && rideState.running && !rideState.finished) {
    el.innerHTML += `<button class="btn btn-success btn-block btn-lg" style="margin-top:12px;" onclick="finishRide()">🏁 CÍLEM!</button>`;
  }
}

// ---- TIMER ----------------------------------------------
function toggleTimer() {
  if (rideState.finished) return;
  if (!rideState.running) {
    // Start / Resume
    if (rideState.startTime === null) {
      rideState.startTime = performance.now();
    } else {
      // Resume: adjust startTime to account for pause
      rideState.startTime = performance.now() - rideState.elapsed;
    }
    rideState.running = true;
    rideState.pausedAt = null;
    document.getElementById('btn-start-pause').textContent = '⏸ PAUZA';
    document.getElementById('status-dot').className = 'status-dot running';
    document.getElementById('status-text').textContent = 'JEDE';
    document.getElementById('timer-display').classList.remove('paused');
    renderRideCheckpoints();
    tickTimer();
  } else {
    // Pause
    rideState.running = false;
    rideState.elapsed = performance.now() - rideState.startTime;
    rideState.pausedAt = rideState.elapsed;
    cancelAnimationFrame(timerRAF);
    document.getElementById('btn-start-pause').textContent = '▶ POKRAČOVAT';
    document.getElementById('status-dot').className = 'status-dot paused';
    document.getElementById('status-text').textContent = 'PAUZA';
    document.getElementById('timer-display').classList.add('paused');
    document.getElementById('btn-reset-ride').style.display = '';
    renderRideCheckpoints();
  }
}

function tickTimer() {
  if (!rideState.running) return;
  rideState.elapsed = performance.now() - rideState.startTime;
  updateTimerUI();
  timerRAF = requestAnimationFrame(tickTimer);
}

function updateTimerUI() {
  const ms = rideState.elapsed;
  document.getElementById('timer-display').innerHTML =
    formatTime(ms, true) + '<span class="timer-ms" id="timer-ms">.' + String(Math.floor((ms%1000)/10)).padStart(2,'0') + '</span>';

  // Stats
  document.getElementById('s-elapsed').textContent = formatTime(ms);

  // Progress based on checkpoints hit
  const cps = rideState.checkpoints;
  const allCps = cps.length;
  const hitCps = cps.filter(c => c.hitTime !== null).length;
  let pct = 0;
  let currentKm = 0;
  if (allCps > 0) {
    // estimate position
    const lastHit = [...cps].reverse().find(c => c.hitTime !== null);
    if (lastHit) {
      currentKm = lastHit.km;
      pct = (lastHit.km / currentRoute.totalDist) * 100;
    }
  }
  if (rideState.finished) { pct = 100; currentKm = currentRoute.totalDist; }
  document.getElementById('s-progress').textContent = Math.round(pct) + '%';
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-km').textContent = `${currentKm.toFixed(1)} / ${(currentRoute.totalDist||0).toFixed(1)} km`;

  // Avg pace
  if (ms > 3000 && currentKm > 0) {
    const pace = (ms / 1000 / 60) / currentKm; // min/km
    document.getElementById('s-avgpace').textContent = formatPace(pace);
    const remaining = (currentRoute.totalDist - currentKm);
    const etaSec = remaining * pace * 60;
    document.getElementById('s-eta').textContent = formatTime(etaSec * 1000);
  }

  // Ghost
  updateGhost(ms);
}

function updateGhost(ms) {
  const pb = currentRoute.records && currentRoute.records[0];
  if (!pb) return;
  const el = document.getElementById('ghost-indicator');
  // compare to pb time at same point
  // rough: linear ghost
  const cps = rideState.checkpoints;
  const lastHit = [...cps].reverse().find(c => c.hitTime !== null);
  if (!lastHit) { el.innerHTML = '<span style="color:var(--text3); font-size:12px;">👻 Ghost: čeká na 1. checkpoint</span>'; return; }
  const cpIdx = cps.indexOf(lastHit);
  const pbCp = pb.checkpoints[cpIdx];
  if (!pbCp || pbCp.hitTime === null) return;
  const diff = lastHit.hitTime - pbCp.hitTime;
  if (diff <= 0) {
    el.innerHTML = `<span class="ghost-icon">👻</span><span class="ghost-ahead">▲ ${formatTime(Math.abs(diff))} před PB</span>`;
  } else {
    el.innerHTML = `<span class="ghost-icon">👻</span><span class="ghost-behind">▼ ${formatTime(diff)} za PB</span>`;
  }
}

// ---- HIT CHECKPOINT -------------------------------------
function hitCheckpoint(idx) {
  if (!rideState.running) return;
  const ms = performance.now() - rideState.startTime;
  const cp = rideState.checkpoints[idx];
  if (cp.hitTime !== null) return;
  cp.hitTime = ms;
  // split = time since previous cp (or start)
  if (idx === 0) {
    cp.splitMs = ms;
  } else {
    const prev = rideState.checkpoints[idx - 1];
    cp.splitMs = prev.hitTime !== null ? ms - prev.hitTime : null;
  }
  rideState.currentCpIdx = idx + 1;
  showToast(`✓ CP${idx+1}: ${formatTime(ms)}`);
  renderRideCheckpoints();
  // vibrate
  if (navigator.vibrate) navigator.vibrate(80);
  // Check if it was the last one
  if (rideState.currentCpIdx >= rideState.checkpoints.length) {
    renderRideCheckpoints(); // show finish button
  }
}

function finishRide() {
  if (!rideState.running) return;
  const ms = performance.now() - rideState.startTime;
  rideState.elapsed = ms;
  rideState.running = false;
  rideState.finished = true;
  cancelAnimationFrame(timerRAF);
  document.getElementById('status-dot').className = 'status-dot';
  document.getElementById('status-text').textContent = 'HOTOVO';
  document.getElementById('btn-start-pause').disabled = true;
  document.getElementById('btn-reset-ride').style.display = '';
  renderRideCheckpoints();
  saveRideRecord(ms);
  setTimeout(() => showResults(ms), 600);
}

// ---- SAVE RECORD -----------------------------------------
function saveRideRecord(totalMs) {
  const record = {
    totalMs,
    date: new Date().toISOString(),
    checkpoints: rideState.checkpoints.map(cp => ({
      km: cp.km, name: cp.name,
      hitTime: cp.hitTime, splitMs: cp.splitMs
    }))
  };
  const r = routes[currentRoute._idx];
  if (!r.records) r.records = [];
  r.records.push(record);
  // sort by time, best first
  r.records.sort((a, b) => a.totalMs - b.totalMs);
  saveRoutes();
  // refresh currentRoute ref
  currentRoute = routes[currentRoute._idx];
  currentRoute._idx = currentRoute._idx;
}

// ---- SHOW RESULTS ----------------------------------------
function showResults(totalMs) {
  showScreen('results');
  const r = currentRoute;
  document.getElementById('res-route-label').textContent = r.name;
  document.getElementById('res-time').textContent = formatTime(totalMs);

  // PB?
  const pb = r.records && r.records[0];
  const isPB = pb && pb.totalMs === totalMs;
  const badge = document.getElementById('res-pb-badge');
  if (isPB && r.records.length === 1) {
    badge.textContent = '🏆 Nový osobní rekord!';
    badge.className = 'result-pb new-pb';
  } else if (isPB) {
    badge.textContent = '🏆 Nový osobní rekord!';
    badge.className = 'result-pb new-pb';
  } else if (pb) {
    const diff = totalMs - pb.totalMs;
    badge.textContent = `▼ +${formatTime(diff)} za PB (${formatTime(pb.totalMs)})`;
    badge.className = 'result-pb no-pb';
  } else {
    badge.textContent = '';
  }

  // Splits table
  const pbRecord = r.records && r.records.length > 1 ? r.records[0] : null;
  const tbody = document.getElementById('splits-tbody');
  const cps = rideState.checkpoints;
  tbody.innerHTML = cps.map((cp, i) => {
    const t = cp.hitTime !== null ? formatTime(cp.hitTime) : '—';
    const sp = cp.splitMs !== null ? formatTime(cp.splitMs) : '—';
    let vs = '<span class="split-diff no-ref">—</span>';
    if (pbRecord && pbRecord.checkpoints[i] && pbRecord.checkpoints[i].hitTime !== null && cp.hitTime !== null) {
      const diff = cp.hitTime - pbRecord.checkpoints[i].hitTime;
      const sign = diff < 0 ? '▲ ' : '▼ +';
      vs = `<span class="split-diff ${diff < 0 ? 'faster' : 'slower'}">${sign}${formatTime(Math.abs(diff))}</span>`;
    }
    return `<tr>
      <td><div class="split-name">${cp.name || 'CP '+(i+1)}</div><div style="font-size:11px;color:var(--text3)">${cp.km.toFixed(1)} km</div></td>
      <td>${t}</td>
      <td>${sp}</td>
      <td>${vs}</td>
    </tr>`;
  }).join('');

  // Finish row
  tbody.innerHTML += `<tr style="border-top:1px solid var(--border);">
    <td><div class="split-name" style="color:var(--accent);">🏁 CÍL</div></td>
    <td style="color:var(--accent); font-weight:700;">${formatTime(totalMs)}</td>
    <td>—</td>
    <td>—</td>
  </tr>`;

  drawElevationMini(r, 'res-elev-canvas', 140);
}

function startRideAgain() {
  prepareRide();
  showScreen('ride');
}

// ---- ABORT -----------------------------------------------
function confirmAbort() {
  document.getElementById('modal-abort').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-abort').classList.remove('open');
}
function abortRide() {
  closeModal();
  cancelAnimationFrame(timerRAF);
  rideState.running = false;
  showScreen('home');
}
function resetRide() {
  cancelAnimationFrame(timerRAF);
  prepareRide();
}

// ---- ADD ROUTE: TAB SWITCH --------------------------------
function switchAddTab(tab) {
  document.getElementById('add-manual').style.display = tab === 'manual' ? '' : 'none';
  document.getElementById('add-gpx').style.display = tab === 'gpx' ? '' : 'none';
  document.getElementById('tab-manual').className = 'tab-btn' + (tab === 'manual' ? ' active' : '');
  document.getElementById('tab-gpx').className = 'tab-btn' + (tab === 'gpx' ? ' active' : '');
}

// ---- CHECKPOINTS (manual) --------------------------------
function addCheckpoint(km, name, listId) {
  listId = listId || 'cp-list';
  const list = document.getElementById(listId);
  manualCpCount++;
  const idx = manualCpCount;
  const div = document.createElement('div');
  div.className = 'checkpoint-item';
  div.id = 'cpitem-' + idx;
  div.innerHTML = `
    <div class="cp-num">${list.children.length + 1}</div>
    <input class="cp-km" type="number" placeholder="km" min="0" step="0.1" value="${km || ''}">
    <input class="cp-label" type="text" placeholder="Název checkpointu" value="${name || ''}">
    <button class="cp-del" onclick="removeCheckpoint('cpitem-${idx}', '${listId}')">×</button>
  `;
  list.appendChild(div);
}

function addCheckpointGPX() { addCheckpoint('', '', 'gpx-cp-list'); }

function removeCheckpoint(id, listId) {
  document.getElementById(id).remove();
  renumberCheckpoints(listId || 'cp-list');
}

function renumberCheckpoints(listId) {
  const items = document.getElementById(listId).querySelectorAll('.cp-num');
  items.forEach((el, i) => el.textContent = i + 1);
}

function getCheckpointsFromList(listId) {
  const items = document.getElementById(listId).querySelectorAll('.checkpoint-item');
  const cps = [];
  items.forEach(item => {
    const km = parseFloat(item.querySelector('.cp-km').value);
    const name = item.querySelector('.cp-label').value.trim() || null;
    if (!isNaN(km) && km > 0) cps.push({ km, name: name || `CP ${cps.length+1}` });
  });
  cps.sort((a, b) => a.km - b.km);
  return cps;
}

// ---- SAVE MANUAL ROUTE -----------------------------------
function saveManualRoute() {
  const name = document.getElementById('m-name').value.trim();
  const dist = parseFloat(document.getElementById('m-dist').value);
  const elev = parseInt(document.getElementById('m-elev').value) || 0;
  const grade = parseFloat(document.getElementById('m-grade').value) || 0;
  const baseElev = parseInt(document.getElementById('m-baseelev').value) || 0;
  if (!name || !dist) { showToast('⚠️ Vyplňte název a délku'); return; }
  const checkpoints = getCheckpointsFromList('cp-list');

  // Generate synthetic elevation profile
  const elevPoints = generateSyntheticElevation(dist, elev, baseElev, grade);

  routes.push({
    name, totalDist: dist, totalElev: elev, grade, baseElev,
    checkpoints, type: 'manual', records: [], elevPoints
  });
  saveRoutes();
  showToast('✅ Trasa uložena!');
  clearAddForm();
  showScreen('home');
}

function generateSyntheticElevation(dist, totalElev, baseElev, avgGrade) {
  const pts = [];
  const N = 100;
  for (let i = 0; i <= N; i++) {
    const d = (dist * i / N);
    // Simple sinusoidal climb profile
    const progress = i / N;
    const elev = baseElev + totalElev * (progress < 0.7 
      ? (progress / 0.7) * 0.85 + Math.sin(progress * Math.PI * 3) * 0.05
      : 0.85 + (progress - 0.7) / 0.3 * 0.15);
    pts.push({ dist: d, ele: elev });
  }
  return pts;
}

function clearAddForm() {
  document.getElementById('m-name').value = '';
  document.getElementById('m-dist').value = '';
  document.getElementById('m-elev').value = '';
  document.getElementById('m-grade').value = '';
  document.getElementById('m-baseelev').value = '';
  document.getElementById('cp-list').innerHTML = '';
  manualCpCount = 0;
}

// ---- GPX LOADING -----------------------------------------
function loadGPX(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      parseGPX(e.target.result, file.name);
    } catch(err) {
      showToast('❌ Chyba čtení GPX: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function parseGPX(xmlStr, filename) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'application/xml');
  const trkpts = doc.querySelectorAll('trkpt');
  if (!trkpts.length) throw new Error('Žádné body trasy');

  const name = (doc.querySelector('name')?.textContent || filename.replace('.gpx','')).trim();

  let points = [];
  let totalDist = 0;
  let prevLat = null, prevLon = null;
  let minEle = Infinity, maxEle = -Infinity;

  trkpts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    const eleEl = pt.querySelector('ele');
    const ele = eleEl ? parseFloat(eleEl.textContent) : 0;

    let dist = 0;
    if (prevLat !== null) {
      dist = haversine(prevLat, prevLon, lat, lon);
      totalDist += dist;
    }
    prevLat = lat; prevLon = lon;
    if (ele < minEle) minEle = ele;
    if (ele > maxEle) maxEle = ele;
    points.push({ lat, lon, ele, dist: totalDist });
  });

  // Elevation gain
  let totalElev = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].ele - points[i-1].ele;
    if (diff > 0) totalElev += diff;
  }

  // Downsample for display
  const elevPoints = downsample(points, 200).map(p => ({ dist: p.dist, ele: p.ele }));

  gpxData = { points, totalDist, totalElev: Math.round(totalElev), elevPoints, name };

  // Update UI
  document.getElementById('gpx-drop').classList.add('loaded');
  document.getElementById('gpx-text').innerHTML = `<div class="gpx-loaded">✓ ${filename}</div>`;
  document.getElementById('gpx-dist-val').textContent = totalDist.toFixed(2);
  document.getElementById('gpx-elev-val').textContent = Math.round(totalElev);
  document.getElementById('gpx-pts-val').textContent = points.length;
  document.getElementById('gpx-name').value = name;
  document.getElementById('gpx-preview').style.display = '';

  // Draw preview
  drawElevationCanvas({ elevPoints, totalDist, totalElev }, 'gpx-elev-canvas', 120);
}

function saveGPXRoute() {
  if (!gpxData) { showToast('⚠️ Nejprve načtěte GPX soubor'); return; }
  const name = document.getElementById('gpx-name').value.trim() || gpxData.name;
  const checkpoints = getCheckpointsFromList('gpx-cp-list');
  routes.push({
    name, totalDist: gpxData.totalDist, totalElev: gpxData.totalElev,
    checkpoints, type: 'gpx', records: [],
    elevPoints: gpxData.elevPoints
  });
  saveRoutes();
  showToast('✅ GPX trasa uložena!');
  gpxData = null;
  document.getElementById('gpx-preview').style.display = 'none';
  document.getElementById('gpx-drop').classList.remove('loaded');
  document.getElementById('gpx-text').innerHTML = 'Klikni pro výběr GPX souboru<br><span style="font-size:12px;color:var(--text3)">(Komoot, Strava, Garmin...)</span>';
  document.getElementById('gpx-cp-list').innerHTML = '';
  gpxCpCount = 0;
  showScreen('home');
}

// ---- ELEVATION CHART ------------------------------------
function drawElevationCanvas(route, canvasId, h) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const W = canvas.parentElement.offsetWidth || 340;
  canvas.width = W;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const pts = route.elevPoints;
  if (!pts || pts.length < 2) return;

  const minE = Math.min(...pts.map(p => p.ele));
  const maxE = Math.max(...pts.map(p => p.ele));
  const rangeE = maxE - minE || 1;
  const maxD = route.totalDist;

  const pad = { top: 10, bottom: 20, left: 8, right: 8 };
  const w = W - pad.left - pad.right;
  const hh = h - pad.top - pad.bottom;

  const x = d => pad.left + (d / maxD) * w;
  const y = e => pad.top + hh - ((e - minE) / rangeE) * hh;

  ctx.clearRect(0, 0, W, h);

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + hh);
  grad.addColorStop(0, 'rgba(0,229,255,0.35)');
  grad.addColorStop(1, 'rgba(0,229,255,0.03)');

  ctx.beginPath();
  ctx.moveTo(x(pts[0].dist), y(pts[0].ele));
  pts.forEach(p => ctx.lineTo(x(p.dist), y(p.ele)));
  ctx.lineTo(x(pts[pts.length-1].dist), h - pad.bottom);
  ctx.lineTo(x(pts[0].dist), h - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(x(pts[0].dist), y(pts[0].ele));
  pts.forEach(p => ctx.lineTo(x(p.dist), y(p.ele)));
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Labels
  ctx.fillStyle = '#7070a0';
  ctx.font = '10px Share Tech Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(minE)}m`, pad.left + 2, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(maxE)}m`, W - pad.right - 2, pad.top + 12);
}

function drawElevationMini(route, canvasId, h) {
  if (!route || !route.elevPoints) return;
  setTimeout(() => drawElevationCanvas(route, canvasId, h), 50);
}

// ---- UTILS -----------------------------------------------
function formatTime(ms, noHours) {
  if (ms === null || ms === undefined) return '—';
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0 && !noHours) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function formatPace(minPerKm) {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function downsample(arr, n) {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function saveRoutes() {
  localStorage.setItem('vt_routes', JSON.stringify(routes));
}

// ---- INIT ------------------------------------------------
renderRouteList();

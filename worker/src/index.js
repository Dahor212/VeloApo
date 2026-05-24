// VeloApo – Cloudflare Worker for Strava OAuth + API proxy
// Deploy: cd worker && npx wrangler deploy  v1.2

const STRAVA_AUTH    = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN   = 'https://www.strava.com/oauth/token';
const STRAVA_API     = 'https://www.strava.com/api/v3';

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = env.PWA_ORIGIN || '*';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      // Dynamic routes — check before switch
      if (url.pathname.startsWith('/api/activity/')) {
        if (url.pathname.endsWith('/streams')) return apiActivityStreams(url, env, origin);
        return apiActivityDetail(url, env, origin);
      }

      switch (url.pathname) {
        case '/':              return ok({ service: 'VeloApo Strava Worker', ok: true }, origin);
        case '/auth/login':    return authLogin(url, env, origin);
        case '/auth/callback': return authCallback(url, env, origin);
        case '/auth/status':   return authStatus(env, origin);
        case '/auth/logout':   return authLogout(env, origin);
        case '/api/activities':return apiActivities(url, env, origin);
        default:               return ok({ error: 'Not found' }, origin, 404);
      }
    } catch (e) {
      return ok({ error: e.message }, origin, 500);
    }
  }
};

// ── Auth: redirect to Strava ──────────────────────────────────────────────────
function authLogin(url, env, origin) {
  const redirectUri = `${url.origin}/auth/callback`;
  const params = new URLSearchParams({
    client_id:       env.STRAVA_CLIENT_ID,
    redirect_uri:    redirectUri,
    response_type:   'code',
    approval_prompt: 'auto',
    scope:           'read,activity:read_all',
  });
  return Response.redirect(`${STRAVA_AUTH}?${params}`, 302);
}

// ── Auth: exchange code for tokens ───────────────────────────────────────────
async function authCallback(url, env, origin) {
  const code  = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const pwaBase = env.PWA_ORIGIN || 'https://dahor212.github.io';

  if (error || !code) {
    return Response.redirect(`${pwaBase}/VeloApo/?strava=error`, 302);
  }

  const res = await fetch(STRAVA_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code,
      grant_type:    'authorization_code',
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    return Response.redirect(`${pwaBase}/VeloApo/?strava=error`, 302);
  }

  await Promise.all([
    env.KV.put('access_token',    data.access_token),
    env.KV.put('refresh_token',   data.refresh_token),
    env.KV.put('token_expires_at', String(data.expires_at)),
    env.KV.put('athlete_id',      String(data.athlete?.id   || '')),
    env.KV.put('athlete_name',    data.athlete?.firstname ? `${data.athlete.firstname} ${data.athlete.lastname || ''}`.trim() : 'Athlete'),
  ]);

  return Response.redirect(`${pwaBase}/VeloApo/?strava=connected`, 302);
}

// ── Auth: status ─────────────────────────────────────────────────────────────
async function authStatus(env, origin) {
  const athleteId   = await env.KV.get('athlete_id');
  const athleteName = await env.KV.get('athlete_name');
  return ok({ connected: !!athleteId, athleteName: athleteName || null }, origin);
}

// ── Auth: logout ─────────────────────────────────────────────────────────────
async function authLogout(env, origin) {
  await Promise.all([
    env.KV.delete('access_token'),
    env.KV.delete('refresh_token'),
    env.KV.delete('token_expires_at'),
    env.KV.delete('athlete_id'),
    env.KV.delete('athlete_name'),
  ]);
  return ok({ ok: true }, origin);
}

// ── API: activities ───────────────────────────────────────────────────────────
async function apiActivities(url, env, origin) {
  const token = await getValidToken(env);
  if (!token) return ok({ error: 'not_authenticated', activities: [] }, origin, 401);

  const perPage = url.searchParams.get('per_page') || '40';
  const after   = url.searchParams.get('after')    || '';  // unix timestamp

  let apiUrl = `${STRAVA_API}/athlete/activities?per_page=${perPage}`;
  if (after) apiUrl += `&after=${after}`;

  const res = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return ok({ error: 'strava_api_error', status: res.status, activities: [] }, origin, 502);

  const raw = await res.json();

  // Keep only cycling activities, map to minimal shape
  const activities = raw
    .filter(a => a.type === 'Ride' || a.type === 'VirtualRide' || a.sport_type === 'Ride')
    .map(a => ({
      id:         a.id,
      name:       a.name,
      date:       a.start_date,
      distKm:     parseFloat((a.distance / 1000).toFixed(2)),
      durationMs: (a.moving_time || 0) * 1000,
      elevM:      Math.round(a.total_elevation_gain || 0),
      type:       a.type,
    }));

  return ok({ activities }, origin);
}

// ── API: activity detail ──────────────────────────────────────────────────────
async function apiActivityDetail(url, env, origin) {
  const token = await getValidToken(env);
  if (!token) return ok({ error: 'not_authenticated' }, origin, 401);
  const id = url.pathname.split('/').pop();
  const res = await fetch(`${STRAVA_API}/activities/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return ok({ error: 'strava_api_error' }, origin, 502);
  const a = await res.json();
  return ok({
    id: a.id,
    name: a.name,
    date: a.start_date,
    distKm: parseFloat((a.distance / 1000).toFixed(2)),
    durationMs: (a.moving_time || 0) * 1000,
    elapsedMs: (a.elapsed_time || 0) * 1000,
    elevM: Math.round(a.total_elevation_gain || 0),
    elevHigh: Math.round(a.elev_high || 0),
    elevLow: Math.round(a.elev_low || 0),
    avgSpeedKmh: parseFloat(((a.average_speed || 0) * 3.6).toFixed(1)),
    maxSpeedKmh: parseFloat(((a.max_speed || 0) * 3.6).toFixed(1)),
    avgWatts: a.average_watts || null,
    maxWatts: a.max_watts || null,
    weightedWatts: a.weighted_average_watts || null,
    kilojoules: a.kilojoules || null,
    avgHr: a.average_heartrate || null,
    maxHr: a.max_heartrate || null,
    avgCadence: a.average_cadence || null,
    calories: a.calories || null,
    sufferScore: a.suffer_score || null,
    avgTemp: a.average_temp || null,
    polyline: a.map?.summary_polyline || null,
    startLatlng: a.start_latlng || null,
    description: a.description || '',
    deviceName: a.device_name || null,
    prCount: a.pr_count || 0,
  }, origin);
}

// ── API: activity streams ─────────────────────────────────────────────────────
async function apiActivityStreams(url, env, origin) {
  const token = await getValidToken(env);
  if (!token) return ok({ error: 'not_authenticated' }, origin, 401);
  const parts = url.pathname.split('/');
  const id = parts[parts.length - 2];
  const keys = 'altitude,distance,velocity_smooth,heartrate,watts,cadence';
  const res = await fetch(`${STRAVA_API}/activities/${id}/streams?keys=${keys}&key_by_type=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return ok({ error: 'strava_api_error', streams: {} }, origin, 502);
  const streams = await res.json();
  const result = {};
  if (streams.altitude)         result.altitude  = streams.altitude.data;
  if (streams.distance)         result.distance  = streams.distance.data;
  if (streams.velocity_smooth)  result.speed     = streams.velocity_smooth.data.map(v => parseFloat((v * 3.6).toFixed(1)));
  if (streams.heartrate)        result.heartrate = streams.heartrate.data;
  if (streams.watts)            result.watts     = streams.watts.data;
  if (streams.cadence)          result.cadence   = streams.cadence.data;
  return ok({ streams: result }, origin);
}

// ── Token refresh helper ──────────────────────────────────────────────────────
async function getValidToken(env) {
  const [token, expiresAt, refreshToken] = await Promise.all([
    env.KV.get('access_token'),
    env.KV.get('token_expires_at'),
    env.KV.get('refresh_token'),
  ]);

  const now = Math.floor(Date.now() / 1000);
  if (!token || !refreshToken) return null;

  // Refresh if expires within 5 minutes
  if (parseInt(expiresAt || '0') - now < 300) {
    const res = await fetch(STRAVA_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     env.STRAVA_CLIENT_ID,
        client_secret: env.STRAVA_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
      }),
    });
    const data = await res.json();
    if (!data.access_token) return null;
    await Promise.all([
      env.KV.put('access_token',    data.access_token),
      env.KV.put('refresh_token',   data.refresh_token || refreshToken),
      env.KV.put('token_expires_at', String(data.expires_at)),
    ]);
    return data.access_token;
  }

  return token;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function ok(data, origin, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

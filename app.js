// Mullet Buffet Tracker
// The buffet list lives in data/buffets.json in the GitHub repo, so every device sees the same data.
// Visitors read it from the website. The editor signs in with a GitHub token, and saves commit straight to the repo.
const REPO = 'brettmauck/MR-repos';
const BRANCH = 'master';
const DATA_PATH = 'data/buffets.json';
const TOKEN_KEY = 'mullet-buffet-github-token';
const API_URL = `https://api.github.com/repos/${REPO}/contents/${DATA_PATH}`;

let visits = [];
let sortKey = 'order';
let sortDir = 1;
let editingId = null;
let token = readToken();

// ---------- helpers ----------
const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');
const chronological = () => [...visits].sort(byDate);
// Any metric can be null, meaning "not tracked" in that review. Nulls are left out of averages.
const known = x => x !== null && x !== undefined && x !== '';
const delta = v => known(v.mullet) && known(v.yelp) ? +(v.mullet - v.yelp).toFixed(1) : null;
const fmtMoney = n => '$' + Number(n).toFixed(2);
const fmtDelta = d => (d > 0 ? '+' : '') + d.toFixed(1);
const avg = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
const NA = '<span class="na">—</span>';
const numOrNull = s => s === '' ? null : +s;
const boolOrNull = s => s === '' ? null : s === 'true';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stateOf = addr => {
  const m = String(addr).match(/,\s*([A-Z]{2})\b(?:\s+\d{5})?\s*$/);
  return m ? m[1] : null;
};
// Accepts an "address" that is really coordinates, e.g. "39.19,-84.24".
const parseCoords = s => {
  const m = String(s).match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  return m ? { lat: +m[1], lng: +m[2] } : null;
};
function toast(msg, ms = 3500) {
  const el = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- token (stored only on this device) ----------
function readToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function writeToken(t) {
  token = t;
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
  document.body.classList.toggle('is-editor', !!t);
}

// ---------- GitHub data ----------
const toBase64 = str => btoa(unescape(encodeURIComponent(str)));
const fromBase64 = b64 => decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));

async function githubGet() {
  const res = await fetch(`${API_URL}?ref=${BRANCH}&t=${Date.now()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (res.status === 401) throw new Error('auth');
  if (!res.ok) throw new Error('GitHub read failed (' + res.status + ': ' + ((await res.json().catch(() => ({}))).message || '') + ')');
  const body = await res.json();
  return { list: JSON.parse(fromBase64(body.content)), sha: body.sha };
}

// Applies `change` to the latest list on GitHub and commits it. Retries once if the file changed meanwhile.
async function githubSave(change, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { list, sha } = await githubGet();
    const next = change(list).sort(byDate);
    const res = await fetch(API_URL, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, branch: BRANCH, sha, content: toBase64(JSON.stringify(next, null, 2) + '\n') }),
    });
    if (res.ok) return next;
    if (res.status === 401) throw new Error('auth');
    if (res.status === 403 || res.status === 404) {
      // The token can read but GitHub won't let it write. Keep GitHub's own reason for troubleshooting.
      const why = (await res.json().catch(() => ({}))).message || res.status;
      throw new Error('write:' + why);
    }
    if (res.status !== 409 && res.status !== 422) throw new Error('GitHub save failed (' + res.status + ')');
  }
  throw new Error('GitHub save failed (file kept changing)');
}

async function loadVisits() {
  if (token) {
    try { return (await githubGet()).list; }
    catch (e) { if (e.message === 'auth') toast('Your GitHub token stopped working. Sign in again with the 🔑 button.'); }
  }
  // Public copy served by GitHub Pages (can be ~1 minute behind a fresh save).
  const res = await fetch(`${DATA_PATH}?t=${Date.now()}`, { cache: 'no-store' });
  return res.ok ? res.json() : [];
}

function friendlyError(e) {
  if (e.message === 'auth') return 'GitHub says your token is invalid or expired. Tap 🔑, sign out, and sign in with a new token.';
  if (e.message.startsWith('write:')) {
    return "Your token can read the buffet list but isn't allowed to save it. On GitHub, edit the token and set Contents to \"Read and write\". (GitHub said: " + e.message.slice(6) + ')';
  }
  return "Couldn't save to GitHub: " + e.message;
}

// ---------- tabs ----------
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
  if (btn.dataset.tab === 'map') setTimeout(() => { map.invalidateSize(); fitMap(); }, 0);
}));

// ---------- stats ----------
function renderStats() {
  const states = new Set(visits.map(v => stateOf(v.address)).filter(Boolean));
  const n = visits.length;
  // Each metric uses only the buffets where it was tracked; "x of n" shows when some are missing.
  const metric = (label, values, fmt) => {
    const vals = values.filter(known);
    return [label, vals.length ? fmt(vals) : '–', vals.length < n ? `based on ${vals.length} of ${n}` : ''];
  };
  const pct = vals => Math.round(100 * vals.filter(Boolean).length / vals.length) + '%';
  const items = [
    ['Buffets', n, ''],
    ['States', states.size, ''],
    metric('Avg Mullet ★', visits.map(v => v.mullet), vals => avg(vals).toFixed(2)),
    metric('Avg Yelp ★', visits.map(v => v.yelp), vals => avg(vals).toFixed(2)),
    metric('Avg Δ', visits.map(delta), vals => fmtDelta(avg(vals))),
    metric('Gooning', visits.map(v => v.gooning), pct),
    metric('Pizza', visits.map(v => v.pizza), pct),
    metric('Avg cost (2)', visits.map(v => v.cost), vals => fmtMoney(avg(vals))),
  ];
  document.getElementById('stats').innerHTML = items
    .map(([l, v, sub]) => `<div class="stat"><div class="label">${l}</div><div class="value">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`).join('');
}

// ---------- map ----------
const US_BOUNDS = [[24.4, -125], [49.4, -66.9]];
const map = L.map('map', { scrollWheelZoom: true }).fitBounds(US_BOUNDS);
// Free OpenStreetMap tiles, no API key needed.
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
}).addTo(map);
const layer = L.layerGroup().addTo(map);

function popupHtml(v, n) {
  const d = delta(v);
  return `<h3>#${n} ${esc(v.name)}</h3>
    <div>${esc(v.address)}</div>
    <div>${esc(v.date)}</div>
    <div>Yelp ${known(v.yelp) ? v.yelp + '★' : '—'} · Mullet ${known(v.mullet) ? v.mullet + '★' : '—'} · Δ <b>${d === null ? '—' : fmtDelta(d)}</b></div>
    <div>${v.gooning === null || v.gooning === undefined ? 'Gooning: —' : v.gooning ? '🔥 Gooning' : '🚫 Not gooning'} · ${v.pizza === null || v.pizza === undefined ? 'Pizza: —' : v.pizza ? '🍕 Pizza' : 'No pizza'}</div>
    <div>${known(v.cost) ? fmtMoney(v.cost) + ' for 2' : 'Cost: —'}</div>
    ${v.fortune ? `<div class="fortune">🥠 “${esc(v.fortune)}”</div>` : ''}
    ${v.link ? `<div><a href="${esc(v.link)}" target="_blank" rel="noopener">Watch the review</a></div>` : ''}`;
}

function renderMap() {
  layer.clearLayers();
  const located = chronological().filter(v => Number.isFinite(v.lat) && Number.isFinite(v.lng));
  if (located.length > 1) {
    L.polyline(located.map(v => [v.lat, v.lng]), { color: '#c8102e', weight: 3, opacity: 0.8, dashArray: '6 6' }).addTo(layer);
  }
  located.forEach((v, i) => {
    const latest = i === located.length - 1;
    const icon = L.divIcon({ className: '', html: `<div class="num-marker${latest ? ' latest' : ''}">${i + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    L.marker([v.lat, v.lng], { icon, title: v.name }).bindPopup(popupHtml(v, i + 1)).addTo(layer);
  });
  const missing = visits.length - located.length;
  document.getElementById('map-hint').textContent = visits.length === 0
    ? 'No buffets logged yet.'
    : `Numbers show visit order; the dashed line is the route. The latest stop is gold.${missing ? ` ${missing} buffet(s) have no map location yet.` : ''}`;
}
function fitMap() {
  const pts = visits.filter(v => Number.isFinite(v.lat)).map(v => [v.lat, v.lng]);
  if (pts.length >= 2) map.fitBounds(pts, { padding: [40, 40], maxZoom: 8 });
  else if (pts.length === 1) map.setView(pts[0], 8);
  else map.fitBounds(US_BOUNDS);
}

// ---------- table ----------
function renderTable() {
  const order = new Map(chronological().map((v, i) => [v.id, i + 1]));
  const val = (v, k) => k === 'order' ? order.get(v.id) : k === 'delta' ? delta(v) : v[k];
  const rows = [...visits].sort((a, b) => {
    const x = val(a, sortKey), y = val(b, sortKey);
    if (!known(x) || !known(y)) return known(x) ? -1 : known(y) ? 1 : 0;
    return (x > y ? 1 : x < y ? -1 : 0) * sortDir;
  });
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.classList.toggle('sorted', th.dataset.sort === sortKey);
    th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (th.dataset.sort === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : '');
  });
  document.querySelector('#log-table tbody').innerHTML = rows.map(v => {
    const d = delta(v);
    return `<tr>
      <td class="num">${order.get(v.id)}</td>
      <td>${esc(v.date)}</td>
      <td>${v.link ? `<a href="${esc(v.link)}" target="_blank" rel="noopener">${esc(v.name)}</a>` : esc(v.name)}</td>
      <td class="addr">${esc(v.address)}${Number.isFinite(v.lat) ? '' : ' <span class="no-loc">(not on map)</span>'}</td>
      <td class="num">${known(v.yelp) ? Number(v.yelp).toFixed(1) : NA}</td>
      <td class="num">${known(v.mullet) ? Number(v.mullet).toFixed(1) : NA}</td>
      <td class="num ${d > 0 ? 'delta-pos' : d < 0 ? 'delta-neg' : ''}">${d === null ? NA : fmtDelta(d)}</td>
      <td>${known(v.gooning) ? `<span class="pill ${v.gooning ? 'yes' : ''}">${v.gooning ? 'Gooning' : 'Not gooning'}</span>` : NA}</td>
      <td>${known(v.pizza) ? `<span class="pill ${v.pizza ? 'yes' : ''}">${v.pizza ? '🍕 Yes' : 'No'}</span>` : NA}</td>
      <td class="num">${known(v.cost) ? fmtMoney(v.cost) : NA}</td>
      <td class="fortune-cell">${v.fortune ? '“' + esc(v.fortune) + '”' : NA}</td>
      <td class="row-actions editor-only"><button data-edit="${esc(v.id)}">Edit</button> <button data-del="${esc(v.id)}">Delete</button></td>
    </tr>`;
  }).join('');
  document.getElementById('log-empty').textContent = visits.length ? '' : 'No buffets logged yet.';
}

document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
  if (sortKey === th.dataset.sort) sortDir *= -1; else { sortKey = th.dataset.sort; sortDir = 1; }
  renderTable();
}));
document.querySelector('#log-table tbody').addEventListener('click', async e => {
  const editId = e.target.dataset.edit, delId = e.target.dataset.del;
  if (editId) openDialog(visits.find(v => v.id === editId));
  if (delId) {
    const v = visits.find(x => x.id === delId);
    if (!v || !confirm(`Delete ${v.name}?`)) return;
    e.target.disabled = true;
    try {
      visits = await githubSave(list => list.filter(x => x.id !== delId), `Delete buffet: ${v.name}`);
      render();
      toast('Deleted. Other devices update in about a minute.');
    } catch (err) {
      e.target.disabled = false;
      alert(friendlyError(err));
    }
  }
});

// ---------- add / edit ----------
const dialog = document.getElementById('visit-dialog');
const form = document.getElementById('visit-form');
const status = document.getElementById('form-status');
const saveBtn = document.getElementById('save-btn');

function openDialog(v) {
  editingId = v ? v.id : null;
  form.reset();
  status.textContent = '';
  saveBtn.disabled = false;
  document.getElementById('dialog-title').textContent = v ? 'Edit buffet' : 'Add buffet';
  const f = form.elements;
  f.date.value = v?.date ?? new Date().toISOString().slice(0, 10);
  f.name.value = v?.name ?? '';
  f.address.value = v?.address ?? '';
  f.yelp.value = v?.yelp ?? '';
  f.mullet.value = v?.mullet ?? '';
  f.gooning.value = known(v?.gooning) ? String(v.gooning) : '';
  f.pizza.value = known(v?.pizza) ? String(v.pizza) : '';
  f.cost.value = v?.cost ?? '';
  f.link.value = v?.link ?? '';
  f.fortune.value = v?.fortune ?? '';
  f.lat.value = v?.lat ?? '';
  f.lng.value = v?.lng ?? '';
  form.dataset.origAddress = v?.address ?? '';
  form.dataset.origLat = f.lat.value;
  form.dataset.origLng = f.lng.value;
  dialog.showModal();
}
document.getElementById('add-btn').addEventListener('click', () => openDialog(null));
document.getElementById('cancel-btn').addEventListener('click', () => dialog.close());

// ---------- address lookup ----------
// Tries several free services in turn. Returns { lat, lng, approx } or null.
// approx = true means only the city/ZIP was found, not the exact street address.

// Suite/unit numbers confuse most lookups, so drop them: "123 Main St Ste 4, Town, ST" -> "123 Main St, Town, ST".
const cleanAddress = a => a.replace(/\s*(?:,\s*)?(?:#\s*|\b(?:suite|ste|unit|apt|bldg|building)\b\.?\s+)[\w-]*\d[\w-]*/gi, '').replace(/\s+,/g, ',').trim();

function withTimeout(promise, ms = 8000) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

// US Census Bureau geocoder: free, no key, very good for US street addresses.
// It doesn't allow normal cross-site requests, so it is called with a <script> tag (JSONP).
function censusLookup(address) {
  return withTimeout(new Promise((resolve, reject) => {
    const cb = 'censusCb' + Date.now() + Math.floor(Math.random() * 1e6);
    const script = document.createElement('script');
    const done = () => { delete window[cb]; script.remove(); };
    window[cb] = data => {
      done();
      const m = data?.result?.addressMatches?.[0];
      resolve(m ? { lat: m.coordinates.y, lng: m.coordinates.x } : null);
    };
    script.onerror = () => { done(); reject(new Error('census failed')); };
    script.src = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=jsonp'
      + '&callback=' + cb + '&address=' + encodeURIComponent(address);
    document.head.appendChild(script);
  }));
}

// OpenStreetMap Nominatim (light use only).
async function nominatimLookup(query) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(query);
  const res = await withTimeout(fetch(url, { headers: { Accept: 'application/json' } }));
  if (!res.ok) throw new Error('nominatim failed');
  const [hit] = await res.json();
  return hit ? { lat: +hit.lat, lng: +hit.lon } : null;
}

// Photon: OpenStreetMap-based search that is more forgiving with typos and formatting.
async function photonLookup(query) {
  const url = 'https://photon.komoot.io/api/?limit=1&lang=en&q=' + encodeURIComponent(query);
  const res = await withTimeout(fetch(url));
  if (!res.ok) throw new Error('photon failed');
  const hit = (await res.json()).features?.find(f => f.properties?.countrycode === 'US');
  return hit ? { lat: hit.geometry.coordinates[1], lng: hit.geometry.coordinates[0] } : null;
}

async function geocode(address) {
  const coords = parseCoords(address);
  if (coords) return coords;
  const clean = cleanAddress(address);
  const exact = [() => censusLookup(clean), () => nominatimLookup(clean), () => photonLookup(clean)];
  let reached = false;
  for (const lookup of exact) {
    try {
      const hit = await lookup();
      reached = true;
      if (hit) return hit;
    } catch { /* service down or blocked: try the next one */ }
  }
  // Last resort: just the town/state/ZIP (everything after the street part).
  const area = clean.split(',').slice(1).join(',').trim();
  if (area) {
    for (const lookup of [() => nominatimLookup(area), () => photonLookup(area)]) {
      try {
        const hit = await lookup();
        reached = true;
        if (hit) return { ...hit, approx: true };
      } catch {}
    }
  }
  if (!reached) throw new Error('No address lookup service could be reached');
  return null;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const f = form.elements;
  const v = {
    id: editingId ?? (crypto.randomUUID?.() || String(Date.now())),
    date: f.date.value,
    name: f.name.value.trim(),
    address: f.address.value.trim(),
    yelp: numOrNull(f.yelp.value),
    mullet: numOrNull(f.mullet.value),
    gooning: boolOrNull(f.gooning.value),
    pizza: boolOrNull(f.pizza.value),
    cost: numOrNull(f.cost.value),
    link: f.link.value.trim(),
    fortune: f.fortune.value.trim(),
    lat: f.lat.value === '' ? null : +f.lat.value,
    lng: f.lng.value === '' ? null : +f.lng.value,
  };
  saveBtn.disabled = true;

  // Look up the pin if there is none, or if the address changed but the pin was not edited by hand.
  const addressChanged = v.address !== form.dataset.origAddress;
  const pinUntouched = f.lat.value === form.dataset.origLat && f.lng.value === form.dataset.origLng;
  let warning = '';
  if (v.lat === null || v.lng === null || (addressChanged && pinUntouched)) {
    status.textContent = 'Finding address on the map…';
    try {
      const loc = await geocode(v.address);
      if (loc) {
        v.lat = loc.lat;
        v.lng = loc.lng;
        if (loc.approx) warning = "Couldn't find the exact street address, so the pin is at the town/ZIP instead. You can fix it under Map location.";
      }
      else warning = "Couldn't find that address on the map. You can edit it and enter lat/long by hand.";
    } catch {
      warning = "Couldn't reach the map service, so this buffet has no map pin yet.";
    }
  }

  status.textContent = 'Saving to GitHub…';
  try {
    visits = await githubSave(
      list => [...list.filter(x => x.id !== v.id), v],
      `${editingId ? 'Update' : 'Add'} buffet: ${v.name}`,
    );
    render();
    dialog.close();
    toast(warning || 'Saved! Other devices update in about a minute.', warning ? 6000 : 3500);
  } catch (err) {
    status.textContent = friendlyError(err);
    saveBtn.disabled = false;
  }
});

// ---------- import / export ----------
document.getElementById('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(chronological(), null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'mullet-buffets.json' });
  a.click();
  URL.revokeObjectURL(a.href);
});
document.getElementById('import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error();
  } catch { return alert('That file is not a valid buffet export.'); }
  if (!confirm(`Replace the whole buffet list (${visits.length} buffets) with the ${data.length} in this file?`)) return;
  try {
    visits = await githubSave(() => data, `Import ${data.length} buffets`);
    render(true);
    toast('Imported.');
  } catch (err) { alert(friendlyError(err)); }
});

// ---------- editor sign-in ----------
const editorDialog = document.getElementById('editor-dialog');
const editorStatus = document.getElementById('editor-status');
function openEditorDialog() {
  const signedIn = !!token;
  document.getElementById('editor-signed-out').hidden = signedIn;
  document.getElementById('editor-signed-in').hidden = !signedIn;
  document.getElementById('editor-signin').hidden = signedIn;
  document.getElementById('editor-signout').hidden = !signedIn;
  editorStatus.textContent = '';
  document.getElementById('editor-form').reset();
  editorDialog.showModal();
}
document.getElementById('editor-btn').addEventListener('click', openEditorDialog);
document.getElementById('editor-close').addEventListener('click', () => editorDialog.close());
document.getElementById('editor-signout').addEventListener('click', () => {
  writeToken('');
  editorDialog.close();
  toast('Signed out on this device.');
});
document.getElementById('editor-form').addEventListener('submit', async e => {
  e.preventDefault();
  const t = e.target.elements.token.value.trim();
  if (!t) return;
  editorStatus.textContent = 'Checking token…';
  const prev = token;
  token = t;
  try {
    // A token that can read the file AND push to the repo is good to go.
    const res = await fetch(`https://api.github.com/repos/${REPO}`, { headers: { Authorization: `Bearer ${t}` } });
    const repo = res.ok ? await res.json() : null;
    if (!repo?.permissions?.push) throw new Error('auth');
    visits = (await githubGet()).list;
    writeToken(t);
    render(true);
    editorDialog.close();
    toast("Signed in. You can add and edit buffets on this device.");
  } catch {
    token = prev;
    editorStatus.textContent = "That token didn't work. It needs Contents: Read and write access to the MR-repos repo.";
  }
});

// ---------- boot ----------
function render(refit) {
  renderStats();
  renderTable();
  renderMap();
  renderAnalytics();
  if (refit) fitMap();
}
writeToken(token);
loadVisits()
  .then(list => { visits = Array.isArray(list) ? list : []; render(true); })
  .catch(() => { render(true); toast("Couldn't load the buffet list."); });

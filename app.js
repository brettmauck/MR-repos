// Mullet Buffet Tracker
// Visits are saved in this browser (localStorage). Use Export/Import JSON to back up or share.
const STORAGE_KEY = 'mullet-buffet-visits-v1';

let visits = load();
let sortKey = 'order';
let sortDir = 1;
let editingId = null;

// ---------- storage ----------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(visits)); } catch {}
}

// ---------- helpers ----------
const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');
const chronological = () => [...visits].sort(byDate);
const delta = v => +(v.mullet - v.yelp).toFixed(1);
const fmtMoney = n => '$' + Number(n).toFixed(2);
const fmtDelta = d => (d > 0 ? '+' : '') + d.toFixed(1);
const avg = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stateOf = addr => {
  const m = String(addr).match(/,\s*([A-Z]{2})\b(?:\s+\d{5})?\s*$/);
  return m ? m[1] : null;
};

// ---------- tabs ----------
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
  if (btn.dataset.tab === 'map') setTimeout(() => { map.invalidateSize(); fitMap(); }, 0);
}));

// ---------- stats ----------
function renderStats() {
  const states = new Set(visits.map(v => stateOf(v.address)).filter(Boolean));
  const items = [
    ['Buffets', visits.length],
    ['States', states.size],
    ['Avg Mullet ★', visits.length ? avg(visits.map(v => v.mullet)).toFixed(2) : '–'],
    ['Avg Yelp ★', visits.length ? avg(visits.map(v => v.yelp)).toFixed(2) : '–'],
    ['Avg Δ', visits.length ? fmtDelta(avg(visits.map(delta))) : '–'],
    ['Gooning', visits.length ? Math.round(100 * visits.filter(v => v.gooning).length / visits.length) + '%' : '–'],
    ['Pizza', visits.length ? Math.round(100 * visits.filter(v => v.pizza).length / visits.length) + '%' : '–'],
    ['Avg cost (2)', visits.length ? fmtMoney(avg(visits.map(v => +v.cost))) : '–'],
  ];
  document.getElementById('stats').innerHTML = items
    .map(([l, v]) => `<div class="stat"><div class="label">${l}</div><div class="value">${v}</div></div>`).join('');
}

// ---------- map ----------
const US_BOUNDS = [[24.4, -125], [49.4, -66.9]];
const map = L.map('map', { scrollWheelZoom: true }).fitBounds(US_BOUNDS);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO', maxZoom: 19,
}).addTo(map);
const layer = L.layerGroup().addTo(map);

function popupHtml(v, n) {
  const d = delta(v);
  return `<h3>#${n} ${esc(v.name)}</h3>
    <div>${esc(v.address)}</div>
    <div>${esc(v.date)}</div>
    <div>Yelp ${v.yelp}★ · Mullet ${v.mullet}★ · Δ <b>${fmtDelta(d)}</b></div>
    <div>${v.gooning ? '🔥 Gooning' : '🚫 Not gooning'} · ${v.pizza ? '🍕 Pizza' : 'No pizza'}</div>
    <div>${fmtMoney(v.cost)} for 2</div>
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
    ? 'No buffets logged yet. Add one in the Buffet Log tab.'
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
      <td class="num">${v.yelp.toFixed(1)}</td>
      <td class="num">${v.mullet.toFixed(1)}</td>
      <td class="num ${d > 0 ? 'delta-pos' : d < 0 ? 'delta-neg' : ''}">${fmtDelta(d)}</td>
      <td><span class="pill ${v.gooning ? 'yes' : ''}">${v.gooning ? 'Gooning' : 'Not gooning'}</span></td>
      <td><span class="pill ${v.pizza ? 'yes' : ''}">${v.pizza ? '🍕 Yes' : 'No'}</span></td>
      <td class="num">${fmtMoney(v.cost)}</td>
      <td class="row-actions"><button data-edit="${v.id}">Edit</button> <button data-del="${v.id}">Delete</button></td>
    </tr>`;
  }).join('');
  document.getElementById('log-empty').textContent = visits.length ? '' : 'No buffets yet. Tap "+ Add buffet" (or "Load demo data" to try it out).';
}

document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
  if (sortKey === th.dataset.sort) sortDir *= -1; else { sortKey = th.dataset.sort; sortDir = 1; }
  renderTable();
}));
document.querySelector('#log-table tbody').addEventListener('click', e => {
  const editId = e.target.dataset.edit, delId = e.target.dataset.del;
  if (editId) openDialog(visits.find(v => v.id === editId));
  if (delId && confirm('Delete this buffet?')) { visits = visits.filter(v => v.id !== delId); commit(); }
});

// ---------- add / edit ----------
const dialog = document.getElementById('visit-dialog');
const form = document.getElementById('visit-form');
const status = document.getElementById('form-status');

function openDialog(v) {
  editingId = v ? v.id : null;
  form.reset();
  status.textContent = '';
  document.getElementById('dialog-title').textContent = v ? 'Edit buffet' : 'Add buffet';
  const f = form.elements;
  f.date.value = v?.date ?? new Date().toISOString().slice(0, 10);
  f.name.value = v?.name ?? '';
  f.address.value = v?.address ?? '';
  f.yelp.value = v?.yelp ?? '';
  f.mullet.value = v?.mullet ?? '';
  f.gooning.value = String(v?.gooning ?? true);
  f.pizza.value = String(v?.pizza ?? false);
  f.cost.value = v?.cost ?? '';
  f.link.value = v?.link ?? '';
  f.lat.value = v?.lat ?? '';
  f.lng.value = v?.lng ?? '';
  form.dataset.origAddress = v?.address ?? '';
  form.dataset.origLat = f.lat.value;
  form.dataset.origLng = f.lng.value;
  dialog.showModal();
}
document.getElementById('add-btn').addEventListener('click', () => openDialog(null));
document.getElementById('cancel-btn').addEventListener('click', () => dialog.close());

// Free geocoding via OpenStreetMap Nominatim (light use only).
async function geocode(address) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(address);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Geocoding failed');
  const [hit] = await res.json();
  return hit ? { lat: +hit.lat, lng: +hit.lon } : null;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const f = form.elements;
  const v = {
    id: editingId ?? (crypto.randomUUID?.() || String(Date.now())),
    date: f.date.value,
    name: f.name.value.trim(),
    address: f.address.value.trim(),
    yelp: +f.yelp.value,
    mullet: +f.mullet.value,
    gooning: f.gooning.value === 'true',
    pizza: f.pizza.value === 'true',
    cost: +f.cost.value,
    link: f.link.value.trim(),
    lat: f.lat.value === '' ? null : +f.lat.value,
    lng: f.lng.value === '' ? null : +f.lng.value,
  };
  // Look up the pin if there is none, or if the address changed but the pin was not edited by hand.
  const addressChanged = v.address !== form.dataset.origAddress;
  const pinUntouched = f.lat.value === form.dataset.origLat && f.lng.value === form.dataset.origLng;
  if (v.lat === null || v.lng === null || (addressChanged && pinUntouched)) {
    status.textContent = 'Finding address on the map…';
    document.getElementById('save-btn').disabled = true;
    try {
      const loc = await geocode(v.address);
      if (loc) Object.assign(v, loc);
      else status.textContent = "Couldn't find that address. Saved without a map pin; you can enter lat/long manually.";
    } catch {
      status.textContent = "Couldn't reach the map service. Saved without a map pin.";
    }
    document.getElementById('save-btn').disabled = false;
  }
  const i = visits.findIndex(x => x.id === v.id);
  if (i >= 0) visits[i] = v; else visits.push(v);
  commit();
  if (Number.isFinite(v.lat)) dialog.close();
});

// ---------- import / export / demo ----------
document.getElementById('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(chronological(), null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'mullet-buffets.json' });
  a.click();
  URL.revokeObjectURL(a.href);
});
document.getElementById('import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error();
    visits = data;
    commit(true);
  } catch { alert('That file is not a valid buffet export.'); }
  e.target.value = '';
});
document.getElementById('demo-btn').addEventListener('click', async () => {
  if (visits.length && !confirm('Replace your current list with demo data?')) return;
  const res = await fetch('data/demo.json');
  visits = await res.json();
  commit(true);
});

// ---------- boot ----------
function commit(refit) {
  save();
  renderStats();
  renderTable();
  renderMap();
  if (refit) fitMap();
}
commit(true);

// Analytics tab. Everything here is recalculated from the buffet list on every render,
// so new buffets show up in the rankings automatically.
// Uses helpers from app.js (visits, known, delta, stateOf, esc, fmtMoney, fmtDelta, avg, chronological).

// A state needs at least this many buffets with data before it can be ranked,
// so one lucky visit doesn't crown a state champion.
const MIN_STATE_SAMPLE = 3;
const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'Washington DC', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const stateName = s => STATE_NAMES[s] || s;
const pct = x => Math.round(100 * x) + '%';
const stars = x => x.toFixed(1) + '★';

// ---------- small building blocks ----------
function card(title, subtitle, body, wide) {
  return `<article class="a-card${wide ? ' wide' : ''}"><h3>${title}</h3>${subtitle ? `<p class="a-sub">${subtitle}</p>` : ''}${body}</article>`;
}
const emptyNote = msg => `<p class="a-empty">${msg}</p>`;

// Ranked list with a bar per row. rows: [{ label, detail, value, display }]. max sets the full-bar value.
function barList(rows, max, ranked = true) {
  if (!rows.length) return emptyNote('Not enough data yet.');
  const top = (max ?? Math.max(...rows.map(r => r.value), 0)) || 1;
  return `<ol class="a-bars">${rows.map((r, i) => `
    <li title="${esc(r.label)}: ${esc(r.display)}">
      <div class="a-row">${ranked ? `<span class="a-rank">${i + 1}</span>` : ''}<span class="a-label">${esc(r.label)}</span><span class="a-val">${esc(r.display)}</span></div>
      <div class="a-track"><div class="a-fill" style="width:${Math.max(2, 100 * r.value / top)}%"></div></div>
      ${r.detail ? `<div class="a-detail">${esc(r.detail)}</div>` : ''}
    </li>`).join('')}</ol>`;
}

// Ranked list without bars, for buffet superlatives.
function rankList(rows) {
  if (!rows.length) return emptyNote('Not enough data yet.');
  return `<ol class="a-list">${rows.map((r, i) => `
    <li><span class="a-rank">${i + 1}</span><div><div class="a-label">${esc(r.label)}</div><div class="a-detail">${esc(r.detail)}</div></div><span class="a-val">${esc(r.display)}</span></li>`).join('')}</ol>`;
}

// Two numbers side by side, e.g. "with pizza" vs "without pizza".
function versus(a, b, verdict) {
  const side = s => `<div class="a-vs-side"><div class="a-vs-num">${s.value}</div><div class="a-vs-label">${esc(s.label)}</div><div class="a-detail">${esc(s.n)}</div></div>`;
  return `<div class="a-vs">${side(a)}<div class="a-vs-mid">vs</div>${side(b)}</div>${verdict ? `<p class="a-verdict">${esc(verdict)}</p>` : ''}`;
}

const where = v => `${v.address.split(',').slice(-2, -1)[0]?.trim() || ''}, ${stateOf(v.address) || '?'}`.replace(/^, /, '');

// ---------- calculations ----------
function stateStats() {
  const by = {};
  for (const v of visits) {
    const s = stateOf(v.address);
    if (!s) continue;
    (by[s] ??= []).push(v);
  }
  return Object.entries(by).map(([state, list]) => {
    const rate = key => {
      const tracked = list.filter(v => known(v[key]));
      return { n: tracked.length, value: tracked.length ? tracked.filter(v => v[key]).length / tracked.length : null };
    };
    const mean = key => {
      const vals = list.map(v => v[key]).filter(known);
      return { n: vals.length, value: vals.length ? avg(vals) : null };
    };
    return { state, count: list.length, pizza: rate('pizza'), gooning: rate('gooning'), mullet: mean('mullet'), cost: mean('cost') };
  });
}

// Ranks states on one measure, only counting states with enough data.
function rankStates(stats, key, dir) {
  const eligible = stats.filter(s => s[key].value !== null && s[key].n >= MIN_STATE_SAMPLE);
  // Top and bottom lists split the eligible states so no state lands on both.
  const limit = Math.min(3, Math.max(1, Math.floor(eligible.length / 2)));
  return eligible
    .sort((a, b) => (b[key].value - a[key].value) * dir || b[key].n - a[key].n)
    .slice(0, limit);
}

function milesBetween(a, b) {
  const R = 3958.8, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const NAME_STOPWORDS = new Set(['buffet', 'buffets', 'restaurant', 'and', '&', 'the', 'ii', 'iii', '#1', 'grill', 'of', 'a']);
function nameWords() {
  const counts = {};
  for (const v of visits) {
    const name = v.name.toLowerCase().replace(/hong kong/g, 'hong_kong').replace(/new york/g, 'new_york');
    const words = new Set(name.replace(/[^\w#&\s]/g, ' ').split(/\s+/).filter(w => w && !NAME_STOPWORDS.has(w)));
    for (const w of words) (counts[w] ??= []).push(v);
  }
  return Object.entries(counts)
    .map(([word, list]) => ({ word, list, mullet: list.map(v => v.mullet).filter(known) }))
    .filter(x => x.list.length >= 2)
    .sort((a, b) => b.list.length - a.list.length || a.word.localeCompare(b.word));
}
const titleCase = w => w.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ---------- sections ----------
function stateSection() {
  const stats = stateStats();
  const pctRows = (list, key) => list.map(s => ({
    label: stateName(s.state), value: s[key].value, display: pct(s[key].value),
    detail: `${Math.round(s[key].value * s[key].n)} of ${s[key].n} buffets`,
  }));
  const qualifies = stats.filter(s => s.count >= MIN_STATE_SAMPLE).length;
  const note = `States need ${MIN_STATE_SAMPLE}+ buffets with data to be ranked (${qualifies} of ${stats.length} states qualify so far).`;

  const report = stats.filter(s => s.mullet.value !== null).sort((a, b) => b.mullet.value - a.mullet.value);
  const reportTable = report.length ? `<div class="a-table-wrap"><table class="a-table">
    <thead><tr><th>State</th><th>Buffets</th><th>Avg Mullet</th><th>Pizza</th><th>Gooning</th><th>Avg cost</th></tr></thead>
    <tbody>${report.map(s => `<tr>
      <td>${esc(stateName(s.state))}</td><td class="num">${s.count}</td>
      <td class="num">${stars(s.mullet.value)}</td>
      <td class="num">${s.pizza.value === null ? '—' : pct(s.pizza.value)}</td>
      <td class="num">${s.gooning.value === null ? '—' : pct(s.gooning.value)}</td>
      <td class="num">${s.cost.value === null ? '—' : fmtMoney(s.cost.value)}</td></tr>`).join('')}</tbody></table></div>` : emptyNote('Not enough data yet.');

  return `<h2 class="a-section">🗺️ State Showdown</h2><p class="a-note">${note}</p><div class="a-grid">
    ${card('🍕 Pizza Paradise', 'States most likely to have pizza on the buffet', barList(pctRows(rankStates(stats, 'pizza', 1), 'pizza'), 1))}
    ${card('🏜️ Pizza Deserts', 'States least likely to have pizza', barList(pctRows(rankStates(stats, 'pizza', -1), 'pizza'), 1))}
    ${card('🔥 Most Goontastic States', 'Highest share of gooning buffets', barList(pctRows(rankStates(stats, 'gooning', 1), 'gooning'), 1))}
    ${card('🧊 Least Goontastic States', 'Lowest share of gooning buffets', barList(pctRows(rankStates(stats, 'gooning', -1), 'gooning'), 1))}
    ${card('📋 State Report Card', 'Every state, ranked by average Mullet rating', reportTable, true)}
  </div>`;
}

function superlativesSection() {
  const rated = visits.filter(v => known(v.mullet));
  const withCost = rated.filter(v => known(v.cost) && v.cost > 0);
  const valueOf = v => v.mullet / v.cost * 10;
  const valueRows = list => list.map(v => ({ label: v.name, detail: `${where(v)} · ${stars(v.mullet)} for ${fmtMoney(v.cost)}`, display: valueOf(v).toFixed(2) + '★ per $10' }));
  const deltas = visits.filter(v => delta(v) !== null);
  const deltaRow = v => ({ label: v.name, detail: `${where(v)} · Yelp ${stars(v.yelp)} → Mullet ${stars(v.mullet)}`, display: fmtDelta(delta(v)) });
  const costRow = v => ({ label: v.name, detail: `${where(v)} · Mullet ${known(v.mullet) ? stars(v.mullet) : '—'}`, display: fmtMoney(v.cost) });
  const priced = visits.filter(v => known(v.cost) && v.cost > 0);
  const perfect = rated.filter(v => v.mullet >= 5);

  return `<h2 class="a-section">🏅 Buffet Superlatives</h2><div class="a-grid">
    ${card('💰 Best Mullet Value', 'Most Mullet stars per dollar (for 2 people)', rankList(valueRows([...withCost].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 5))))}
    ${card('🗑️ Worst Mullet Value', 'Fewest Mullet stars per dollar', rankList(valueRows([...withCost].sort((a, b) => valueOf(a) - valueOf(b)).slice(0, 5))))}
    ${card('😬 Biggest Letdowns', 'Yelp hyped it, Mullet did not', rankList(deltas.filter(v => delta(v) < 0).sort((a, b) => delta(a) - delta(b)).slice(0, 5).map(deltaRow)))}
    ${card('💎 Hidden Gems', 'Yelp slept on it, Mullet loved it', rankList(deltas.filter(v => delta(v) > 0).sort((a, b) => delta(b) - delta(a)).slice(0, 5).map(deltaRow)))}
    ${card('🏆 Hall of Fame', `Perfect 5.0 Mullet ratings (${perfect.length})`, rankList(perfect.map(v => ({ label: v.name, detail: `${where(v)} · ${v.date}`, display: '5.0★' }))))}
    ${card('💀 Hall of Shame', 'Lowest Mullet ratings', rankList([...rated].sort((a, b) => a.mullet - b.mullet).slice(0, 5).map(v => ({ label: v.name, detail: `${where(v)} · ${v.date}`, display: stars(v.mullet) }))))}
    ${card('💸 Biggest Bills', 'Most expensive……. for 2 people', rankList([...priced].sort((a, b) => b.cost - a.cost).slice(0, 5).map(costRow)))}
    ${card('🪙 Cheapest Dates', 'Least expensive……. for 2 people', rankList([...priced].sort((a, b) => a.cost - b.cost).slice(0, 5).map(costRow)))}
  </div>`;
}

function hotTakesSection() {
  const mulletOf = list => list.map(v => v.mullet).filter(known);
  const side = (label, list) => {
    const m = mulletOf(list);
    return { label, value: m.length ? stars(avg(m)) : '—', n: `${m.length} buffets`, avg: m.length ? avg(m) : null };
  };
  const verdict = (a, b, yes, no) => a.avg === null || b.avg === null ? '' : Math.abs(a.avg - b.avg) < 0.1 ? 'Basically no difference.' : a.avg > b.avg ? yes : no;

  const pizzaYes = side('With pizza 🍕', visits.filter(v => v.pizza === true));
  const pizzaNo = side('No pizza', visits.filter(v => v.pizza === false));
  const goonYes = side('Gooning 🔥', visits.filter(v => v.gooning === true));
  const goonNo = side('Not gooning', visits.filter(v => v.gooning === false));

  const ds = visits.map(delta).filter(d => d !== null);
  const harsher = ds.filter(d => d < -0.2).length, kinder = ds.filter(d => d > 0.2).length, agree = ds.length - harsher - kinder;
  const agreeRows = ds.length ? [
    { label: 'Mullet harsher than Yelp', value: harsher, display: `${pct(harsher / ds.length)} (${harsher})` },
    { label: 'About the same (±0.2★)', value: agree, display: `${pct(agree / ds.length)} (${agree})` },
    { label: 'Mullet kinder than Yelp', value: kinder, display: `${pct(kinder / ds.length)} (${kinder})` },
  ] : [];

  const words = nameWords().slice(0, 8).map(w => ({
    label: titleCase(w.word), value: w.list.length,
    display: `${w.list.length}×`,
    detail: w.mullet.length ? `avg Mullet ${stars(avg(w.mullet))}` : '',
  }));

  return `<h2 class="a-section">🌶️ Hot Takes</h2><div class="a-grid">
    ${card('🍕 The Pizza Effect', 'Does pizza on the buffet make Mullet happier?', versus(pizzaYes, pizzaNo, verdict(pizzaYes, pizzaNo, 'Pizza buffets score higher. The people have spoken.', 'Pizza buffets score lower. Stay in your lane, pizza.')))}
    ${card('🔥 The Goon Effect', 'Average Mullet rating when gooning vs not', versus(goonYes, goonNo, verdict(goonYes, goonNo, 'Gooning buffets score higher.', 'Not-gooning buffets score higher. Plot twist.')))}
    ${card('⚖️ Mullet vs Yelp', `How often Mullet agrees with Yelp (${ds.length} buffets)`, barList(agreeRows, ds.length, false))}
    ${card('🐉 The Name Game', 'Most common words in buffet names', barList(words))}
  </div>`;
}

function roadSection() {
  const trip = chronological();
  const located = trip.filter(v => Number.isFinite(v.lat) && Number.isFinite(v.lng));
  let miles = 0, longest = null;
  for (let i = 1; i < located.length; i++) {
    const d = milesBetween(located[i - 1], located[i]);
    miles += d;
    if (!longest || d > longest.d) longest = { d, from: located[i - 1], to: located[i] };
  }
  const dates = trip.map(v => v.date).filter(Boolean);
  const dayMs = 86400000;
  const days = dates.length ? Math.round((new Date(dates.at(-1)) - new Date(dates[0])) / dayMs) + 1 : 0;

  // Longest run of buffets on back-to-back days, and days with 2+ buffets.
  const uniqueDays = [...new Set(dates)];
  let streak = uniqueDays.length ? 1 : 0, run = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    run = (new Date(uniqueDays[i]) - new Date(uniqueDays[i - 1])) / dayMs === 1 ? run + 1 : 1;
    streak = Math.max(streak, run);
  }
  const perDay = dates.reduce((m, d) => (m[d] = (m[d] || 0) + 1, m), {});
  const doubleheaders = Object.values(perDay).filter(n => n >= 2).length;

  const months = {};
  for (const d of dates) months[d.slice(0, 7)] = (months[d.slice(0, 7)] || 0) + 1;
  const monthRows = Object.entries(months).sort().map(([m, n]) => ({
    label: new Date(m + '-15').toLocaleString('en-US', { month: 'short', year: 'numeric' }), value: n, display: `${n}`,
  }));

  const tile = (label, value, sub) => `<div class="a-tile"><div class="a-tile-label">${label}</div><div class="a-tile-value">${value}</div>${sub ? `<div class="a-detail">${esc(sub)}</div>` : ''}</div>`;
  return `<h2 class="a-section">🚗 On the Road</h2>
    <div class="a-tiles">
      ${tile('Miles between buffets', Math.round(miles).toLocaleString(), 'straight-line, in visit order')}
      ${tile('Longest haul', longest ? Math.round(longest.d).toLocaleString() + ' mi' : '–', longest ? `${longest.from.name} → ${longest.to.name}` : '')}
      ${tile('Days on tour', days || '–', dates.length ? `since ${dates[0]}` : '')}
      ${tile('Buffets per week', days ? (7 * dates.length / days).toFixed(1) : '–', '')}
      ${tile('Longest daily streak', streak ? `${streak} days` : '–', 'buffets on back-to-back days')}
      ${tile('Doubleheaders', doubleheaders, 'days with 2+ buffets')}
    </div>
    <div class="a-grid">${card('📅 Buffets per Month', '', barList(monthRows, undefined, false), true)}</div>`;
}

function fortuneSection() {
  const withFortune = visits.filter(v => v.fortune);
  const empty = withFortune.filter(v => /empty|no fortune|blank/i.test(v.fortune));
  const real = withFortune.filter(v => !empty.includes(v));
  const prophecies = real.filter(v => /\bwill\b|you['’]ll/i.test(v.fortune));
  const tile = (label, value, sub) => `<div class="a-tile"><div class="a-tile-label">${label}</div><div class="a-tile-value">${value}</div>${sub ? `<div class="a-detail">${esc(sub)}</div>` : ''}</div>`;
  return `<h2 class="a-section">🥠 Fortune Teller</h2>
    <div class="a-tiles">
      ${tile('Cookies cracked', withFortune.length, `of ${visits.length} buffets`)}
      ${tile('Predict the future', real.length ? pct(prophecies.length / real.length) : '–', 'fortunes that say "will"')}
      ${tile('Empty cookies', empty.length, 'the ultimate betrayal')}
    </div>
    <div class="a-grid">${card('🔮 Crack a Cookie', 'A random fortune from the tour', `
      <div class="a-cookie" id="a-cookie">${real.length ? 'Tap the button for a fortune.' : 'No fortunes logged yet.'}</div>
      ${real.length ? '<button id="a-crack" class="primary">Crack a cookie 🥠</button>' : ''}`, true)}</div>`;
}

function renderAnalytics() {
  const el = document.getElementById('analytics');
  if (!el) return;
  if (!visits.length) { el.innerHTML = emptyNote('No buffets logged yet.'); return; }
  el.innerHTML = stateSection() + superlativesSection() + hotTakesSection() + roadSection() + fortuneSection();
}

document.addEventListener('click', e => {
  if (e.target.id !== 'a-crack') return;
  const real = visits.filter(v => v.fortune && !/empty|no fortune|blank/i.test(v.fortune));
  const v = real[Math.floor(Math.random() * real.length)];
  document.getElementById('a-cookie').innerHTML = `<div class="a-fortune">“${esc(v.fortune)}”</div><div class="a-detail">${esc(v.name)} · ${esc(where(v))} · ${esc(v.date)}</div>`;
});

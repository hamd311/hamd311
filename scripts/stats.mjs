// Generates profile stat cards (stats.svg, languages.svg, activity.svg) into ./dist
// Runs in GitHub Actions with GITHUB_TOKEN — no third-party servers involved.
import fs from 'node:fs';

const LOGIN = process.env.GH_USER || 'hamd311';
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = process.env.OUT_DIR || 'dist';

const C = {
  bg1: '#0a1020', bg2: '#0d2238', border: '#1f3b5a', title: '#2dd4bf',
  text: '#cbd5e1', muted: '#64748b', strong: '#f1f5f9', accent: '#38bdf8',
};
const FONT = "'Segoe UI', Inter, 'Helvetica Neue', Arial, sans-serif";
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fmt = n => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));

async function fetchData() {
  if (process.env.MOCK) return JSON.parse(fs.readFileSync(process.env.MOCK, 'utf8'));
  const query = `query($login:String!){ user(login:$login){
    followers{totalCount}
    pullRequests{totalCount}
    issues{totalCount}
    repositories(ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC, first:100){
      totalCount
      nodes{ stargazerCount languages(first:10, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name color } } } }
    }
    contributionsCollection{
      totalCommitContributions restrictedContributionsCount
      contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } }
    }
  }}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user;
}

const shell = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg2}"/></linearGradient></defs>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="14" fill="url(#bg)" stroke="${C.border}"/>${inner}</svg>`;

// simple inline icons (24x24, stroke)
const ICON = {
  commit: '<circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/>',
  pr: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>',
  issue: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
  repo: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
};
const icon = (k, x, y, color) =>
  `<g transform="translate(${x},${y}) scale(0.75)" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</g>`;

function statsCard(u) {
  const repos = u.repositories.nodes;
  const stars = repos.reduce((a, r) => a + r.stargazerCount, 0);
  const cc = u.contributionsCollection;
  const rows = [
    ['commit', 'Commits (last year)', cc.totalCommitContributions + cc.restrictedContributionsCount],
    ['pr', 'Pull requests', u.pullRequests.totalCount],
    ['issue', 'Issues', u.issues.totalCount],
    ['repo', 'Public repos', u.repositories.totalCount],
    ['star', 'Stars earned', stars],
    ['users', 'Followers', u.followers.totalCount],
  ];
  const W = 460, H = 210;
  let inner = `<text x="24" y="38" font-family="${FONT}" font-size="17" font-weight="700" fill="${C.title}">GitHub Stats</text>`;
  rows.forEach(([ic, label, val], i) => {
    const y = 66 + i * 23;
    inner += icon(ic, 24, y - 13, C.accent);
    inner += `<text x="50" y="${y}" font-family="${FONT}" font-size="14" fill="${C.text}">${esc(label)}</text>`;
    inner += `<text x="300" y="${y}" font-family="${FONT}" font-size="14" font-weight="700" fill="${C.strong}" text-anchor="end">${fmt(val)}</text>`;
  });
  const total = cc.contributionCalendar.totalContributions;
  inner += `<circle cx="385" cy="110" r="48" fill="none" stroke="${C.border}" stroke-width="7"/>`;
  inner += `<circle cx="385" cy="110" r="48" fill="none" stroke="${C.title}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${Math.min(total / 500, 1) * 301.6} 301.6" transform="rotate(-90 385 110)"/>`;
  inner += `<text x="385" y="116" font-family="${FONT}" font-size="22" font-weight="800" fill="${C.strong}" text-anchor="middle">${fmt(total)}</text>`;
  inner += `<text x="385" y="180" font-family="${FONT}" font-size="12" fill="${C.muted}" text-anchor="middle">contributions / year</text>`;
  return shell(W, H, inner);
}

function languagesCard(u) {
  const totals = {};
  for (const r of u.repositories.nodes)
    for (const e of r.languages.edges) {
      const n = e.node.name;
      totals[n] = totals[n] || { size: 0, color: e.node.color || '#94a3b8' };
      totals[n].size += e.size;
    }
  const sum = Object.values(totals).reduce((a, b) => a + b.size, 0) || 1;
  const top = Object.entries(totals).sort((a, b) => b[1].size - a[1].size).slice(0, 6);
  const W = 460, H = 210;
  let inner = `<text x="24" y="38" font-family="${FONT}" font-size="17" font-weight="700" fill="${C.title}">Most Used Languages</text>`;
  // stacked bar
  const bx = 24, bw = W - 48;
  inner += `<clipPath id="bar"><rect x="${bx}" y="56" width="${bw}" height="10" rx="5"/></clipPath><g clip-path="url(#bar)">`;
  let cx = bx;
  for (const [, v] of top) {
    const w = (v.size / sum) * bw;
    inner += `<rect x="${cx}" y="56" width="${w + 0.5}" height="10" fill="${v.color}"/>`;
    cx += w;
  }
  inner += `<rect x="${cx}" y="56" width="${bx + bw - cx}" height="10" fill="${C.border}"/></g>`;
  top.forEach(([name, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 24 + col * 215, y = 100 + row * 34;
    inner += `<circle cx="${x + 6}" cy="${y - 5}" r="6" fill="${v.color}"/>`;
    inner += `<text x="${x + 20}" y="${y}" font-family="${FONT}" font-size="14" fill="${C.text}">${esc(name)}</text>`;
    inner += `<text x="${x + 190}" y="${y}" font-family="${FONT}" font-size="13" fill="${C.muted}" text-anchor="end">${((v.size / sum) * 100).toFixed(1)}%</text>`;
  });
  return shell(W, H, inner);
}

function activityCard(u) {
  const days = u.contributionsCollection.contributionCalendar.weeks.flatMap(w => w.contributionDays).slice(-60);
  const W = 940, H = 260, L = 50, R = 24, T = 56, B = 40;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(4, ...days.map(d => d.contributionCount));
  const step = pw / (days.length - 1);
  const pts = days.map((d, i) => [L + i * step, T + ph - (d.contributionCount / max) * ph]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${L + pw},${T + ph} L${L},${T + ph} Z`;
  let inner = `<defs><linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.title}" stop-opacity="0.35"/><stop offset="1" stop-color="${C.title}" stop-opacity="0"/></linearGradient></defs>`;
  inner += `<text x="24" y="36" font-family="${FONT}" font-size="17" font-weight="700" fill="${C.title}">Contribution Activity · last 60 days</text>`;
  for (let g = 0; g <= 4; g++) {
    const y = T + (ph / 4) * g;
    inner += `<line x1="${L}" y1="${y}" x2="${L + pw}" y2="${y}" stroke="${C.border}" stroke-dasharray="3 5"/>`;
    inner += `<text x="${L - 10}" y="${y + 4}" font-family="${FONT}" font-size="11" fill="${C.muted}" text-anchor="end">${Math.round(max - (max / 4) * g)}</text>`;
  }
  inner += `<path d="${area}" fill="url(#ar)"/><path d="${line}" fill="none" stroke="${C.title}" stroke-width="2.5" stroke-linejoin="round"/>`;
  pts.forEach((p, i) => { if (days[i].contributionCount) inner += `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${C.accent}"/>`; });
  [0, 15, 30, 45, days.length - 1].forEach(i => {
    const d = new Date(days[i].date);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    inner += `<text x="${L + i * step}" y="${H - 14}" font-family="${FONT}" font-size="11" fill="${C.muted}" text-anchor="middle">${label}</text>`;
  });
  return shell(W, H, inner);
}

const u = await fetchData();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/stats.svg`, statsCard(u));
fs.writeFileSync(`${OUT}/languages.svg`, languagesCard(u));
fs.writeFileSync(`${OUT}/activity.svg`, activityCard(u));
console.log('Generated stats.svg, languages.svg, activity.svg');

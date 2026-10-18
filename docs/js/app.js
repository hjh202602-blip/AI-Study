/* 보물지도 — README 목차를 읽어서 지도와 패널을 만든다. */
(() => {
  'use strict';
  const CFG = window.AIMAP_CONFIG || {};
  const WIDGETS = window.AIMAP_WIDGETS || {};
  const SVGNS = 'http://www.w3.org/2000/svg';
  const REGION_COLORS = ['var(--r1)', 'var(--r2)', 'var(--r3)', 'var(--r4)', 'var(--r5)'];
  const $ = (s) => document.querySelector(s);

  const state = {
    base: '',
    regions: [],
    nodes: [],          // 투어 순서 (본 지점 다음에 곁가지)
    byId: new Map(),
    byPath: new Map(),
    visited: new Set(),
    maps: [],           // config.maps
    mapIdx: 0,
    map: null,          // 지금 펼친 지도
    active: null,
    vb: { x: 0, y: 0, w: 1000, h: 1000 },
    bounds: null,       // 지도 전체(양피지 + 여백)
    paper: null,        // 양피지 사각형
    lod: 'world',
    portrait: false,
  };

  /* ---------------- 저장 ---------------- */
  const visitKey = () => 'aimap.visited.' + (state.map ? state.map.id : 'main');
  function loadVisited() {
    try {
      const v = localStorage.getItem(visitKey()) ?? (state.mapIdx === 0 ? localStorage.getItem('aimap.visited') : null);
      return JSON.parse(v || '[]');
    } catch { return []; }
  }
  function saveVisited() {
    try { localStorage.setItem(visitKey(), JSON.stringify([...state.visited])); } catch {}
  }

  /* ---------------- 경로 ---------------- */
  function normPath(p) {
    let s = p.trim();
    try { s = decodeURI(s); } catch {}
    s = s.split('#')[0];
    const parts = [];
    for (const seg of s.replace(/^\/+/, '').split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop(); else parts.push(seg);
    }
    return parts.join('/');
  }
  function resolvePath(dir, href) {
    if (/^\//.test(href)) return normPath(href);
    return normPath((dir ? dir + '/' : '') + href);
  }
  const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
  const fileUrl = (p) => state.base + encPath(p);
  const repoOf = (m) => (m && m.repo) || CFG.repo || {};
  const githubUrl = (p) => {
    const r = repoOf(state.map);
    return `https://github.com/${r.owner}/${r.name}/blob/${r.branch || 'main'}/${encPath(p)}`;
  };
  const isExternal = (h) => /^[a-z]+:/i.test(h) || h.startsWith('//');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 지도의 목차 파일을 읽는다. 같은 저장소면 로컬 파일을 먼저, 아니면 깃허브에서.
  async function pickBase(map) {
    const src = encPath(map.source || 'README.md');
    const r = repoOf(map), home = CFG.repo || {};
    if (location.protocol !== 'file:' && (!map.repo || (r.owner === home.owner && r.name === home.name))) {
      try {
        const url = new URL('../', location.href).href;
        const res = await fetch(url + src, { cache: 'no-cache' });
        if (res.ok) {
          const t = await res.text();
          if (!/^\s*<(!doctype|html)/i.test(t)) return { base: url, readme: t };
        }
      } catch {}
    }
    const base = `https://raw.githubusercontent.com/${r.owner}/${r.name}/${r.branch || 'main'}/`;
    const res = await fetch(base + src);
    if (!res.ok) throw new Error((map.source || 'README.md') + '를 불러오지 못했어요 (' + res.status + ')');
    return { base, readme: await res.text() };
  }

  /* ---------------- README 목차 파싱 ---------------- */
  function parseReadme(md, dir = '') {
    const lines = md.split(/\r?\n/);
    let start = lines.findIndex((l) => /^##\s*(목차|contents|toc)/i.test(l));
    if (start < 0) start = 0;
    const regions = [];
    let region = null, lastMain = null, filesMode = false, inFence = false;
    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      let m;
      if ((m = line.match(/^###\s+(.+?)\s*$/)) && !line.startsWith('####')) {
        const head = m[1];
        const km = head.match(/^(\d+)\s*[.)]?\s*(.*)$/);
        const key = km ? km[1] : String(regions.length).padStart(2, '0');
        region = { key, title: (km ? km[2] : head) || head, nodes: [], files: [] };
        regions.push(region);
        lastMain = null; filesMode = false;
        continue;
      }
      if ((m = line.match(/^####\s+(.+)/))) {
        filesMode = /실습|예제|practice|example|자료|resource/i.test(m[1]);
        continue;
      }
      if (!region) continue;
      const link = line.match(/^\s*([-*+>]|\d+\.)\s*\[([^\]]+)\]\(([^)]+)\)/);
      if (!link) continue;
      const [, bullet, text, href] = link;
      if (isExternal(href)) { region.files.push({ label: text, url: href }); continue; }
      const path = resolvePath(dir, href);
      if (filesMode || !/\.md$/i.test(path)) { region.files.push({ label: text, path }); continue; }
      const side = bullet === '>' && !!lastMain;
      const node = makeNode(path, text, region, side ? lastMain : null);
      if (side) lastMain.sides.push(node);
      else { region.nodes.push(node); lastMain = node; }
    }
    return regions.filter((r) => r.nodes.length || r.files.length);
  }

  function makeNode(path, rawLabel, region, parent) {
    const file = path.split('/').pop();
    const id = file.replace(/\.md$/i, '');
    const o = ((state.map && state.map.nodes) || {})[id] || {};
    const clean = rawLabel.replace(/^\s*\d+\s*\+?\s*[.)]\s*/, '').trim();
    return {
      id, path, file, dir: path.split('/').slice(0, -1).join('/'),
      label: o.label || clean, en: o.en || '', summary: o.summary || '',
      mark: (o.mark === 'treasure' ? 'clue' : o.mark) || (parent ? 'camp' : 'flag'), widgets: o.widgets || [],
      region, parent, sides: [], side: !!parent, md: '', draft: false,
    };
  }

  /* ---------------- 마크다운 ---------------- */
  const NAV_LINE = /^\s*\[(돌아가기|이전|다음|back|prev|next)[^\]]*\]\([^)]*\)\s*$/i;
  function cleanMd(md) {
    const out = md.split(/\r?\n/).filter((l) => !NAV_LINE.test(l));
    while (out.length && /^\s*(---+|\*\*\*+)?\s*$/.test(out[out.length - 1])) out.pop();
    return out.join('\n');
  }
  function plainText(md) {
    return cleanMd(md)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^#+\s.*$/gm, ' ')
      .replace(/[#>*`\-|_$]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function renderMd(md, node) {
    md = cleanMd(md);
    const math = [];
    const parts = md.split(/(```[\s\S]*?```|`[^`\n]*`)/);
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = parts[i]
        .replace(/<!--\s*widget:\s*([\w-]+)\s*-->/g, (_, n) => `\n\n<div data-widget="${n}"></div>\n\n`)
        .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => { math.push([t, true]); return `\n\nⓜ${math.length - 1}ⓜ\n\n`; })
        .replace(/\$([^\$\n]+?)\$/g, (_, t) => { math.push([t, false]); return `ⓜ${math.length - 1}ⓜ`; });
    }
    let html = marked.parse(parts.join(''), { gfm: true, breaks: false });
    html = html
      .replace(/<p>\s*ⓜ(\d+)ⓜ\s*<\/p>/g, (_, i) => tex(math[i]))
      .replace(/ⓜ(\d+)ⓜ/g, (_, i) => tex(math[i]));
    const el = document.createElement('div');
    el.className = 'md';
    el.innerHTML = html;
    el.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (!isExternal(src)) img.src = fileUrl(resolvePath(node.dir, src));
      img.loading = 'lazy';
    });
    const files = state.regions.flatMap((r) => r.files.map((f) => f.path)).filter(Boolean);
    el.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (isExternal(href) || href.startsWith('#')) { a.target = '_blank'; a.rel = 'noopener'; return; }
      let p = resolvePath(node.dir, href);
      if (/\.md$/i.test(p)) {
        const known = state.byPath.get(p);
        if (known) { a.href = '#n/' + encodeURIComponent(known.id); a.onclick = (e) => { e.preventDefault(); openNode(known.id); }; }
        else { a.href = githubUrl(p); a.target = '_blank'; }
        return;
      }
      // README와 다른 기준으로 적힌 링크도 찾아 준다
      if (!files.includes(p)) {
        const alt = normPath(href), byName = files.find((f) => f.endsWith('/' + p.split('/').pop()));
        if (files.includes(alt)) p = alt; else if (byName) p = byName;
      }
      a.href = githubUrl(p); a.target = '_blank'; a.rel = 'noopener';
      if (/\.py$/i.test(p)) { a.onclick = (e) => { e.preventDefault(); openFile(p); }; a.title = '사이트에서 바로 실행해 보기'; }
    });
    el.querySelectorAll('pre code').forEach((c) => { c.dataset.lang = c.className || ''; try { hljs.highlightElement(c); } catch {} });
    if (window.AIMAP_RUNNER) AIMAP_RUNNER.enhanceAll(el);
    el.querySelectorAll('[data-widget]').forEach((w) => mountWidget(w, w.dataset.widget, node));
    return el;
  }
  function tex([t, display]) {
    try { return katex.renderToString(t.trim(), { displayMode: display, throwOnError: false }); } catch { return t; }
  }
  function mountWidget(holder, name, node) {
    const fn = WIDGETS[name];
    if (!fn) { holder.remove(); return; }
    const box = document.createElement('section');
    box.className = 'widget';
    holder.replaceWith(box);
    try { fn(box, { node }); } catch (e) { console.error('widget', name, e); box.remove(); }
  }

  /* ---------------- 표시(마커) 그림 ---------------- */
  const MARK_NAME = { clue: '단서', area: '구역', flag: '표지', camp: '야영지', unknown: '미개척' };
  function iconMarkup(mark, found) {
    const INK = '#3a2816';
    switch (mark) {
      case 'clue': {
        const f = found ? '#e9bf5c' : '#bfa063';
        return `<g transform="rotate(-35)">
             <circle cx="-7" cy="0" r="6.5" fill="${f}" stroke="${INK}" stroke-width="1.7"/>
             <circle cx="-7" cy="0" r="2.4" fill="#efe2c2" stroke="${INK}" stroke-width="1"/>
             <path d="M-0.5,-1.8 H13 V1.8 H-0.5 Z" fill="${f}" stroke="${INK}" stroke-width="1.4"/>
             <path d="M7,1.8 v4.2 h2.6 v-4.2 M11,1.8 v3 h1.8 v-3" fill="${f}" stroke="${INK}" stroke-width="1.2"/></g>` +
          (found ? `<path d="M9,-12 v6 M6,-9 h6 M-12,-10 v4 M-14,-8 h4" stroke="#c08a2b" stroke-width="1.4" stroke-linecap="round"/>` : '');
      }
      case 'x':
        return found
          ? `<path d="M-12,-3 L-11,-13 Q0,-19.5 11,-13 L12,-3 Z" fill="#6b3f1c" stroke="${INK}" stroke-width="1.4"/>
             <path d="M-8,-3.5 L-7.6,-15.6 M8,-3.5 L7.6,-15.6" stroke="#c9a24a" stroke-width="2.2"/>
             <path d="M-11.5,-1.5 Q-7,-9.5 0,-8.5 Q7,-9.5 11.5,-1.5 Z" fill="#f2cf63" stroke="${INK}" stroke-width="1"/>
             <circle cx="-5.5" cy="-5" r="2.3" fill="#f7dc7a" stroke="#a87b1a" stroke-width=".7"/>
             <circle cx="-1" cy="-7" r="2.3" fill="#f7dc7a" stroke="#a87b1a" stroke-width=".7"/>
             <circle cx="5.5" cy="-4.6" r="2.3" fill="#f7dc7a" stroke="#a87b1a" stroke-width=".7"/>
             <path d="M2,-7.5 l2.2,-3.2 l2.2,3.2 l-2.2,2.2 z" fill="#c9573f" stroke="${INK}" stroke-width=".6"/>
             <rect x="-12" y="-2" width="24" height="13" rx="1.5" fill="#8a5426" stroke="${INK}" stroke-width="1.6"/>
             <path d="M-12,3.5 H12" stroke="#5a3415" stroke-width="1"/>
             <rect x="-9.5" y="-2" width="3" height="13" fill="#c9a24a" stroke="${INK}" stroke-width=".8"/>
             <rect x="6.5" y="-2" width="3" height="13" fill="#c9a24a" stroke="${INK}" stroke-width=".8"/>
             <rect x="-3" y="0.5" width="6" height="6.5" rx="1" fill="#e9bf5c" stroke="${INK}" stroke-width=".9"/>
             <path d="M0,2.6 v2.4" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>
             <path d="M-15,-13 v4 M-17,-11 h4 M14,-18 v4 M12,-16 h4" stroke="#e9bf5c" stroke-width="1.3" stroke-linecap="round"/>`
          : `<path d="M-10,-10 Q0,-1 10,10 M10,-10 Q1,0 -10,10" stroke="#00000022" stroke-width="7" stroke-linecap="round" fill="none" transform="translate(1.5,2)"/>
             <path class="x-stroke" d="M-10,-10 Q0,-1 10,10 M10,-10 Q1,0 -10,10"/>`;
      case 'flag':
        return `<ellipse cx="-5" cy="10" rx="6" ry="2" fill="${INK}" opacity=".35"/>
                <path d="M-5,10 L-5,-13" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M-5,-13 Q3,-12 10,-8 Q3,-5 -5,-3 Z" fill="${found ? '#c08a2b' : '#a8352a'}" stroke="${INK}" stroke-width="1.2"/>`;
      case 'camp':
        return `<path d="M-11,8 L0,-10 L11,8 Z" fill="${found ? '#e9bf5c' : '#efe2c2'}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
                <path d="M-3,8 L0,1 L3,8 M0,-10 L0,-13" stroke="${INK}" stroke-width="1.3" fill="none"/>`;
      case 'area':
        return `<path d="M0,-11 L11,0 L0,11 L-11,0 Z" fill="${found ? '#e9bf5c' : '#efe2c2'}" stroke="${INK}" stroke-width="1.8"/>
                <path d="M0,-6 L6,0 L0,6 L-6,0 Z" fill="${INK}"/>`;
      default:
        return `<circle r="11" fill="#efe2c2" stroke="${INK}" stroke-dasharray="3 3" stroke-width="1.5"/>
                <text y="5" text-anchor="middle" font-size="15" font-family="Gowun Batang, serif" font-weight="700" fill="#a8352a">?</text>`;
    }
  }
  const iconSvg = (mark, found) => `<svg viewBox="-14 -14 28 28">${iconMarkup(mark, found)}</svg>`;

  function buildLegend() {
    $('#legend').innerHTML = [
      ['x', '보물 (문제)'], ['clue', '단서 (핵심 개념)'], ['area', '구역'], ['flag', '표지'], ['camp', '야영지 (곁가지)'], ['unknown', '미개척'],
    ].map(([m, t]) => `<span>${iconSvg(m)}${t}</span>`).join('');
  }

  /* ---------------- 배치 ---------------- */
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const isPortrait = () => window.innerWidth <= 760;

  /* 섬 모양 (단위 좌표 -1~1)
   *   arms: 땅을 이루는 뼈대(굵은 선) · path: 지점을 늘어놓는 길 · x: 섬 ✕ 보물 자리 */
  const SHAPE_CYCLE = ['ellipse', 'T', 'L', 'U', 'ㅗ', 'C'];
  const arc = (a0, a1, rx, ry, n = 16) => Array.from({ length: n + 1 }, (_, k) => {
    const t = ((a0 + (a1 - a0) * (k / n)) * Math.PI) / 180;
    return [Math.cos(t) * rx, Math.sin(t) * ry];
  });
  const SHAPES = {
    ellipse: { arms: null, path: arc(160, 380, 0.62, 0.46), x: [0, 0.42] },
    T: { arms: [[[-1, -0.62], [1, -0.62]], [[0, -0.62], [0, 1]]], path: [[-1, -0.62], [1, -0.62]], x: [0, 0.92] },
    'ㅗ': { arms: [[[-1, 0.62], [1, 0.62]], [[0, -1], [0, 0.62]]], path: [[-1, 0.62], [1, 0.62]], x: [0, -0.92] },
    U: {
      arms: [[[-0.78, -1], [-0.78, 0.35], [-0.5, 0.78], [0, 0.9], [0.5, 0.78], [0.78, 0.35], [0.78, -1]]],
      path: [[-0.78, -0.95], [-0.78, 0.35], [-0.5, 0.78], [0, 0.9], [0.5, 0.78], [0.78, 0.35], [0.78, -0.45]], x: [0.78, -0.95],
    },
    L: { arms: [[[-0.7, -1], [-0.7, 0.75], [1, 0.75]]], path: [[-0.7, -0.95], [-0.7, 0.75], [0.55, 0.75]], x: [0.98, 0.75] },
    C: { arms: [arc(-50, -310, 0.85, 0.85)], path: arc(-60, -278, 0.85, 0.85), x: [Math.cos(-310 * Math.PI / 180) * 0.85, Math.sin(-310 * Math.PI / 180) * 0.85] },
  };
  const polyLen = (pts) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  function alongPath(pts, f) {
    const L = polyLen(pts) * f;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + d >= L || i === pts.length - 1) {
        const u = d ? Math.min(1, (L - acc) / d) : 0;
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u];
      }
      acc += d;
    }
    return pts[0];
  }
  // 모양 하나를 '땅의 높이 지도(field)'로 만든다 — 원점 기준.
  // 뼈대를 따라 부드러운 언덕을 겹치고 노이즈를 섞어서, 모양은 남기되 둥글고 울퉁불퉁하게.
  function makeLand(shape, A, seed) {
    const def = SHAPES[shape] || SHAPES.ellipse, R = rng(seed);
    const t = Math.max(115, A * 0.31);
    const ellipse = !def.arms;
    const sig = ellipse ? A * 0.52 : t / 1.12;
    const arms = def.arms || [[[-0.45, 0], [0.45, 0]]];
    const pts = [];
    arms.forEach((arm) => {
      const L = polyLen(arm) * A, n = Math.max(2, Math.round(L / (sig * 0.5)));
      for (let k = 0; k <= n; k++) {
        const [ux, uy] = alongPath(arm, k / n);
        pts.push({ x: ux * A + (R() - 0.5) * t * 0.4, y: uy * A + (R() - 0.5) * t * 0.4, s: sig * (0.82 + R() * 0.5), w: 1 });
      }
    });
    // 뭉뚱그리기: 모양 전체에 큰 덩어리를 몇 개 더 얹어 모서리를 둥글린다
    const bx0 = Math.min(...pts.map((q) => q.x)), bx1 = Math.max(...pts.map((q) => q.x));
    const by0 = Math.min(...pts.map((q) => q.y)), by1 = Math.max(...pts.map((q) => q.y));
    for (let k = 0; k < 4; k++) {
      pts.push({ x: (bx0 + bx1) / 2 + (R() - 0.5) * (bx1 - bx0) * 0.6, y: (by0 + by1) / 2 + (R() - 0.5) * (by1 - by0) * 0.6, s: sig * (0.9 + R() * 0.3), w: 0.12 });
    }
    // 해안이 울퉁불퉁해지도록 가장자리에 작은 혹
    for (let k = 0; k < pts.length / 2; k++) {
      const q = pts[Math.floor(R() * pts.length)], a = R() * Math.PI * 2;
      pts.push({ x: q.x + Math.cos(a) * sig * 1.2, y: q.y + Math.sin(a) * sig * 1.2, s: sig * (0.25 + R() * 0.3), w: 0.55 });
    }
    const ph = [R() * 6, R() * 6, R() * 6, R() * 6], f1 = 1 / (t * 0.85), f2 = 1 / (t * 0.3);
    const noise = (x, y) => 0.55 * Math.sin(x * f1 + ph[0]) * Math.sin(y * f1 * 1.13 + ph[1]) + 0.3 * Math.sin((x * 0.7 + y) * f2 + ph[2]) + 0.15 * Math.sin((x - y * 0.6) * f2 * 1.7 + ph[3]);
    const raw = (x, y) => {
      let v = 0;
      for (const q of pts) {
        const dx = x - q.x, dy = y - q.y, d2 = dx * dx + dy * dy, s2 = 2 * q.s * q.s;
        if (d2 < s2 * 9) v += q.w * Math.exp(-d2 / s2);
      }
      return v;
    };
    const fieldAt = (x, y) => raw(x, y) * (1 + 0.17 * noise(x, y));
    const probe = alongPath(arms[0], 0.5);
    const T0 = raw(probe[0] * A, probe[1] * A) * (ellipse ? 0.36 : 0.48);
    const ms = Math.max(...pts.map((q) => q.s));
    const box = { x0: bx0 - ms * 1.9, x1: bx1 + ms * 1.9, y0: by0 - ms * 1.9, y1: by1 + ms * 1.9 };
    return { pts, T0, fieldAt, box, path: def.path.map((u) => ({ x: u[0] * A, y: u[1] * A })), x: { x: def.x[0] * A, y: def.x[1] * A }, t, sig };
  }
  // 땅이 실제로 차지하는 범위 (높이 지도로 다시 잰다)
  function landExtent(land) {
    const b = land.box, cs = Math.max(14, land.t / 6);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let y = b.y0; y <= b.y1; y += cs) for (let x = b.x0; x <= b.x1; x += cs) {
      if (land.fieldAt(x, y) >= land.T0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    return { x0, x1, y0, y1 };
  }
  // 섬(또는 땅 덩어리)의 한 점이 땅인지: k > 1 이면 더 안쪽, k < 1 이면 해안 바깥까지
  function onLand(r, x, y, k = 1) {
    if (r.land) return r.land.fieldAt(x - r.ox, y - r.oy) >= r.land.T0 * k;
    const f = Math.sqrt(1 / k);
    return ((x - r.cx) / (r.rx * f)) ** 2 + ((y - r.cy) / (r.ry * f)) ** 2 < 1;
  }

  const islandQs = (r) => {
    const qz = state.map && state.map.quiz;
    if (!qz || !r || r.draft) return [];
    return (qz.questions || []).filter((q) => q.about && state.byId.has(q.about) && state.byId.get(q.about).region === r);
  };
  const finalQs = () => {
    const qz = state.map && state.map.quiz;
    return qz ? (qz.final && qz.final.length ? qz.final : qz.questions || []) : [];
  };
  const hasQuiz = () => finalQs().length > 0;

  // 섬 하나 준비: 모양을 만들고, 지점을 길을 따라 늘어놓는다 (아직 원점 기준)
  function prepIsland(r, i) {
    const def = SHAPES[r.shape] || SHAPES.ellipse;
    const slots = r.nodes.flatMap((n) => [n, ...n.sides]);
    const n = slots.length;
    const A = Math.max(r.shape === 'ellipse' ? 280 : 320, (195 * Math.max(1, n - 1)) / polyLen(def.path));
    const land = makeLand(r.shape, A, 700 + i * 97);
    r.land = land;
    r._local = slots.map((nd, k) => { const [ux, uy] = alongPath(def.path, n === 1 ? 0.5 : k / (n - 1)); return { nd, x: ux * A, y: uy * A - 10 }; });
    r._xl = islandQs(r).length ? land.x : null;
    r._ext = landExtent(land);
  }
  function prepDraft(r) {
    const R0 = 150;
    Object.assign(r, { land: null, rx: R0, ry: R0 * 0.78, _ext: { x0: -R0, x1: R0, y0: -R0 * 0.78, y1: R0 * 0.78 } });
  }
  function prepFinal() {
    const land = makeLand('ellipse', 200, 4242);
    return { key: 'final', final: true, shape: 'ellipse', land, nodes: [], _ext: landExtent(land), _xl: { x: 0, y: 0 } };
  }
  // 정해진 중심으로 옮긴다
  function settle(r, cx, cy) {
    const e = r._ext, lcx = (e.x0 + e.x1) / 2, lcy = (e.y0 + e.y1) / 2;
    r.ox = cx - lcx; r.oy = cy - lcy; r._ct = null;
    r.cx = cx; r.cy = cy; r.rx = (e.x1 - e.x0) / 2; r.ry = (e.y1 - e.y0) / 2;
    r.labelY = e.y1 + r.oy + 42;
    if (r._local) r._local.forEach(({ nd, x, y }) => { nd.x = x + r.ox; nd.y = y + r.oy; });
    if (!r.land) r.nodes.forEach((nd) => { nd.x = cx; nd.y = cy; });
    r.xSpot = r._xl ? { x: r._xl.x + r.ox, y: r._xl.y + r.oy } : null;
  }
  const hashStr = (str) => [...String(str)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

  function layout() {
    state.portrait = isPortrait();
    const R = state.regions;
    state.final = null; state.demo = null;
    R.forEach((r, i) => { r.shape = r.shape || SHAPE_CYCLE[i % SHAPE_CYCLE.length]; });
    if (!R.length) { // 아직 섬이 없는 빈 지도
      const pw = state.portrait ? 1100 : 2400, ph = state.portrait ? 1700 : 1600;
      state.paper = { x: 0, y: 0, w: pw, h: ph };
      state.bounds = { x: -50, y: -50, w: pw + 100, h: ph + 100 };
      if (state.map && state.map.demoShape) {
        const land = makeLand(state.map.demoShape, state.portrait ? 300 : 360, 31337);
        const D = { shape: state.map.demoShape, land, nodes: [], _ext: landExtent(land) };
        settle(D, pw / 2, ph / 2 - 60);
        state.demo = D;
      }
      return;
    }
    R.forEach((r, i) => (r.draft ? prepDraft(r) : prepIsland(r, i)));
    const items = [...R];
    if (hasQuiz()) { state.final = prepFinal(); items.push(state.final); }
    // 무작위 배치: 순서를 섞어서 하나씩, 이미 놓인 섬 옆의 빈 바다에 둔다 (지도마다 늘 같은 배치)
    const rnd = rng(hashStr((state.map && state.map.id) || 'map') + (state.portrait ? 99 : 0));
    const order = items.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const placed = [], GAP = 170;
    const half = (o) => ({ hx: (o._ext.x1 - o._ext.x0) / 2, hy: (o._ext.y1 - o._ext.y0) / 2 + 30 });
    const hits = (o, cx, cy) => placed.some((q) => {
      const a = half(o), b = half(q);
      return Math.abs(cx - q.cx) < a.hx + b.hx + GAP && Math.abs(cy - q.cy) < a.hy + b.hy + GAP;
    });
    order.forEach((idx) => {
      const o = items[idx];
      if (!placed.length) { settle(o, 0, 0); placed.push(o); return; }
      for (let t = 0; t < 600; t++) {
        const base = placed[Math.floor(rnd() * placed.length)];
        const a = rnd() * Math.PI * 2, A = half(o), B = half(base);
        const ex = state.portrait ? 0.55 : 1.35, ey = state.portrait ? 1.4 : 0.8;
        const dist = Math.hypot(A.hx + B.hx, A.hy + B.hy) * (0.62 + rnd() * 0.45) + GAP;
        const cx = base.cx + Math.cos(a) * dist * ex, cy = base.cy + Math.sin(a) * dist * ey;
        if (!hits(o, cx, cy) || t === 599) { settle(o, cx, cy); placed.push(o); return; }
      }
    });
    // 양피지 사각형: 섬들을 감싸고 넉넉한 바다를 둔다
    const x0 = Math.min(...items.map((r) => r.cx - r.rx)), x1 = Math.max(...items.map((r) => r.cx + r.rx));
    const y0 = Math.min(...items.map((r) => r.cy - r.ry)), y1 = Math.max(...items.map((r) => r.labelY + 30));
    const padX = state.portrait ? 170 : 280, padTop = state.portrait ? 320 : 300, padBot = 220;
    let px = x0 - padX, py = y0 - padTop, pw = x1 - x0 + padX * 2, ph = y1 - y0 + padTop + padBot;
    const ratio = state.portrait ? 0.62 : 1.5; // 가로/세로
    if (pw / ph > ratio) { const nh = pw / ratio; py -= (nh - ph) / 2; ph = nh; }
    else { const nw = ph * ratio; px -= (nw - pw) / 2; pw = nw; }
    state.paper = { x: px, y: py, w: pw, h: ph };
    const m = state.portrait ? 30 : 60;
    state.bounds = { x: px - m, y: py - m, w: pw + m * 2, h: ph + m * 2 };
  }

  function blobPath(cx, cy, rx, ry, seed, wob = 0.1) {
    const R = rng(seed), p1 = R() * 6, p2 = R() * 6, p3 = R() * 6, p4 = R() * 6;
    const N = 80, pts = [];
    for (let k = 0; k < N; k++) {
      const t = (k / N) * Math.PI * 2;
      const r = 1 + wob * (Math.sin(2 * t + p1) * 0.45 + Math.sin(3 * t + p2) * 0.35 + Math.sin(7 * t + p3) * 0.14 + Math.sin(13 * t + p4) * 0.07);
      pts.push([cx + Math.cos(t) * rx * r, cy + Math.sin(t) * ry * r]);
    }
    return smoothClosed(pts);
  }
  function smoothClosed(pts) {
    const n = pts.length; let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d + 'Z';
  }
  function curve(pts) {
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += `C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
    }
    return d;
  }
  // 섬 안(타원 기준)인지
  const allLands = () => [...state.regions, state.final, state.demo].filter(Boolean);
  // pad > 1 이면 섬 주변 바다까지 섬으로 친다 (장식이 해안에 너무 붙지 않게)
  const inIsland = (x, y, pad = 1) => allLands().some((r) => onLand(r, x, y, pad > 1 ? Math.pow(0.45, (pad - 1) * 4) : 1));

  /* ---------------- 지도 그리기 ---------------- */
  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, text, attrs = {}) {
    const t = el('text', { x, y, ...attrs }, parent);
    t.textContent = text;
    return t;
  }

  function drawMap() {
    const svg = $('#map');
    svg.innerHTML = '';
    const P = state.paper;
    const defs = el('defs', {}, svg);
    // 종이 질감: 작은 얼룩과 섬유
    const tex = el('pattern', { id: 'paper-tex', width: 220, height: 220, patternUnits: 'userSpaceOnUse' }, defs);
    const R0 = rng(7);
    for (let i = 0; i < 70; i++) el('circle', { cx: R0() * 220, cy: R0() * 220, r: 0.6 + R0() * 2.2, fill: '#6b4a24', opacity: 0.04 + R0() * 0.08 }, tex);
    for (let i = 0; i < 14; i++) { const x = R0() * 220, y = R0() * 220; el('path', { d: `M${x},${y} q${8 + R0() * 10},${R0() * 6 - 3} ${18 + R0() * 14},${R0() * 4 - 2}`, stroke: '#6b4a24', 'stroke-opacity': 0.08, fill: 'none' }, tex); }
    const burn = el('radialGradient', { id: 'burn', cx: '50%', cy: '50%', r: '72%' }, defs);
    el('stop', { offset: '60%', 'stop-color': '#8a5a26', 'stop-opacity': 0 }, burn);
    el('stop', { offset: '92%', 'stop-color': '#7a4a1c', 'stop-opacity': 0.35 }, burn);
    el('stop', { offset: '100%', 'stop-color': '#4a2a0c', 'stop-opacity': 0.6 }, burn);
    const land = el('radialGradient', { id: 'land', cx: '40%', cy: '38%', r: '75%' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#e6d3a2' }, land);
    el('stop', { offset: '100%', 'stop-color': '#cdb07a' }, land);
    const hatch = el('pattern', { id: 'hatch', width: 9, height: 9, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(40)' }, defs);
    el('rect', { width: 9, height: 9, fill: '#a8352a', 'fill-opacity': 0.05 }, hatch);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 9, stroke: '#3a2816', 'stroke-opacity': 0.22, 'stroke-width': 1.4 }, hatch);
    const inset = state.portrait ? 22 : 34;
    const clip = el('clipPath', { id: 'frame-clip' }, defs);
    el('rect', { x: P.x + inset, y: P.y + inset, width: P.w - inset * 2, height: P.h - inset * 2 }, clip);

    // 양피지 (가장자리가 들쭉날쭉한 큰 사각형)
    const edge = roughRect(P, 11);
    el('path', { d: edge, class: 'paper-edge', transform: 'translate(10,14)' }, svg);
    el('path', { d: edge, fill: '#efe0bb' }, svg);
    el('path', { d: edge, fill: 'url(#paper-tex)' }, svg);
    const sea = el('g', { 'clip-path': 'url(#frame-clip)' }, svg);
    drawRhumbs(sea, P);
    drawSeaDecor(sea, P);
    drawCurrents(sea, P, defs);
    drawCreatures(sea, P);
    if (!state.regions.length) drawEmptyMap(svg, P);

    const islands = el('g', {}, svg);
    const zones = el('g', { class: 'near-only' }, svg);
    const routes = el('g', { class: 'near-only' }, svg);
    const marks = el('g', { class: 'near-only' }, svg);
    const worldLabels = el('g', { class: 'world-only' }, svg);

    state.regions.forEach((r, i) => drawIsland(islands, worldLabels, r, i));
    drawZones(zones);
    drawRoutes(routes);
    if (state.final) drawFinalIsland(islands);
    if (state.demo) { const g = el('g', {}, islands); drawLand(g, state.demo); drawPalms(g, state.demo, 77); drawRelief(g, state.demo, 78); }
    drawIslandXs(marks, svg);
    const nextId = (state.nodes.find((n) => !n.draft && !state.visited.has(n.id)) || {}).id;
    state.nodes.forEach((n) => { if (!n.region.draft) drawMark(marks, n, n.id === nextId); });

    // 테두리와 장식 (맨 위)
    el('path', { d: edge, fill: 'url(#burn)', 'pointer-events': 'none' }, svg);
    drawFrame(svg, P, inset);
    drawCartouche(svg, P, inset);
    applyLod(true);
    markActive();
    updateCompass();
  }

  function roughRect(P, amp) {
    const R = rng(41), pts = [], step = 34;
    const push = (x, y) => pts.push([x + (R() - 0.5) * amp, y + (R() - 0.5) * amp]);
    for (let x = P.x; x < P.x + P.w; x += step) push(x, P.y);
    for (let y = P.y; y < P.y + P.h; y += step) push(P.x + P.w, y);
    for (let x = P.x + P.w; x > P.x; x -= step) push(x, P.y + P.h);
    for (let y = P.y + P.h; y > P.y; y -= step) push(P.x, y);
    return 'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z';
  }

  function compassPos(P, inset) {
    return state.portrait
      ? { x: P.x + P.w - inset - 70, y: P.y + inset + 230, r: 50 }
      : { x: P.x + P.w - inset - 150, y: P.y + P.h - inset - 150, r: 80 };
  }
  function drawRhumbs(g, P) {
    const c = compassPos(P, state.portrait ? 22 : 34), L = Math.hypot(P.w, P.h);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      el('line', { class: 'rhumb', x1: c.x, y1: c.y, x2: c.x + Math.cos(a) * L, y2: c.y + Math.sin(a) * L }, g);
    }
    // 위도·경도선
    for (let x = P.x + 200; x < P.x + P.w; x += 400) el('line', { class: 'rhumb', x1: x, y1: P.y, x2: x, y2: P.y + P.h, 'stroke-dasharray': '2 8' }, g);
    for (let y = P.y + 200; y < P.y + P.h; y += 400) el('line', { class: 'rhumb', x1: P.x, y1: y, x2: P.x + P.w, y2: y, 'stroke-dasharray': '2 8' }, g);
  }
  function drawSeaDecor(g, P) {
    const R = rng(99);
    let placed = 0;
    for (let t = 0; t < 400 && placed < (state.portrait ? 26 : 42); t++) {
      const x = P.x + 60 + R() * (P.w - 120), y = P.y + 160 + R() * (P.h - 220);
      if (inIsland(x, y, 1.35)) continue;
      const s = 7 + R() * 5;
      el('path', { class: 'wave', d: `M${x},${y} q${s / 2},-${s / 2} ${s},0 t${s},0 ${R() > 0.5 ? `t${s},0` : ''}` }, g);
      placed++;
    }
    // 배 한 척
    for (let t = 0; t < 200; t++) {
      const x = P.x + 160 + R() * (P.w - 320), y = P.y + 220 + R() * (P.h - 360);
      if (inIsland(x, y, 1.6)) continue;
      const s = el('g', { transform: `translate(${x},${y})`, opacity: 0.85 }, g);
      el('path', { d: 'M-24,0 Q0,13 24,0 L18,-2 L-20,-2 Z', fill: '#6b4a2a', stroke: '#3a2816', 'stroke-width': 1.5 }, s);
      el('path', { d: 'M0,-2 V-40', stroke: '#3a2816', 'stroke-width': 2 }, s);
      el('path', { d: 'M2,-38 Q20,-24 2,-8 Z', fill: '#f4e9cf', stroke: '#3a2816', 'stroke-width': 1.4 }, s);
      el('path', { d: 'M-2,-34 Q-14,-22 -2,-12 Z', fill: '#f4e9cf', stroke: '#3a2816', 'stroke-width': 1.2 }, s);
      el('path', { d: 'M0,-40 l8,3 l-8,3', fill: '#a8352a' }, s);
      el('path', { class: 'wave', d: 'M-34,8 q5,-5 10,0 t10,0 M20,8 q5,-5 10,0 t10,0' }, s);
      break;
    }
    // 바다 이름
    const R2 = state.regions;
    const yLow = R2.length ? Math.max(...R2.map((r) => r.cy + r.ry)) : P.y + P.h * 0.7;
    if (state.portrait) txt(g, P.x + P.w / 2, P.y + P.h - 70, '미 지 의  바 다', { class: 'sea-text', 'font-size': 22, 'text-anchor': 'middle' });
    else {
      txt(g, P.x + P.w * 0.3, Math.min(yLow + 120, P.y + P.h - 90), '미 지 의  바 다', { class: 'sea-text', 'font-size': 30, 'text-anchor': 'middle' });
      txt(g, P.x + P.w * 0.3, Math.min(yLow + 146, P.y + P.h - 64), 'MARE  INCOGNITUM', { class: 'sea-text', 'font-size': 12, 'text-anchor': 'middle' });
    }
  }

  function drawIsland(parent, worldLabels, r, i) {
    const seed = 97 + i * 131;
    const g = el('g', { class: 'island-g', 'data-region': r.key }, parent);
    if (r.draft) {
      [[16, 0.4, 1.3], [32, 0.25, 1.1], [52, 0.13, 1]].forEach(([d, o, w], k) =>
        el('path', { class: 'coast-ripple', d: blobPath(r.cx, r.cy, r.rx + d, r.ry + d * 0.85, seed), 'stroke-opacity': o, 'stroke-width': w, 'stroke-dasharray': k === 2 ? '3 6' : 'none' }, g));
      el('path', { class: 'island', d: blobPath(r.cx, r.cy, r.rx, r.ry, seed), fill: '#e9dcb8', 'stroke-dasharray': '7 6' }, g);
    } else {
      drawLand(g, r);
      drawRocks(g, r, seed);
      drawRiver(g, r, seed);
      drawRelief(g, r, seed);
      drawPalms(g, r, seed);
    }
    // 가까이서 보이는 섬 이름 (해안가)
    const near = el('g', { class: 'near-only', style: 'cursor:pointer' }, g);
    const ny = r.draft ? r.cy + r.ry + 40 : r.labelY;
    const name = /^[가-힣]{1,6}$/.test(r.name) ? r.name.split('').join(' ') : r.name;
    txt(near, r.cx, ny, r.draft ? '미개척 섬' : name, { class: 'name-near halo', 'font-size': r.draft ? 18 : 24, 'text-anchor': 'middle' });
    txt(near, r.cx, ny + 17, r.draft ? `${r.name} · 아직 그려지지 않음` : `${r.en} · CHAPTER ${r.key}`, { class: 'name-near-sub halo', 'text-anchor': 'middle' });
    near.addEventListener('click', (e) => { e.stopPropagation(); if (!dragMoved) openRegion(r.key); });
    if (r.draft) {
      const q = el('g', { class: 'mark', transform: `translate(${r.cx},${r.cy})` }, g);
      el('circle', { r: 44, fill: 'none', stroke: '#3a2816', 'stroke-dasharray': '4 6', 'stroke-width': 1.5 }, q);
      txt(q, 0, 16, '?', { 'font-size': 46, 'text-anchor': 'middle', fill: '#a8352a', 'font-family': 'Gowun Batang, serif', 'font-weight': 700 });
      q.addEventListener('click', (e) => { e.stopPropagation(); if (!dragMoved) openRegion(r.key); });
    }
    // 멀리서 보이는 큰 섬 이름
    const wl = el('g', { style: 'cursor:pointer' }, worldLabels);
    const all = state.nodes.filter((n) => n.region === r && !n.draft);
    const tre = all.filter((n) => n.mark === 'clue');
    const found = tre.filter((n) => state.visited.has(n.id)).length;
    const big = r.draft ? 40 : Math.min(78, Math.max(48, r.rx / 4.2));
    el('circle', { cx: r.cx, cy: r.cy - big * 1.15, r: big * 0.42, fill: r.color, stroke: '#3a2816', 'stroke-width': 2 }, wl);
    txt(wl, r.cx, r.cy - big * 1.15 + big * 0.16, r.idx + 1, { 'text-anchor': 'middle', 'font-size': big * 0.46, fill: '#f1e5c8', 'font-family': 'Gowun Batang, serif', 'font-weight': 700 });
    txt(wl, r.cx, r.cy + big * 0.32, r.draft ? '미개척 섬' : r.name, { class: 'name-world halo', 'font-size': big, 'text-anchor': 'middle', style: `stroke-width:${big / 7}px` });
    txt(wl, r.cx, r.cy + big * 0.32 + big * 0.55, r.draft ? `${r.name} · ?` : (tre.length ? `🔑 단서 ${found}/${tre.length}  ·  ` : '') + `지점 ${all.length}`, { class: 'name-world-sub halo', 'font-size': big * 0.3, 'text-anchor': 'middle', style: `stroke-width:${big / 12}px` });
    const go = (e) => { e.stopPropagation(); if (!dragMoved) zoomToRegion(r); };
    wl.addEventListener('click', go);
    g.addEventListener('click', (e) => { if (state.lod === 'world') go(e); });
  }

  // 높이 지도의 등고선을 그린다 (marching squares) → 해안선·물결선·안쪽 땅
  function contours(r) {
    if (r._ct) return r._ct;
    const L = r.land, b = L.box, cs = Math.max(10, L.t / 9);
    const nx = Math.ceil((b.x1 - b.x0) / cs) + 1, ny = Math.ceil((b.y1 - b.y0) / cs) + 1;
    const grid = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) grid[j * nx + i] = L.fieldAt(b.x0 + i * cs, b.y0 + j * cs);
    const SEG = { 1: [['L', 'B']], 2: [['B', 'R']], 3: [['L', 'R']], 4: [['T', 'R']], 5: [['L', 'T'], ['B', 'R']], 6: [['T', 'B']], 7: [['L', 'T']], 8: [['L', 'T']], 9: [['T', 'B']], 10: [['T', 'R'], ['L', 'B']], 11: [['T', 'R']], 12: [['L', 'R']], 13: [['B', 'R']], 14: [['L', 'B']] };
    const level = (lv) => {
      const adj = new Map(), pos = new Map();
      const G = (i, j) => grid[j * nx + i];
      const edge = (side, i, j, a, bb, c, d) => {
        let key, x, y, u;
        if (side === 'T') { key = `h${i},${j}`; u = (lv - a) / (bb - a); x = i + u; y = j; }
        else if (side === 'B') { key = `h${i},${j + 1}`; u = (lv - d) / (c - d); x = i + u; y = j + 1; }
        else if (side === 'L') { key = `v${i},${j}`; u = (lv - a) / (d - a); x = i; y = j + u; }
        else { key = `v${i + 1},${j}`; u = (lv - bb) / (c - bb); x = i + 1; y = j + u; }
        if (!pos.has(key)) pos.set(key, [b.x0 + x * cs + r.ox, b.y0 + y * cs + r.oy]);
        return key;
      };
      const link = (k1, k2) => { (adj.get(k1) || adj.set(k1, []).get(k1)).push(k2); (adj.get(k2) || adj.set(k2, []).get(k2)).push(k1); };
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = G(i, j), bb = G(i + 1, j), c = G(i + 1, j + 1), d = G(i, j + 1);
        const idx = (a > lv ? 8 : 0) | (bb > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
        (SEG[idx] || []).forEach(([s1, s2]) => link(edge(s1, i, j, a, bb, c, d), edge(s2, i, j, a, bb, c, d)));
      }
      const seen = new Set(), loops = [];
      for (const k0 of adj.keys()) {
        if (seen.has(k0)) continue;
        const loop = []; let k = k0, prev = null;
        while (k && !seen.has(k)) { seen.add(k); loop.push(pos.get(k)); const nb = adj.get(k).filter((q) => q !== prev && !seen.has(q)); prev = k; k = nb[0]; }
        if (loop.length >= 8) loops.push(loop);
      }
      return loops.map((lp) => {
        let q = lp;
        for (let it = 0; it < 2; it++) { // Chaikin 으로 매끄럽게
          const o = [];
          for (let m = 0; m < q.length; m++) { const p0 = q[m], p1 = q[(m + 1) % q.length]; o.push([p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25], [p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75]); }
          q = o;
        }
        return 'M' + q.map((pt) => pt[0].toFixed(1) + ',' + pt[1].toFixed(1)).join('L') + 'Z';
      }).join('');
    };
    const T = L.T0;
    r._ct = { rip: [level(T * 0.3), level(T * 0.5), level(T * 0.72)], coast: level(T), inner: level(T * 1.5), hill: level(T * 2.6), sea: level(T * 0.6) };
    return r._ct;
  }
  function drawLand(g, r) {
    const C = contours(r);
    [[0, 0.13, '3 6', 1], [1, 0.24, 'none', 1.1], [2, 0.4, 'none', 1.3]].forEach(([k, o, dash, w]) =>
      el('path', { class: 'coast-ripple', d: C.rip[k], 'stroke-opacity': o, 'stroke-width': w, 'stroke-dasharray': dash, 'fill-rule': 'evenodd' }, g));
    el('path', { class: 'coast', d: C.coast, fill: '#ead9a8', 'fill-rule': 'evenodd' }, g);
    el('path', { d: C.inner, fill: '#dcc48f', stroke: '#6b5a32', 'stroke-width': 1, 'stroke-dasharray': '1 4', 'stroke-opacity': 0.7, 'fill-rule': 'evenodd' }, g);
    if (C.hill) el('path', { class: 'contour', d: C.hill, 'fill-rule': 'evenodd' }, g);
  }

  // 땅 위의 무작위 점 (k 가 클수록 더 안쪽)
  function landPoint(R, r, k = 1.6) {
    const e = r._ext;
    for (let t = 0; t < 60; t++) {
      const x = e.x0 + r.ox + R() * (e.x1 - e.x0), y = e.y0 + r.oy + R() * (e.y1 - e.y0);
      if (onLand(r, x, y, k)) return { x, y };
    }
    return { x: r.cx, y: r.cy };
  }

  function drawRelief(g, r, seed) {
    const R = rng(seed + 3);
    const ly = r.labelY ?? r.cy + r.ry - 40;
    const free = (x, y, d) => !markNear(r, x, y, d) && !(Math.abs(y - ly) < 34 && Math.abs(x - r.cx) < 140);
    let placed = 0;
    for (let t = 0; t < 160 && placed < 6; t++) {
      const { x, y } = landPoint(R, r, 2.0);
      if (!free(x, y, 90)) continue;
      const s = 12 + R() * 9;
      el('path', { class: 'mountain', d: `M${x - s * 1.4},${y} L${x - s * 0.2},${y - s * 1.2} L${x + s * 0.4},${y - s * 0.6} L${x + s * 0.9},${y - s * 1.5} L${x + s * 2},${y}` }, g);
      el('path', { class: 'mountain-shade', d: `M${x - s * 0.1},${y - s * 0.9} l${s * 0.4},${s * 0.8} M${x + s * 1.05},${y - s * 1.2} l${s * 0.35},${s * 1.1} M${x + s * 1.35},${y - s * 0.8} l${s * 0.25},${s * 0.7}` }, g);
      placed++;
    }
    placed = 0;
    for (let t = 0; t < 200 && placed < 9; t++) {
      const { x, y } = landPoint(R, r, 1.6);
      if (!free(x, y, 70)) continue;
      for (let k = 0; k < 3; k++) {
        const tx = x + k * 9 - 9, ty = y + (k % 2) * 4;
        el('path', { d: `M${tx},${ty + 7} V${ty + 12}`, stroke: '#3a2816', 'stroke-width': 1.2 }, g);
        el('circle', { class: 'tree', cx: tx, cy: ty + 3, r: 4.6 }, g);
      }
      placed++;
    }
  }
  /* ---------------- ✕ 보물 (문제) ---------------- */
  // 문제 묶음: 섬마다 하나(id = 섬 번호) + 마지막 보물섬(id = 'final')
  function quizList() {
    const out = state.regions.filter((r) => islandQs(r).length).map((r) => ({ id: r.key, r, Q: islandQs(r), spot: r.xSpot }));
    if (hasQuiz()) out.push({ id: 'final', r: null, Q: finalQs(), spot: state.final && state.final.xSpot, final: true });
    return out;
  }
  const quizKey = (id) => `aimap.quiz.${state.map ? state.map.id : 'main'}.${id}`;
  function loadQuiz(id) {
    try { const v = JSON.parse(localStorage.getItem(quizKey(id)) || 'null'); if (v && Array.isArray(v.ok)) return v; } catch {}
    return { ok: [], solved: false };
  }
  function saveQuiz(id, v) { try { localStorage.setItem(quizKey(id), JSON.stringify(v)); } catch {} }

  function drawFinalIsland(islands) {
    const F = state.final;
    const g = el('g', { class: 'island-g treasure-isle' }, islands);
    drawLand(g, F);
    drawPalms(g, F, 909);
    drawRelief(g, F, 910);
  }
  function drawXMark(parent, spot, qz, big) {
    const solved = loadQuiz(qz.id).solved;
    const x = el('g', { class: 'mark big-x' + (big ? ' final-x' : ' island-x near-only') + (solved ? ' found' : ''), transform: `translate(${spot.x},${spot.y})`, tabindex: 0, role: 'button', 'aria-label': '보물 문제 열기', 'data-quiz': qz.id }, parent);
    if (!solved) el('circle', { class: 'x-beacon', r: big ? 30 : 20 }, x);
    el('circle', { class: 'ring', r: big ? 40 : 28 }, x);
    el('circle', { class: 'hit', r: big ? 48 : 34 }, x);
    el('g', { transform: `scale(${big ? 2.8 : 1.9})` }, x).innerHTML = iconMarkup('x', solved);
    x.addEventListener('click', (e) => { e.stopPropagation(); if (!dragMoved) openQuiz(qz.id); });
    x.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQuiz(qz.id); } });
  }
  function drawIslandXs(marks, svg) {
    quizList().forEach((qz) => { if (qz.spot) drawXMark(qz.final ? svg : marks, qz.spot, qz, !!qz.final); });
  }

  // 정답 이펙트: 금화가 튀고, 카드가 반짝인다
  function celebrate(card, btn) {
    const cr = card.getBoundingClientRect(), br = (btn || card).getBoundingClientRect();
    const fx = document.createElement('div');
    fx.className = 'burst';
    fx.style.left = br.left - cr.left + br.width / 2 + 'px';
    fx.style.top = br.top - cr.top + br.height / 2 + 'px';
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + Math.random() * 0.4, d = 34 + Math.random() * 30;
      const c = document.createElement('i');
      c.style.setProperty('--dx', Math.cos(a) * d + 'px');
      c.style.setProperty('--dy', Math.sin(a) * d - 10 + 'px');
      c.style.animationDelay = Math.random() * 60 + 'ms';
      fx.appendChild(c);
    }
    const plus = document.createElement('b');
    plus.textContent = '🔓 +1';
    fx.appendChild(plus);
    card.appendChild(fx);
    card.classList.remove('glow'); void card.offsetWidth; card.classList.add('glow');
    setTimeout(() => fx.remove(), 1100);
  }

  function openQuiz(id = 'final') {
    const qz = quizList().find((x) => x.id === id);
    if (!qz) return;
    const conf = state.map.quiz || {}, Q = qz.Q;
    state.active = 'quiz:' + id;
    markIsland(id);
    state.fromQuiz = null;
    const tag = $('#panel-region');
    tag.innerHTML = qz.final ? '✕ 보물 · 최종' : `✕ 보물 · ${esc(qz.r.name)} 섬`;
    tag.onclick = qz.final ? null : () => openRegion(qz.r.key);
    const st = loadQuiz(id);
    const body = $('#panel-body');
    const title = qz.final ? conf.title || '최종 보물' : `${qz.r.name} 섬의 보물`;
    const lead = qz.final
      ? `${mapTitle(state.map)} — 이 단원 전체를 확인하는 최종 문제예요. 모두 맞히면 보물 상자가 열려요.`
      : `${qz.r.name} 섬에서 배운 개념 문제예요. 모두 맞히면 이 섬의 보물 상자가 열려요.`;
    body.innerHTML = `<span class="mark-badge clue">${iconSvg('x', st.solved)}${qz.final ? '최종 보물 · 단원 전체 문제' : '보물 · 이 섬의 개념 문제'}</span>
      <h2 class="node-title">${esc(title)}</h2>
      <p class="node-summary">${esc(lead)}</p>
      <div class="lockbar" id="lockbar"></div>
      <div id="quiz-list"></div>
      <div id="quiz-end"></div>`;
    const list = body.querySelector('#quiz-list');
    const lockbar = body.querySelector('#lockbar');
    const end = body.querySelector('#quiz-end');
    const nodeLabel = (nid) => (state.byId.get(nid) || {}).label || nid;
    function paintLocks(just) {
      lockbar.innerHTML = Q.map((_, i) => `<span class="${st.ok.includes(i) ? 'open' : ''}${i === just ? ' pop' : ''}" title="${i + 1}번">${st.ok.includes(i) ? '🔓' : '🔒'}</span>`).join('') +
        `<b>${st.ok.length} / ${Q.length}</b>`;
    }
    function finish(fresh) {
      st.solved = true; saveQuiz(id, st);
      updateProgress();
      const reward = qz.final
        ? `<div class="reward">${conf.reward ? esc(conf.reward) : '상자 안에 무엇이 들었을지는 아직 정하지 않았어요.'}</div>`
        : `<div class="reward">이 섬의 보물을 찾았어요. 마지막 보물섬의 최종 문제에도 도전해 보세요!</div>`;
      end.innerHTML = `<div class="chest"><div class="chest-icon">${iconSvg('x', true)}</div>
        <h3>🎉 ${qz.final ? '최종 보물 상자를 열었어요!' : '보물 상자를 열었어요!'}</h3>${reward}
        <div class="w-row" style="justify-content:center">${qz.final ? '' : '<button class="w-btn on" data-final>최종 보물로 가기 ›</button>'}<button class="w-btn" data-reset>처음부터 다시 풀기</button></div></div>`;
      end.querySelector('[data-reset]').onclick = () => { saveQuiz(id, { ok: [], solved: false }); drawMap(); updateProgress(); openQuiz(id); };
      const fb = end.querySelector('[data-final]');
      if (fb) fb.onclick = () => openQuiz('final');
      if (fresh) { drawMap(); end.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
    Q.forEach((q, i) => {
      const card = document.createElement('section');
      card.className = 'quiz-q' + (st.ok.includes(i) ? ' solved' : '');
      const input = q.type === 'number'
        ? `<div class="w-row"><input class="num-in q-num" type="number" step="any" placeholder="숫자 입력" style="width:140px;text-align:left"><button class="w-btn on q-check">확인</button></div>`
        : `<div class="q-opts">${q.options.map((o, k) => `<button class="q-opt" data-k="${k}"><span>${'①②③④⑤⑥'[k] || k + 1}</span>${esc(o)}</button>`).join('')}</div>`;
      card.innerHTML = `<div class="q-head"><span class="q-num-tag">${i + 1}</span>${esc(q.q)}</div>${input}<div class="q-fb"></div>`;
      const fb = card.querySelector('.q-fb');
      const showRight = () => {
        card.classList.add('solved');
        fb.className = 'q-fb ok';
        fb.innerHTML = `✓ 정답! ${esc(q.explain || '')}`;
        if (q.type === 'number') card.querySelector('.q-num').value = q.answer;
        else card.querySelector(`.q-opt[data-k="${q.answer}"]`).classList.add('right');
        card.querySelectorAll('button, input').forEach((b) => (b.disabled = true));
      };
      const answer = (ok, btn) => {
        if (ok) {
          if (!st.ok.includes(i)) st.ok.push(i);
          saveQuiz(id, st); showRight(); paintLocks(i);
          celebrate(card, btn);
          if (st.ok.length === Q.length && !st.solved) finish(true);
          return;
        }
        if (btn && btn.classList.contains('q-opt')) { btn.classList.add('wrong'); btn.disabled = true; }
        fb.className = 'q-fb ng';
        fb.innerHTML = '✗ 아니에요. 다시 생각해 보세요.' + (q.about && state.byId.has(q.about) ? ` <button class="w-btn q-review">${esc(nodeLabel(q.about))} 다시 보러 가기</button>` : '');
        const rv = fb.querySelector('.q-review');
        if (rv) rv.onclick = () => { state.fromQuiz = id; openNode(q.about); };
        card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      };
      if (st.ok.includes(i)) showRight();
      else if (q.type === 'number') {
        const inp = card.querySelector('.q-num');
        const check = () => { const v = parseFloat(inp.value); if (!isFinite(v)) { inp.classList.add('bad'); return; } inp.classList.remove('bad'); answer(Math.abs(v - q.answer) < 1e-6, card.querySelector('.q-check')); };
        card.querySelector('.q-check').onclick = check;
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
      } else {
        card.querySelectorAll('.q-opt').forEach((b) => (b.onclick = () => answer(+b.dataset.k === q.answer, b)));
      }
      list.appendChild(card);
    });
    paintLocks();
    if (st.solved) finish(false);
    const nav = $('#panel-nav');
    nav.innerHTML = '';
    const back = document.createElement('button');
    back.style.gridColumn = '1 / -1';
    back.textContent = '지도로 돌아가기';
    back.onclick = closePanel;
    nav.appendChild(back);
    body.scrollTop = 0;
    openPanel();
    markActive();
    if (qz.spot) { const { W } = svgSize(); focusPoint(qz.spot.x, qz.spot.y, Math.min(Math.max(state.vb.w, W * 0.9), W * 1.1)); }
    history.replaceState(null, '', '#' + mapPrefix() + 'q/' + encodeURIComponent(id));
  }

  /* ---------------- 섬 장식 ---------------- */
  const markNear = (r, x, y, d) => state.nodes.some((n) => n.region === r && Math.hypot(n.x - x, n.y - y) < d) || (!!r.xSpot && Math.hypot(r.xSpot.x - x, r.xSpot.y - y) < d + 10);
  function drawRocks(g, r, seed) {
    const R = rng(seed + 21), e = r._ext;
    for (let k = 0, t = 0; k < 6 && t < 200; t++) {
      const x = e.x0 + r.ox - 60 + R() * (e.x1 - e.x0 + 120), y = e.y0 + r.oy - 60 + R() * (e.y1 - e.y0 + 120);
      if (!onLand(r, x, y, 0.3) || onLand(r, x, y, 0.6)) continue; // 해안 바로 앞 바다
      const sz = 4 + R() * 6, pts = [];
      for (let j = 0; j < 6; j++) { const c = (j / 6) * Math.PI * 2; pts.push(`${(x + Math.cos(c) * sz * (0.7 + R() * 0.4)).toFixed(1)},${(y + Math.sin(c) * sz * 0.7 * (0.7 + R() * 0.4)).toFixed(1)}`); }
      el('polygon', { points: pts.join(' '), fill: '#b9a47d', stroke: '#3a2816', 'stroke-width': 1.2 }, g);
      el('path', { class: 'wave', d: `M${x - sz - 6},${y + sz * 0.7 + 3} q4,-3 8,0 M${x + sz - 2},${y + sz * 0.7 + 4} q4,-3 8,0` }, g);
      k++;
    }
  }

  function drawRiver(g, r, seed) {
    if (!r.land) return;
    const R = rng(seed + 31);
    for (let t = 0; t < 30; t++) {
      const s0 = landPoint(R, r, 2.4), a = R() * Math.PI * 2;
      const pts = [s0];
      let x = s0.x, y = s0.y, dir = a;
      for (let k = 0; k < 120 && onLand(r, x, y, 0.98); k++) { dir += (R() - 0.5) * 0.5; x += Math.cos(dir) * 12; y += Math.sin(dir) * 12; if (k % 3 === 2) pts.push({ x, y }); }
      pts.push({ x: x + Math.cos(dir) * 14, y: y + Math.sin(dir) * 14 });
      if (pts.length < 6 || pts.some((q) => markNear(r, q.x, q.y, 44))) continue;
      el('ellipse', { cx: s0.x, cy: s0.y, rx: 13, ry: 8, fill: '#9ebfcd', stroke: '#3a2816', 'stroke-width': 1.2 }, g);
      el('path', { d: curve(pts), fill: 'none', stroke: '#3a2816', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-opacity': 0.8 }, g);
      el('path', { d: curve(pts), fill: 'none', stroke: '#9ebfcd', 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
      return;
    }
  }

  function drawPalms(g, r, seed) {
    if (!r.land) return;
    const R = rng(seed + 41), e = r._ext;
    const ly = r.labelY ?? r.cy + r.ry + 30;
    let placed = 0;
    for (let t = 0; t < 400 && placed < 7; t++) {
      const x = e.x0 + r.ox + R() * (e.x1 - e.x0), y = e.y0 + r.oy + R() * (e.y1 - e.y0);
      if (!onLand(r, x, y, 1.05) || onLand(r, x, y, 1.6)) continue; // 해안가 띠
      if (markNear(r, x, y - 12, 70) || (Math.abs(y - ly) < 40 && Math.abs(x - r.cx) < 140)) continue;
      const lean = R() > 0.5 ? 1 : -1, tx = x + 4 * lean, ty = y - 24;
      el('ellipse', { cx: x + 6, cy: y + 2, rx: 9, ry: 2.5, fill: '#3a2816', opacity: 0.25 }, g);
      el('path', { d: `M${x},${y} q${-3 * lean},-11 ${4 * lean},-24`, fill: 'none', stroke: '#6b4a2a', 'stroke-width': 2.8, 'stroke-linecap': 'round' }, g);
      [[-15, 3], [-10, -6], [0, -10], [10, -6], [15, 3]].forEach(([fx, fy]) =>
        el('path', { d: `M${tx},${ty} Q${tx + fx * 0.55},${ty + fy - 7} ${tx + fx},${ty + fy}`, fill: 'none', stroke: '#56732f', 'stroke-width': 3, 'stroke-linecap': 'round' }, g));
      el('circle', { cx: tx - 1.5, cy: ty + 2.5, r: 1.8, fill: '#6b4a2a' }, g);
      el('circle', { cx: tx + 2, cy: ty + 3, r: 1.8, fill: '#6b4a2a' }, g);
      placed++;
    }
  }

  // 바다 위를 흐르는 물줄기와 가끔 이는 파도 (섬 위로는 지나가지 않는다)
  function drawCurrents(g, P, defs) {
    const R = rng(4711);
    const mask = el('mask', { id: 'sea-mask', maskUnits: 'userSpaceOnUse', x: P.x, y: P.y, width: P.w, height: P.h }, defs);
    el('rect', { x: P.x, y: P.y, width: P.w, height: P.h, fill: '#fff' }, mask);
    allLands().forEach((r) => {
      if (r.land) el('path', { d: contours(r).sea, fill: '#000', 'fill-rule': 'evenodd' }, mask);
      else el('ellipse', { cx: r.cx, cy: r.cy, rx: r.rx * 1.25, ry: r.ry * 1.25, fill: '#000' }, mask);
    });
    const cur = el('g', { mask: 'url(#sea-mask)', 'pointer-events': 'none' }, g);
    const N = Math.max(8, Math.round(P.h / 110));
    for (let k = 0; k < N; k++) {
      const y0 = P.y + 150 + (k + R() * 0.6) * ((P.h - 230) / N);
      const amp = 14 + R() * 30, wl = 260 + R() * 300, ph = R() * 6, tilt = (R() - 0.5) * 0.08;
      const pts = [];
      for (let x = P.x; x <= P.x + P.w + 40; x += 40) pts.push({ x, y: y0 + Math.sin((x / wl) * Math.PI * 2 + ph) * amp + (x - P.x) * tilt });
      const d = curve(pts), dur = 18 + R() * 22, rev = R() < 0.35;
      el('path', { class: 'current', d, style: `animation-duration:${dur.toFixed(1)}s;${rev ? 'animation-direction:reverse;' : ''}` }, cur);
      if (R() < 0.5) el('path', { class: 'current thin', d, transform: 'translate(0,9)', style: `animation-duration:${(dur * 1.3).toFixed(1)}s;${rev ? 'animation-direction:reverse;' : ''}` }, cur);
    }
    // 가끔 이는 파도
    for (let k = 0, t = 0; k < (state.portrait ? 12 : 22) && t < 400; t++) {
      const x = P.x + 80 + R() * (P.w - 160), y = P.y + 200 + R() * (P.h - 280);
      if (inIsland(x, y, 1.3)) continue;
      const s = 0.8 + R() * 0.7;
      const w = el('g', { transform: `translate(${x.toFixed(0)},${y.toFixed(0)}) scale(${s.toFixed(2)})` }, cur);
      const crest = el('g', { class: 'crest', style: `animation-delay:${(-R() * 9).toFixed(1)}s;animation-duration:${(7 + R() * 5).toFixed(1)}s` }, w);
      el('path', { d: 'M-22,6 Q-10,-14 6,-10 Q16,-8 18,2 Q10,-4 4,0 Q8,6 2,8', fill: '#f4ead2', stroke: '#3f6a86', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, crest);
      el('path', { d: 'M-30,9 q8,-5 16,0 t16,0 t16,0', fill: 'none', stroke: '#3f6a86', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, crest);
      el('circle', { cx: 12, cy: -14, r: 1.6, fill: '#3f6a86' }, crest);
      el('circle', { cx: 17, cy: -9, r: 1.2, fill: '#3f6a86' }, crest);
      k++;
    }
  }

  /* ---------------- 바다 동물 ---------------- */
  function drawCreatures(g, P) {
    const R = rng(123);
    const comp = compassPos(P, state.portrait ? 22 : 34);
    const spot = (pad, top = 260) => {
      for (let t = 0; t < 400; t++) {
        const x = P.x + 120 + R() * (P.w - 240), y = P.y + top + R() * (P.h - top - 110);
        if (inIsland(x, y, pad)) continue;
        if (x < P.x + 640 && y < P.y + 280) continue;
        if (Math.hypot(x - comp.x, y - comp.y) < comp.r + 120) continue;
        return { x, y };
      }
      return null;
    };
    const put = (pt, cls, scale, flip, delay) => {
      const outer = el('g', { transform: `translate(${pt.x},${pt.y}) scale(${flip ? -scale : scale},${scale})`, 'pointer-events': 'none' }, g);
      return el('g', { class: cls, style: `animation-delay:${-delay}s` }, outer);
    };
    const W1 = '#8aa3b0', INK = '#3a2816';
    let pt;
    if ((pt = spot(1.7))) { // 고래
      const w = put(pt, 'bob', state.portrait ? 0.9 : 1.15, R() > 0.5, R() * 5);
      el('path', { d: 'M42,-2 C52,-6 58,-14 62,-24 C62,-12 68,-6 76,-4 C68,0 62,6 62,16 C58,6 52,2 42,3 Z', fill: W1, stroke: INK, 'stroke-width': 1.6 }, w);
      el('path', { d: 'M-46,0 C-46,-20 -20,-26 4,-24 C26,-22 40,-12 44,-2 C46,4 40,8 30,9 C8,12 -26,12 -40,8 C-45,6 -46,3 -46,0 Z', fill: W1, stroke: INK, 'stroke-width': 1.8 }, w);
      el('path', { d: 'M-40,5 C-20,11 10,11 30,7 M-30,8 l-2,4 M-20,9 l-1,4 M-10,10 l0,4 M0,10 l1,4', fill: 'none', stroke: INK, 'stroke-width': 1 }, w);
      el('path', { d: 'M-8,6 C-4,16 4,20 10,18 C6,14 2,10 0,6', fill: W1, stroke: INK, 'stroke-width': 1.3 }, w);
      el('circle', { cx: -32, cy: -5, r: 2, fill: INK }, w);
      el('path', { d: 'M-18,-24 C-20,-36 -28,-42 -34,-44 M-18,-24 C-16,-38 -10,-44 -4,-46 M-18,-24 L-18,-44', fill: 'none', stroke: '#3f6a86', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, w);
      [[-36, -48], [-2, -50], [-18, -50]].forEach(([cx, cy]) => el('circle', { cx, cy, r: 1.8, fill: '#3f6a86' }, w));
      el('path', { class: 'wave', d: 'M-62,12 q8,-6 16,0 t16,0 t16,0 t16,0 t16,0 t16,0 t16,0 t16,0' }, w);
    }
    if ((pt = spot(1.6))) { // 바다뱀
      const sv = put(pt, 'bob', state.portrait ? 0.8 : 1, R() > 0.5, R() * 5);
      el('path', { d: 'M-14,2 q6,-12 14,-2', fill: 'none', stroke: INK, 'stroke-width': 9, 'stroke-linecap': 'round' }, sv);
      const humps = 'M0,0 q14,-34 28,0 M44,0 q14,-30 28,0 M88,0 q12,-24 24,0';
      el('path', { d: humps, fill: 'none', stroke: INK, 'stroke-width': 12, 'stroke-linecap': 'round' }, sv);
      el('path', { d: humps + ' M-14,2 q6,-12 14,-2', fill: 'none', stroke: '#6f8f5c', 'stroke-width': 8, 'stroke-linecap': 'round' }, sv);
      [[14, -18], [58, -16], [100, -13]].forEach(([x, y]) => el('path', { d: `M${x - 5},${y} l5,-9 l5,9 Z`, fill: '#a8352a', stroke: INK, 'stroke-width': 1 }, sv));
      el('path', { d: 'M112,0 q4,-22 16,-24 q14,-2 18,8 q-6,6 -18,6 q-6,0 -10,10 Z', fill: '#6f8f5c', stroke: INK, 'stroke-width': 1.6 }, sv);
      el('circle', { cx: 132, cy: -15, r: 1.8, fill: INK }, sv);
      el('path', { d: 'M146,-10 l9,-3 M146,-10 l9,3', stroke: '#a8352a', 'stroke-width': 1.4 }, sv);
      el('path', { class: 'wave', d: 'M-22,6 q6,-5 12,0 t12,0 M26,6 q6,-5 12,0 t12,0 M70,6 q6,-5 12,0 t12,0 M110,6 q6,-5 12,0 t12,0' }, sv);
    }
    for (let k = 0; k < (state.portrait ? 2 : 3); k++) { // 뛰어오르는 물고기
      if (!(pt = spot(1.3))) break;
      const f = put(pt, 'jump', 1, R() > 0.5, R() * 3);
      el('path', { d: 'M-22,8 q22,-40 44,0', fill: 'none', stroke: '#3f6a86', 'stroke-width': 1, 'stroke-dasharray': '2 4', 'stroke-opacity': 0.6 }, f);
      el('path', { d: 'M-8,-14 q8,-7 16,0 q-8,7 -16,0 Z', fill: '#c08a2b', stroke: INK, 'stroke-width': 1.2, transform: 'rotate(18)' }, f);
      el('path', { d: 'M8,-14 l6,-5 v10 z', fill: '#c08a2b', stroke: INK, 'stroke-width': 1, transform: 'rotate(18)' }, f);
      el('path', { class: 'wave', d: 'M-30,10 q4,-4 8,0 t8,0 M20,10 q4,-4 8,0 t8,0' }, f);
    }
    for (let k = 0; k < (state.portrait ? 3 : 5); k++) { // 날아다니는 새 떼
      if (!(pt = spot(1.1, 180))) break;
      const b = put(pt, 'fly', 0.9 + R() * 0.5, R() > 0.5, R() * 12);
      for (let j = 0, n = 2 + Math.floor(R() * 3); j < n; j++) {
        const x = j * 16 + R() * 8, y = (j % 2) * 9 - R() * 6, w = 6 + R() * 3;
        el('path', { d: `M${x - w},${y} q${w / 2},-${w * 0.7} ${w},0 q${w / 2},-${w * 0.7} ${w},0`, fill: 'none', stroke: INK, 'stroke-width': 1.5, 'stroke-linecap': 'round' }, b);
      }
    }
  }

  function drawEmptyMap(svg, P) {
    if (state.demo) {
      const D = state.demo, g = el('g', { 'pointer-events': 'none' }, svg);
      const nm = { ellipse: '타원', T: 'T', 'ㅗ': 'ㅗ', U: 'U', L: 'L', C: 'C' }[D.shape] || D.shape;
      txt(g, D.cx, D.labelY + 30, `‘${nm}’ 모양 섬 (예시)`, { class: 'ink-text halo', 'text-anchor': 'middle', 'font-size': 34, 'font-weight': 700 });
      txt(g, D.cx, D.labelY + 64, '아직 그려지지 않은 지도 — config.js 의 maps 에 목차 파일을 추가하면 이 바다에 섬들이 떠올라요', { class: 'ink-text halo', 'text-anchor': 'middle', 'font-size': 16, fill: '#5b432a' });
      return;
    }
    const g = el('g', { transform: `translate(${P.x + P.w / 2},${P.y + P.h / 2})`, 'pointer-events': 'none' }, svg);
    el('path', { d: blobPath(0, -30, 260, 170, 77, 0.16), fill: 'none', stroke: '#3a2816', 'stroke-width': 2, 'stroke-dasharray': '8 9', 'stroke-opacity': 0.5 }, g);
    el('circle', { cx: 0, cy: -70, r: 46, fill: '#f4e8cc', stroke: '#3a2816', 'stroke-width': 1.8, 'stroke-dasharray': '4 5' }, g);
    txt(g, 0, -52, '?', { 'text-anchor': 'middle', 'font-size': 56, fill: '#a8352a', 'font-family': 'Gowun Batang, serif', 'font-weight': 700 });
    txt(g, 0, 30, '아직 그려지지 않은 지도', { class: 'ink-text halo', 'text-anchor': 'middle', 'font-size': state.portrait ? 32 : 40, 'font-weight': 700 });
    txt(g, 0, 70, '새 개념을 정리한 목차 파일을 만들고 config.js 의 maps 에 추가하면', { class: 'ink-text halo', 'text-anchor': 'middle', 'font-size': state.portrait ? 14 : 18, fill: '#5b432a' });
    txt(g, 0, 98, '이 바다 위에 섬들이 떠올라요', { class: 'ink-text halo', 'text-anchor': 'middle', 'font-size': state.portrait ? 14 : 18, fill: '#5b432a' });
  }

  function drawZones(g) {
    state.nodes.filter((n) => n.mark === 'area' && !n.draft && !n.region.draft).forEach((n, i) => {
      const pts = [n, ...n.sides];
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2 + 12;
      const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 78, ry = (Math.max(...ys) - Math.min(...ys)) / 2 + 66;
      el('path', { class: 'zone', d: blobPath(cx, cy, rx, ry, 300 + i * 17, 0.12) }, g);
      txt(g, cx, cy - ry - 8, `◇ ${n.label} 구역`, { class: 'zone-label halo', 'text-anchor': 'middle' });
    });
  }

  function drawRoutes(g) {
    const stops = [];
    state.regions.forEach((r) => {
      if (r.draft) stops.push({ x: r.cx, y: r.cy, region: r, id: null });
      else {
        r.nodes.flatMap((n) => [n, ...n.sides]).filter((n) => !n.draft).forEach((n) => stops.push(n));
        if (r.xSpot) stops.push({ x: r.xSpot.x, y: r.xSpot.y, region: r, id: null });
      }
    });
    if (state.final) stops.push({ x: state.final.xSpot.x, y: state.final.xSpot.y, region: state.final, id: null });
    // 모든 지점을 잇는 실선 (보물길 아래에 깔린다)
    if (stops.length > 1) {
      const pts = [];
      for (let i = 0; i < stops.length; i++) {
        pts.push(stops[i]);
        const c = stops[i + 1];
        if (c && c.region !== stops[i].region && !state.portrait) pts.push({ x: (stops[i].x + c.x) / 2, y: (stops[i].y + c.y) / 2 + 80 });
      }
      el('path', { class: 'route-line', d: curve(pts) }, g);
    }
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], c = stops[i + 1];
      const sea = a.region !== c.region;
      let d;
      if (sea) d = curve(state.portrait ? [a, c] : [a, { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 + 80 }, c]);
      else {
        const p0 = stops[i - 1] && stops[i - 1].region === a.region ? stops[i - 1] : a;
        const p3 = stops[i + 2] && stops[i + 2].region === c.region ? stops[i + 2] : c;
        d = `M${a.x},${a.y}C${a.x + (c.x - p0.x) / 6},${a.y + (c.y - p0.y) / 6} ${c.x - (p3.x - a.x) / 6},${c.y - (p3.y - a.y) / 6} ${c.x},${c.y}`;
      }
      const done = a.id && c.id && state.visited.has(a.id) && state.visited.has(c.id);
      el('path', { class: 'route' + (sea ? ' sea' : '') + (done ? ' done' : ''), d }, g);
    }
  }

  function drawMark(parent, n, isNext) {
    const mark = n.draft ? 'unknown' : n.mark;
    const found = state.visited.has(n.id);
    const g = el('g', {
      class: `mark ${mark}${n.side ? ' small' : ''}${found ? ' found' : ''}${isNext ? ' next' : ''}`,
      transform: `translate(${n.x},${n.y})`, 'data-id': n.id, tabindex: 0, role: 'button', 'aria-label': `${MARK_NAME[mark]} · ${n.label}`,
    }, parent);
    if (isNext) el('circle', { class: 'beacon', r: 14 }, g);
    el('circle', { class: 'ring', r: 21 }, g);
    el('circle', { class: 'hit', r: 28 }, g);
    const icon = el('g', { transform: mark === 'clue' ? 'scale(1.3)' : 'scale(1.15)' }, g);
    icon.innerHTML = iconMarkup(mark, found);
    txt(g, 0, 34, n.label + (found ? ' ✓' : ''), { class: 'mark-label halo', 'text-anchor': 'middle' });
    const tag = mark === 'clue' ? (found ? '찾은 단서' : '단서가 있는 곳') : MARK_NAME[mark];
    txt(g, 0, -24, tag, { class: 'mark-tag halo detail-only', 'text-anchor': 'middle' });
    if (n.summary) {
      const s = n.summary.length > 24 ? n.summary.slice(0, 23) + '…' : n.summary;
      txt(g, 0, 50, s, { class: 'mark-sum halo detail-only', 'text-anchor': 'middle' });
    }
    g.addEventListener('click', (e) => { e.stopPropagation(); if (!dragMoved) openNode(n.id); });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNode(n.id); } });
  }

  function drawFrame(svg, P, inset) {
    const f = el('g', { 'pointer-events': 'none' }, svg);
    el('rect', { class: 'frame', x: P.x + inset, y: P.y + inset, width: P.w - inset * 2, height: P.h - inset * 2, 'stroke-width': 2.4 }, f);
    el('rect', { class: 'frame', x: P.x + inset - 9, y: P.y + inset - 9, width: P.w - inset * 2 + 18, height: P.h - inset * 2 + 18, 'stroke-width': 1 }, f);
    // 눈금 (검정/흰색 번갈아)
    const step = 60;
    for (let x = P.x + inset, k = 0; x < P.x + P.w - inset - 1; x += step, k++) {
      if (k % 2) continue;
      const w = Math.min(step, P.x + P.w - inset - x);
      el('rect', { x, y: P.y + inset - 9, width: w, height: 9, fill: '#3a2816', opacity: 0.75 }, f);
      el('rect', { x, y: P.y + P.h - inset, width: w, height: 9, fill: '#3a2816', opacity: 0.75 }, f);
    }
    for (let y = P.y + inset, k = 0; y < P.y + P.h - inset - 1; y += step, k++) {
      if (k % 2) continue;
      const h = Math.min(step, P.y + P.h - inset - y);
      el('rect', { x: P.x + inset - 9, y, width: 9, height: h, fill: '#3a2816', opacity: 0.75 }, f);
      el('rect', { x: P.x + P.w - inset, y, width: 9, height: h, fill: '#3a2816', opacity: 0.75 }, f);
    }
  }
  function drawCartouche(svg, P, inset) {
    const x = P.x + inset + (state.portrait ? 26 : 50), y = P.y + inset + (state.portrait ? 30 : 46);
    const W = state.portrait ? 330 : 470, H = state.portrait ? 120 : 140;
    const g = el('g', { transform: `translate(${x},${y})`, 'pointer-events': 'none' }, svg);
    el('path', { d: `M0,10 Q0,0 10,0 H${W - 10} Q${W},0 ${W},10 V${H - 10} Q${W},${H} ${W - 10},${H} H10 Q0,${H} 0,${H - 10} Z`, fill: '#f4e8cc', stroke: '#3a2816', 'stroke-width': 2 }, g);
    el('path', { d: `M8,16 Q8,8 16,8 H${W - 16} Q${W - 8},8 ${W - 8},16 V${H - 16} Q${W - 8},${H - 8} ${W - 16},${H - 8} H16 Q8,${H - 8} 8,${H - 16} Z`, fill: 'none', stroke: '#3a2816', 'stroke-width': 0.8 }, g);
    const title = mapTitle(state.map);
    const big = Math.min(state.portrait ? 30 : 38, (W - 40) / Math.max(1, title.length * 0.9));
    txt(g, W / 2, 62, title, { class: 'ink-text', 'font-size': big, 'font-weight': 700, 'text-anchor': 'middle' });
    txt(g, W / 2, 88, (state.map && state.map.subtitle) || '', { class: 'ink-text', 'font-size': state.portrait ? 12 : 14, 'text-anchor': 'middle', fill: '#5b432a' });
    const tre = state.nodes.filter((n) => n.mark === 'clue' && !n.draft).length;
    txt(g, W / 2, 114, quizList().length ? `섬마다 ✕ 보물 · 마지막 섬에 최종 보물` : '아직 아무것도 묻혀 있지 않다', { 'font-family': 'IBM Plex Mono', 'font-size': state.portrait ? 10 : 12, 'text-anchor': 'middle', fill: '#a8352a', 'letter-spacing': '.12em' });
  }
  function drawCompass(svg, P, inset) {
    const c = compassPos(P, inset);
    const g = el('g', { transform: `translate(${c.x},${c.y})`, 'pointer-events': 'none' }, svg);
    const r = c.r;
    el('circle', { r: r * 1.05, fill: '#f4e8cc', stroke: '#3a2816', 'stroke-width': 1.5 }, g);
    el('circle', { r: r * 0.9, fill: 'none', stroke: '#3a2816', 'stroke-width': 0.8, 'stroke-dasharray': '2 3' }, g);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 - Math.PI / 2, long = k % 2 === 0, L = long ? r : r * 0.62, w = long ? r * 0.16 : r * 0.1;
      const tip = [Math.cos(a) * L, Math.sin(a) * L], l = [Math.cos(a - Math.PI / 2) * w, Math.sin(a - Math.PI / 2) * w], rr = [Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w];
      el('path', { d: `M0,0 L${l[0]},${l[1]} L${tip[0]},${tip[1]} Z`, fill: k === 0 ? '#a8352a' : '#3a2816', stroke: '#3a2816', 'stroke-width': 0.8 }, g);
      el('path', { d: `M0,0 L${rr[0]},${rr[1]} L${tip[0]},${tip[1]} Z`, fill: '#f4e8cc', stroke: '#3a2816', 'stroke-width': 0.8 }, g);
    }
    el('circle', { r: r * 0.08, fill: '#3a2816' }, g);
    [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]].forEach(([t, dx, dy]) =>
      txt(g, dx * r * 1.25, dy * r * 1.25 + r * 0.1, t, { 'text-anchor': 'middle', 'font-family': 'Gowun Batang, serif', 'font-weight': 700, 'font-size': r * 0.26, fill: '#3a2816' }));
  }

  /* ---------------- 이동 · 확대 · 확대 단계 ---------------- */
  let dragMoved = false;
  const svgSize = () => { const s = $('#map'); return { W: s.clientWidth || 1, H: s.clientHeight || 1 }; };
  function fitWidth() {
    const { W, H } = svgSize(), b = state.bounds;
    return W * Math.max(b.w / W, b.h / H);
  }
  function setVB(x, y, w) {
    const { W, H } = svgSize();
    state.vb = { x, y, w, h: w * (H / W) };
    $('#map').setAttribute('viewBox', `${x} ${y} ${w} ${state.vb.h}`);
    applyLod();
    updateCompass();
  }
  const LOD_TEXT = {
    world: '🗺 <b>전체 지도</b> · 섬을 눌러 들어가 보세요 · 붉은 ✕ 를 누르면 보물 문제가 나와요',
    island: '🏝 <b>섬</b> · 표시를 눌러 열어 보세요',
    detail: '🔍 <b>자세히</b> · 요약까지 보여요',
  };
  function applyLod(force) {
    const { W, H } = svgSize(), v = visibleArea(), b = state.bounds;
    // 화면에 실제로 보이는 영역(패널 제외)이 지도 전체의 몇 분의 1인지
    const rel = Math.max(b.w / (state.vb.w * v.width / W), b.h / (state.vb.h * v.height / H));
    const lod = rel < 1.45 ? 'world' : state.vb.w / W < 0.8 ? 'detail' : 'island';
    if (lod === state.lod && !force) return;
    state.lod = lod;
    const svg = $('#map');
    svg.classList.remove('lod-world', 'lod-island', 'lod-detail');
    svg.classList.add('lod-' + lod);
    $('#zoom-level').innerHTML = state.regions.length ? LOD_TEXT[lod] : '🗺 <b>빈 지도</b> · 위쪽의 두루마리를 눌러 다른 지도를 펼쳐 보세요';
  }
  let anim = null;
  function animateVB(to, ms = 650) {
    cancelAnimationFrame(anim);
    const from = { ...state.vb }, t0 = performance.now();
    return new Promise((done) => {
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        setVB(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e, from.w + (to.w - from.w) * e);
        if (k < 1) anim = requestAnimationFrame(step); else done();
      };
      anim = requestAnimationFrame(step);
    });
  }
  const rackH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rack-h')) || 0;
  function visibleArea() {
    const { W, H } = svgSize();
    const open = document.body.classList.contains('panel-open');
    const mobile = W <= 760;
    const top = (mobile ? 140 : 100) + rackH();
    if (!open) return { left: 0, top, width: W, height: H - top - (mobile ? 60 : 50), W, H };
    if (mobile) return { left: 0, top: 110 + rackH(), width: W, height: Math.max(60, H * 0.18 - 10 - rackH() * 0.5), W, H };
    const pw = $('#panel').offsetWidth;
    return { left: 0, top, width: W - pw, height: H - top - 50, W, H };
  }
  function fitTo(box, animate = true) {
    const v = visibleArea();
    const scale = Math.max(box.w / v.width, box.h / v.height);
    const w = v.W * scale;
    const to = { x: box.x + box.w / 2 - (v.left + v.width / 2) * scale, y: box.y + box.h / 2 - (v.top + v.height / 2) * scale, w };
    if (animate) return animateVB(to);
    setVB(to.x, to.y, to.w);
    return Promise.resolve();
  }
  function focusPoint(px, py, w) {
    const v = visibleArea();
    const scale = w / v.W;
    animateVB({ x: px - (v.left + v.width / 2) * scale, y: py - (v.top + v.height / 2) * scale, w });
  }
  function zoomToRegion(r) {
    fitTo({ x: r.cx - r.rx - 40, y: r.cy - r.ry - 50, w: r.rx * 2 + 80, h: r.ry * 2 + 110 });
  }
  function zoomAt(factor, sx, sy) {
    const { W, H } = svgSize(), vb = state.vb;
    const nw = Math.min(Math.max(vb.w * factor, 220), fitWidth() * 1.25);
    const f = nw / vb.w;
    const px = vb.x + (sx / W) * vb.w, py = vb.y + (sy / H) * vb.h;
    setVB(px - (px - vb.x) * f, py - (py - vb.y) * f, nw);
  }
  function setupPanZoom() {
    const svg = $('#map');
    const pts = new Map();
    let last = null, pinch = null;
    svg.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragMoved = false; last = { x: e.clientX, y: e.clientY };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
      cancelAnimationFrame(anim);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), r = svg.getBoundingClientRect();
        zoomAt(pinch.d / d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        pinch.d = d; dragMoved = true; return;
      }
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (!dragMoved && Math.abs(dx) + Math.abs(dy) > 4) { dragMoved = true; try { svg.setPointerCapture(e.pointerId); } catch {} }
      if (!dragMoved) return;
      svg.classList.add('dragging');
      const k = state.vb.w / svg.clientWidth;
      setVB(state.vb.x - dx * k, state.vb.y - dy * k, state.vb.w);
      last = { x: e.clientX, y: e.clientY };
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      svg.classList.remove('dragging');
      if (pts.size === 1) last = [...pts.values()][0];
    };
    window.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    svg.addEventListener('click', () => { if (!dragMoved && state.active) closePanel(); });
    const center = (f) => { const { W, H } = svgSize(); zoomAt(f, W / 2, H / 2); };
    $('#zoom-in').onclick = () => center(0.7);
    $('#zoom-out').onclick = () => center(1.4);
    $('#zoom-fit').onclick = () => fitTo(state.bounds);
    window.addEventListener('resize', () => {
      if (isPortrait() !== state.portrait) { layout(); drawMap(); fitTo(state.bounds, false); return; }
      setVB(state.vb.x, state.vb.y, state.vb.w);
    });
  }

  /* ---------------- 나침반: 다음 섬 방문하기 ---------------- */
  const islandOrder = () => [...state.regions, ...(state.final ? [state.final] : [])];
  const lastKey = () => 'aimap.last.' + (state.map ? state.map.id : 'main');
  const getLast = () => { try { return localStorage.getItem(lastKey()); } catch { return null; } };
  function markIsland(key) {
    if (!key) return;
    try { localStorage.setItem(lastKey(), key); } catch {}
    updateCompass();
  }
  // 마지막으로 들른 섬의 다음 섬. 들른 적이 없으면 첫 섬.
  function nextIsland() {
    const order = islandOrder();
    if (!order.length) return null;
    const i = order.findIndex((r) => r.key === getLast());
    return i < 0 ? order[0] : order[(i + 1) % order.length];
  }
  const islandName = (r) => (r.final ? '최종 보물섬' : `${r.name} 섬`);
  function updateCompass() {
    const btn = $('#compass');
    if (!btn) return;
    const nx = nextIsland();
    btn.hidden = !nx;
    if (!nx) return;
    btn.querySelector('small').textContent = '→ ' + islandName(nx);
    const vb = state.vb, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    const ang = (Math.atan2(nx.cy - cy, nx.cx - cx) * 180) / Math.PI + 90;
    btn.querySelector('.needle').style.transform = `rotate(${ang.toFixed(1)}deg)`;
  }
  function setupCompass() {
    $('#compass').onclick = () => {
      const nx = nextIsland();
      if (!nx) return;
      if (document.body.classList.contains('panel-open')) closePanel();
      markIsland(nx.key);
      zoomToRegion(nx);
    };
  }

  /* ---------------- 패널 ---------------- */
  function openPanel() {
    $('#panel').classList.add('open');
    $('#panel').setAttribute('aria-hidden', 'false');
    document.body.classList.add('panel-open');
  }
  function closePanel() {
    $('#panel').classList.remove('open');
    $('#panel').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('panel-open');
    state.active = null;
    markActive();
    applyLod();
    history.replaceState(null, '', location.pathname + location.search + (state.mapIdx ? '#m/' + encodeURIComponent(state.map.id) : ''));
  }
  function markActive() {
    document.querySelectorAll('.mark.active').forEach((p) => p.classList.remove('active'));
    if (state.active) document.querySelectorAll(`.mark[data-id="${CSS.escape(state.active)}"]`).forEach((p) => p.classList.add('active'));
  }
  function regionTag(r) {
    const t = $('#panel-region');
    t.innerHTML = `<span class="num" style="--c:${r.color}">${r.idx + 1}</span> ${esc(r.name)} 섬`;
    t.onclick = () => openRegion(r.key);
  }

  function openNode(id, opts = {}) {
    const n = state.byId.get(id);
    if (!n) return;
    state.active = id;
    regionTag(n.region);
    markIsland(n.region.key);
    const mark = n.draft ? 'unknown' : n.mark;
    const firstFind = !n.draft && !state.visited.has(id);
    if (!n.draft) { state.visited.add(id); saveVisited(); }
    const body = $('#panel-body');
    body.innerHTML = '';
    const head = document.createElement('div');
    const badgeText = { clue: '단서 · 꼭 알아야 할 핵심 개념', area: '구역 · 함께 보는 개념 묶음', flag: '표지 · 지나가는 길목', camp: '야영지 · 곁가지로 더 보기', unknown: '미개척 · 아직 안 쓴 노트' }[mark];
    head.innerHTML = (state.fromQuiz ? `<button class="back-quiz" data-quiz="${esc(state.fromQuiz)}">✕ 보물 문제로 돌아가기</button>` : '') +
      `<span class="mark-badge ${mark}">${iconSvg(mark, mark === 'clue')}${badgeText}</span>` +
      `<h2 class="node-title">${esc(n.label)}</h2>` +
      (n.en ? `<p class="node-en">${esc(n.en)}</p>` : '') +
      (n.summary ? `<p class="node-summary">${esc(n.summary)}</p>` : '');
    body.appendChild(head);
    const bq = head.querySelector('[data-quiz]');
    if (bq) bq.onclick = () => openQuiz(bq.dataset.quiz);
    if (mark === 'clue' && firstFind) {
      const tre = state.nodes.filter((x) => x.mark === 'clue' && !x.draft);
      const got = tre.filter((x) => state.visited.has(x.id)).length;
      body.appendChild(Object.assign(document.createElement('div'), {
        className: 'found-banner',
        innerHTML: `🔑 <b>단서를 찾았어요!</b> (${got}/${tre.length}) — 이 개념은 ✕ 보물 문제에 나와요. 아래에서 직접 만져 보며 익혀 두세요.`,
      }));
    }
    if (n.draft) {
      const d = document.createElement('div');
      d.className = 'draft-box';
      d.innerHTML = `<div class="big">?</div>아직 내용을 쓰지 않은 노트예요.<br><code>${esc(n.path)}</code> 에 내용을 채우면<br>지도에 자동으로 나타나요.`;
      body.appendChild(d);
    } else {
      n.widgets.forEach((w) => { const h = document.createElement('div'); body.appendChild(h); mountWidget(h, w, n); });
      body.appendChild(renderMd(n.md, n));
    }
    const src = document.createElement('p');
    src.innerHTML = `<a class="source-link" href="${githubUrl(n.path)}" target="_blank" rel="noopener">깃허브에서 원본 보기 ↗ ${esc(n.path)}</a>`;
    body.appendChild(src);
    body.scrollTop = 0;

    const tour = state.nodes.filter((x) => !x.draft || x === n);
    const i = tour.indexOf(n);
    const nav = $('#panel-nav');
    nav.innerHTML = '';
    nav.append(navBtn(tour[i - 1], true), navBtn(tour[i + 1], false));

    openPanel();
    updateProgress();
    if (firstFind) drawMap(); else markActive();
    markActive();
    if (!opts.noFocus) {
      const { W } = svgSize();
      focusPoint(n.x, n.y, Math.min(Math.max(state.vb.w, W * 0.9), W * 1.1));
    }
    history.replaceState(null, '', '#' + mapPrefix() + 'n/' + encodeURIComponent(id));
  }
  function navBtn(n, isPrev) {
    const b = document.createElement('button');
    if (!n) { b.disabled = true; b.innerHTML = isPrev ? '‹ 처음' : '끝 ›'; return b; }
    const label = `<span><small>${isPrev ? '이전' : '다음'} · ${MARK_NAME[n.mark]}</small>${esc(n.label)}</span>`;
    b.innerHTML = isPrev ? `‹ ${label}` : `${label} ›`;
    b.onclick = () => openNode(n.id);
    return b;
  }

  function openRegion(key) {
    const r = state.regions.find((x) => x.key === key);
    if (!r) return;
    state.active = 'region:' + key;
    markIsland(key);
    regionTag(r);
    const body = $('#panel-body');
    const items = r.nodes.flatMap((n) => [n, ...n.sides]);
    const tre = items.filter((n) => n.mark === 'clue' && !n.draft);
    body.innerHTML = `<h2 class="node-title">${esc(r.name)} 섬</h2>` +
      (r.en ? `<p class="node-en">${esc(r.en)} · CHAPTER ${esc(r.key)}</p>` : '') +
      (r.desc ? `<p class="node-summary">${esc(r.desc)}</p>` : '') +
      (r.draft ? `<div class="draft-box"><div class="big">?</div>아직 지도에 그려지지 않은 섬이에요.<br>노트를 채우면 섬이 떠올라요.</div>` :
        `<p class="hint" style="color:var(--ink-2)">🔑 이 섬의 단서 <b>${tre.filter((n) => state.visited.has(n.id)).length} / ${tre.length}</b> 찾음</p>`) +
      `<div class="h-label">이 섬의 지점</div><ul class="region-list">` +
      items.map((n) => {
        const m = n.draft ? 'unknown' : n.mark;
        return `<li><button data-open="${esc(n.id)}"><span class="step">${iconSvg(m, state.visited.has(n.id))}</span><span>${n.side ? '└ ' : ''}${esc(n.label)}${n.draft ? ' <span class="sub">아직 안 씀</span>' : n.summary ? `<span class="sub">${esc(n.summary)}</span>` : ''}</span>${state.visited.has(n.id) ? '<span class="seen">✓ 둘러봄</span>' : ''}</button></li>`;
      }).join('') + `</ul>` +
      (r.files.length ? `<div class="h-label">실습 예제 · 자료</div><div class="files">` +
        r.files.map((f, i) => f.path && /\.py$/i.test(f.path)
          ? `<button data-file="${i}">🐍 ${esc(f.label)}<span class="run-tag">▶ 바로 실행</span></button>`
          : `<a href="${f.url || githubUrl(f.path)}" target="_blank" rel="noopener">📄 ${esc(f.label)}<span class="run-tag">↗ 열기</span></a>`).join('') + `</div>` : '');
    if (islandQs(r).length) {
      const qb = document.createElement('button');
      qb.className = 'back-quiz';
      qb.textContent = loadQuiz(r.key).solved ? '✕ 이 섬의 보물 (상자를 열었어요)' : `✕ 이 섬의 보물 문제 풀기 (${islandQs(r).length}문제)`;
      qb.onclick = () => openQuiz(r.key);
      body.querySelector('.h-label').before(qb);
    }
    body.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openNode(b.dataset.open)));
    body.querySelectorAll('[data-file]').forEach((b) => (b.onclick = () => openFile(r.files[+b.dataset.file].path)));
    body.scrollTop = 0;
    const first = r.nodes[0];
    const nav = $('#panel-nav');
    nav.innerHTML = '';
    const go = document.createElement('button');
    go.style.gridColumn = '1 / -1';
    go.disabled = !first || first.draft;
    go.innerHTML = first && !first.draft ? `이 섬 탐험 시작하기 › ${esc(first.label)}` : '아직 열 수 있는 노트가 없어요';
    if (first) go.onclick = () => openNode(first.id);
    nav.appendChild(go);
    openPanel();
    markActive();
    zoomToRegion(r);
    history.replaceState(null, '', '#' + mapPrefix() + 'r/' + encodeURIComponent(key));
  }

  async function openFile(path) {
    const r = state.regions.find((x) => x.files.some((f) => f.path === path)) || state.regions[0];
    const f = r.files.find((x) => x.path === path) || { label: path.split('/').pop(), path };
    state.active = 'file:' + path;
    regionTag(r);
    const body = $('#panel-body');
    body.innerHTML = `<span class="mark-badge">🐍 실습 예제</span><h2 class="node-title">${esc(f.label)}</h2><p class="node-en">${esc(path.split('/').pop())}</p>
      <p class="node-summary" style="font-weight:400;font-size:14px">직접 쓴 실습 코드를 여기서 바로 실행할 수 있어요. <code>input()</code>은 입력 창으로 물어봐요. ✎ 고치기로 값을 바꿔서 다시 실행해 보세요.</p>
      <div class="md"><p class="hint">불러오는 중…</p></div>
      <p><a class="source-link" href="${githubUrl(path)}" target="_blank" rel="noopener">깃허브에서 원본 보기 ↗</a></p>`;
    const nav = $('#panel-nav');
    nav.innerHTML = '';
    const back = document.createElement('button');
    back.style.gridColumn = '1 / -1';
    back.innerHTML = `‹ ${esc(r.name)} 섬으로 돌아가기`;
    back.onclick = () => openRegion(r.key);
    nav.appendChild(back);
    openPanel();
    try {
      const res = await fetch(fileUrl(path));
      if (!res.ok) throw new Error(res.status);
      const code = (await res.text()).replace(/\r\n/g, '\n');
      const holder = body.querySelector('.md');
      holder.innerHTML = '';
      const pre = document.createElement('pre'), c = document.createElement('code');
      c.className = 'language-python'; c.textContent = code;
      pre.appendChild(c); holder.appendChild(pre);
      try { hljs.highlightElement(c); } catch {}
      if (window.AIMAP_RUNNER) AIMAP_RUNNER.enhance(pre, { title: '실습 · ' + path.split('/').pop() });
    } catch (e) {
      body.querySelector('.md').innerHTML = `<p class="hint">파일을 불러오지 못했어요 (${esc(e.message)})</p>`;
    }
  }

  /* ---------------- 위쪽 막대 ---------------- */
  function updateProgress() {
    const real = state.nodes.filter((n) => !n.draft);
    const tre = real.filter((n) => n.mark === 'clue');
    $('#progress-count').textContent = real.filter((n) => state.visited.has(n.id)).length;
    $('#progress-total').textContent = '/ ' + real.length;
    $('#treasure-count').textContent = tre.filter((n) => state.visited.has(n.id)).length;
    $('#treasure-total').textContent = '/ ' + tre.length;
    const ql = quizList();
    $('#quiz-state').textContent = ql.length ? `${ql.filter((q) => loadQuiz(q.id).solved).length}/${ql.length}` : '–';
  }
  function buildChips() {
    const nav = $('#region-chips');
    nav.innerHTML = '';
    state.regions.forEach((r) => {
      const b = document.createElement('button');
      b.className = 'chip';
      const tre = r.nodes.flatMap((n) => [n, ...n.sides]).filter((n) => n.mark === 'clue' && !n.draft).length;
      b.innerHTML = `<span class="num" style="--c:${r.color}">${r.idx + 1}</span>${esc(r.name)} <span class="count">${r.draft ? '?' : tre ? '🔑' + tre : ''}</span>`;
      b.onclick = () => openRegion(r.key);
      nav.appendChild(b);
    });
  }
  function setupSearch() {
    const input = $('#search'), list = $('#search-results');
    let results = [], sel = 0;
    const hl = (s, q) => { const i = s.toLowerCase().indexOf(q); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
    const show = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { list.hidden = true; return; }
      results = state.nodes.map((n) => {
        const hay = [n.label, n.en, n.summary, n.region.name].join(' ').toLowerCase();
        const text = n.plain || '';
        const ti = hay.indexOf(q), bi = text.toLowerCase().indexOf(q);
        if (ti < 0 && bi < 0) return null;
        const snip = bi >= 0 ? '…' + text.slice(Math.max(0, bi - 20), bi + q.length + 30) + '…' : n.summary || n.region.name;
        return { n, score: ti >= 0 ? 0 : 1, snip };
      }).filter(Boolean).sort((a, b) => a.score - b.score).slice(0, 8);
      sel = 0;
      list.innerHTML = results.length
        ? results.map((r, i) => `<li data-i="${i}" class="${i === sel ? 'active' : ''}">${r.n.mark === 'clue' ? '🔑 ' : ''}${hl(r.n.label, q)}<small>${esc(r.n.region.name)} 섬 · ${hl(r.snip, q)}</small></li>`).join('')
        : '<li>찾는 개념이 없어요</li>';
      list.hidden = false;
      list.querySelectorAll('[data-i]').forEach((li) => (li.onmousedown = (e) => { e.preventDefault(); pick(+li.dataset.i); }));
    };
    const pick = (i) => { const r = results[i]; if (!r) return; list.hidden = true; input.value = ''; input.blur(); openNode(r.n.id); };
    input.addEventListener('input', show);
    input.addEventListener('focus', show);
    input.addEventListener('blur', () => setTimeout(() => (list.hidden = true), 120));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') pick(sel);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(1, results.length);
        list.querySelectorAll('[data-i]').forEach((li, i) => li.classList.toggle('active', i === sel));
      }
      if (e.key === 'Escape') { input.value = ''; list.hidden = true; input.blur(); }
    });
  }

  const mapPrefix = () => (state.mapIdx ? 'm/' + encodeURIComponent(state.map.id) + '/' : '');
  function hashMapIndex() {
    const m = decodeURIComponent(location.hash.slice(1)).match(/^m\/([^/]+)/);
    const i = m ? state.maps.findIndex((x) => x.id === m[1]) : 0;
    return i < 0 ? 0 : i;
  }
  function routeFromHash() {
    const rest = decodeURIComponent(location.hash.slice(1)).replace(/^m\/[^/]+\/?/, '');
    const i = hashMapIndex();
    if (i !== state.mapIdx) { switchMap(i, { keepHash: true }).then(() => routeRest(rest)); return; }
    routeRest(rest);
  }
  function routeRest(h) {
    if (h.startsWith('n/') && state.byId.has(h.slice(2))) openNode(h.slice(2));
    else if (h.startsWith('r/')) openRegion(h.slice(2));
    else if (h === 'q') openQuiz('final');
    else if (h.startsWith('q/')) openQuiz(h.slice(2));
  }

  /* ---------------- 여러 장의 지도 ---------------- */
  function mapTitle(m) {
    if (!m) return '';
    if (m.title) return m.title;
    if (m === state.map && state.regions.length) return state.regions.map((r) => r.name).join(' × ');
    return m.autoTitle || m.id;
  }
  async function readToc(m) {
    if (!m._toc) {
      const { base, readme } = await pickBase(m);
      m._toc = { base, readme, dir: (m.source || 'README.md').split('/').slice(0, -1).join('/') };
    }
    return m._toc;
  }

  async function loadMap(i) {
    const m = state.maps[i];
    Object.assign(state, { mapIdx: i, map: m, regions: [], nodes: [], byId: new Map(), byPath: new Map(), active: null });
    state.visited = new Set(loadVisited());
    if (!m.placeholder) {
      const toc = await readToc(m);
      state.base = toc.base;
      const regions = parseReadme(toc.readme, toc.dir);
      if (!regions.length) throw new Error((m.source || 'README.md') + '에서 "### 00. 제목" 형식의 목차를 찾지 못했어요.');
      regions.forEach((r, k) => {
        const o = (m.regions || {})[r.key] || {};
        Object.assign(r, { idx: k, shape: o.shape, name: o.name || r.title, en: o.en || r.title.toUpperCase(), desc: o.desc || '', color: o.color || REGION_COLORS[k % REGION_COLORS.length] });
        r.nodes.forEach((n) => { state.nodes.push(n); n.sides.forEach((sd) => state.nodes.push(sd)); });
      });
      state.regions = regions;
      state.nodes.forEach((n) => { state.byId.set(n.id, n); state.byPath.set(n.path, n); });
      m._md = m._md || {};
      await Promise.all(state.nodes.map(async (n) => {
        if (!(n.path in m._md)) {
          try { const res = await fetch(fileUrl(n.path)); m._md[n.path] = res.ok ? await res.text() : ''; } catch { m._md[n.path] = ''; }
        }
        n.md = m._md[n.path];
        n.plain = plainText(n.md);
        n.draft = n.plain.length < (CFG.draftThreshold ?? 40);
      }));
      regions.forEach((r) => { r.draft = r.nodes.length > 0 && r.nodes.every((n) => n.draft && n.sides.every((sd) => sd.draft)); });
      m.autoTitle = regions.map((r) => r.name).join(' × ');
      m.meta = `${regions.filter((r) => !r.draft).length}개 섬 · ${state.nodes.filter((n) => !n.draft).length}개 지점`;
    }
    const title = mapTitle(m);
    $('#site-title').textContent = title;
    document.title = title + ' · 보물지도';
    $('#site-meta').textContent = m.placeholder ? '아직 그려지지 않은 지도' : m.meta;
    layout();
    drawMap();
    buildChips();
    updateProgress();
    buildRack();
  }

  // 아직 펼치지 않은 지도의 제목을 미리 알아 둔다 (선반에 적을 이름)
  async function prefetchTitles() {
    for (const m of state.maps) {
      if (m === state.map || m.placeholder || m.autoTitle || m.title) continue;
      try {
        const toc = await readToc(m);
        const regs = parseReadme(toc.readme, toc.dir);
        m.autoTitle = regs.map((r) => ((m.regions || {})[r.key] || {}).name || r.title).join(' × ');
        m.meta = `${regs.length}개 섬`;
      } catch { m.autoTitle = m.id; }
    }
    buildRack();
  }

  // 화면 맨 위: 모든 지도가 두루마리 끝부분만 보이게 걸려 있다
  function buildRack() {
    const rack = $('#rack');
    rack.innerHTML = '';
    state.maps.forEach((m, i) => {
      const t = mapTitle(m), cur = i === state.mapIdx;
      const b = document.createElement('button');
      b.className = 'tscroll' + (cur ? ' current' : '') + (m.placeholder ? ' blank' : '');
      b.dataset.i = i;
      b.setAttribute('aria-label', cur ? `${t} (지금 펼친 지도)` : `${t} 지도 펼치기`);
      b.innerHTML = `<span class="ts-body"></span><span class="ts-knob"><span class="ts-num">${i + 1}</span></span>` +
        `<span class="ts-tip"><b>${esc(t)}</b><small>${esc(m.placeholder ? '아직 그려지지 않은 지도' : m.meta || '말려 있는 지도')}</small><em>${cur ? '지금 펼친 지도' : '눌러서 펼치기 ›'}</em></span>`;
      if (!cur) b.onclick = () => switchMap(i);
      rack.appendChild(b);
    });
    rack.hidden = false;
  }
  // 지도를 펼치기 전에 목차와 노트를 미리 받아 둔다 (말리는 동안 함께)
  async function prepMap(m) {
    if (m.placeholder) return;
    const toc = await readToc(m);
    m._md = m._md || {};
    const regs = parseReadme(toc.readme, toc.dir);
    await Promise.all(regs.flatMap((r) => r.nodes.flatMap((n) => [n, ...n.sides])).map(async (n) => {
      if (n.path in m._md) return;
      try { const res = await fetch(toc.base + encPath(n.path)); m._md[n.path] = res.ok ? await res.text() : ''; } catch { m._md[n.path] = ''; }
    }));
  }
  let switching = false;
  async function switchMap(i, opts = {}) {
    if (switching || i === state.mapIdx || !state.maps[i]) return;
    switching = true;
    try {
      if (document.body.classList.contains('panel-open')) closePanel();
      const ready = prepMap(state.maps[i]).catch(() => {});
      await roll('up');
      await ready;
      await loadMap(i);
      await fitTo(state.bounds, false);
      await roll('down');
      if (!opts.keepHash) history.replaceState(null, '', location.pathname + location.search + (i ? '#m/' + encodeURIComponent(state.map.id) : ''));
    } catch (e) {
      console.error(e);
      $('#map').getAnimations().forEach((a) => a.cancel());
      $('#map').style.clipPath = '';
    } finally {
      switching = false;
    }
  }

  // 지도를 말거나(up) 펼친다(down): 양피지의 화면 위치를 따라 두루마리 원통이 움직인다
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slotRect = () => {
    const e = document.querySelector(`.tscroll[data-i="${state.mapIdx}"] .ts-body`);
    return e ? e.getBoundingClientRect() : null;
  };
  // 지도를 말거나(up) 펼친다(down).
  // up: 양피지가 오른쪽에서 왼쪽으로 말리고, 말린 두루마리가 위쪽 줄의 제자리로 올라간다.
  // down: 위쪽 줄에서 두루마리가 내려와 왼쪽에서 오른쪽으로 펼쳐진다.
  async function roll(dir) {
    const svg = $('#map'), rl = $('#roll');
    const { W, H } = svgSize(), P = state.paper, vb = state.vb;
    const sx = (x) => Math.min(W, Math.max(0, ((x - vb.x) / vb.w) * W));
    const sy = (y) => Math.min(H, Math.max(0, ((y - vb.y) / vb.h) * H));
    const L = sx(P.x), Rt = sx(P.x + P.w), T = sy(P.y) - 12, h = sy(P.y + P.h) - sy(P.y) + 24;
    const up = dir === 'up', from = up ? Rt : L, to = up ? L : Rt;
    const fast = reduceMotion();
    const clip = (x) => `inset(0px ${Math.max(0, W - x)}px 0px 0px)`;
    const at = (x, w, o = 1) => ({ transform: `translate(${x - w / 2}px, ${T}px)`, width: w + 'px', height: h + 'px', opacity: o });
    const slot = slotRect();
    const inSlot = (o) => slot ? { transform: `translate(${slot.left}px, ${slot.top}px)`, width: slot.width + 'px', height: slot.height + 'px', opacity: o } : { ...at(L, 24), opacity: 0 };
    rl.style.top = '0px';
    rl.hidden = false;
    const go = (kf, ms, easing) => rl.animate(kf, { duration: fast ? 1 : ms, easing, fill: 'forwards' }).finished;
    if (!up) {
      svg.style.clipPath = clip(L);
      await go([inSlot(0.8), at(L, 46)], 240, 'cubic-bezier(.3,.7,.3,1)');
    }
    const opts = { duration: fast ? 1 : 520, easing: up ? 'cubic-bezier(.4,0,.7,.5)' : 'cubic-bezier(.2,.6,.3,1)', fill: 'forwards' };
    const ca = svg.animate([{ clipPath: clip(from) }, { clipPath: clip(to) }], opts);
    const w0 = up ? 24 : 46, w1 = up ? 46 : 24;
    await Promise.all([ca.finished, rl.animate([at(from, w0), at(to, w1)], opts).finished]);
    svg.style.clipPath = up ? clip(L) : '';
    ca.cancel();
    if (up) await go([at(L, w1), inSlot(0.4)], 220, 'cubic-bezier(.6,0,.8,.4)');
    else await go([{ opacity: 1 }, { opacity: 0 }], 140, 'ease-out');
    rl.getAnimations().forEach((x) => x.cancel());
    rl.hidden = true;
  }

  /* ---------------- 시작 ---------------- */
  async function init() {
    state.maps = (CFG.maps && CFG.maps.length ? CFG.maps : [{ id: 'main', source: 'README.md' }]).map((m) => ({ ...m }));
    setupPanZoom();
    setupSearch();
    buildLegend();
    setupCompass();
    $('#panel-close').onclick = closePanel;
    $('#panel-grip').onclick = closePanel;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.active && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) closePanel(); });
    const svg = $('#map');
    svg.style.clipPath = 'inset(0px 100% 0px 0px)';
    await loadMap(hashMapIndex());
    $('#loading').remove();
    await fitTo(state.bounds, false);
    await roll('down');
    routeRest(decodeURIComponent(location.hash.slice(1)).replace(/^m\/[^/]+\/?/, ''));
    window.addEventListener('hashchange', routeFromHash);
    prefetchTitles();
  }

  init().catch((e) => {
    console.error(e);
    const l = $('#loading');
    l.classList.add('error');
    l.innerHTML = `지도를 불러오지 못했어요.<br><small>${esc(e.message)}</small>`;
  });
})();

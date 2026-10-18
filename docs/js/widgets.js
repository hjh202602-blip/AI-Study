/*
 * 시각화 위젯 모음 — 누르고, 값을 입력하면 바로 결과가 바뀐다.
 * ------------------------------------------------------------
 * 새 위젯 추가 방법:
 *   W.이름 = (box, { node }) => { ... box 안에 그리기 ... };
 * 그리고 config.js 의 nodes[파일이름].widgets 에 '이름'을 넣거나,
 * .md 본문에 <!-- widget: 이름 --> 을 적는다.
 */
(() => {
  const W = (window.AIMAP_WIDGETS = window.AIMAP_WIDGETS || {});
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- 도우미 ---------- */
  function s(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  const fmt = (v) => String(Math.round(v * 1000) / 1000);
  const step = (v) => (v > 0 ? 1 : 0);
  function title(box, text) { box.appendChild(h(`<div class="widget-title">${text}</div>`)); }
  function hint(box, text) { const p = h(`<p class="hint">${text}</p>`); box.appendChild(p); return p; }
  function svgBox(box, w, hgt) { return s('svg', { viewBox: `0 0 ${w} ${hgt}` }, box); }

  // 슬라이더 + 숫자 입력칸 (어느 쪽을 바꿔도 같이 바뀐다)
  function slider(box, { label, min, max, step: st = 0.1, value, onInput }) {
    const row = h(`<div class="slider"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${st}" value="${value}"><input class="num-in" type="number" step="${st}" value="${fmt(value)}" aria-label="${label} 값"></div>`);
    const range = row.querySelector('[type=range]'), num = row.querySelector('.num-in');
    range.addEventListener('input', () => { num.value = fmt(+range.value); num.classList.remove('bad'); onInput(+range.value); });
    num.addEventListener('input', () => {
      const v = parseFloat(num.value);
      if (!isFinite(v) || Math.abs(v) > 1000) { num.classList.add('bad'); return; }
      num.classList.remove('bad');
      range.value = v;
      onInput(v);
    });
    box.appendChild(row);
    return { get value() { return +num.value; }, set(v) { range.value = v; num.value = fmt(v); num.classList.remove('bad'); } };
  }
  function buttons(box, items, current, onPick) {
    const row = h('<div class="w-row"></div>');
    const btns = items.map((it) => {
      const b = h(`<button class="w-btn">${it}</button>`);
      b.onclick = () => { setOn(it); onPick(it); };
      row.appendChild(b);
      return b;
    });
    const setOn = (it) => btns.forEach((x, i) => x.classList.toggle('on', items[i] === it));
    setOn(current);
    box.appendChild(row);
    return { row, setOn };
  }
  function toggle(label, value, onChange) {
    const b = h(`<button class="w-toggle" aria-label="${label}">${value}</button>`);
    const set = (v) => { value = v; b.textContent = v; b.classList.toggle('on', v === 1); };
    b.onclick = () => { set(value ? 0 : 1); onChange(value); };
    set(value);
    return { el: b, set, get value() { return value; } };
  }
  const lab = (t) => h(`<span class="w-lab">${t}</span>`);
  const INPUTS = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const TRUTH = {
    AND: (a, b) => a & b, OR: (a, b) => a | b, NAND: (a, b) => 1 - (a & b),
    NOR: (a, b) => 1 - (a | b), XOR: (a, b) => a ^ b, XNOR: (a, b) => 1 - (a ^ b), NOT: (a) => 1 - a,
  };
  // 출력 4개가 어떤 게이트와 같은지
  function whichGate(outs) {
    const names = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'];
    const hit = names.find((g) => INPUTS.every(([a, b], i) => TRUTH[g](a, b) === outs[i]));
    if (hit) return hit;
    if (outs.every((v) => v === 0)) return '항상 0';
    if (outs.every((v) => v === 1)) return '항상 1';
    return null;
  }

  function pulse(svg, d, delay = 0) {
    const c = s('circle', { r: 5, class: 'w-signal', opacity: 0 }, svg);
    const m = s('animateMotion', { dur: '0.55s', path: d, fill: 'freeze', begin: 'indefinite' }, c);
    setTimeout(() => { c.setAttribute('opacity', 1); try { m.beginElement(); } catch {} }, delay);
    setTimeout(() => c.remove(), delay + 650);
  }

  // 좌표평면 (-0.5 ~ 1.5)
  function plane(svg, size = 280, pad = 26) {
    const lo = -0.5, hi = 1.5, span = size - pad * 2;
    const X = (v) => pad + ((v - lo) / (hi - lo)) * span;
    const Y = (v) => size - pad - ((v - lo) / (hi - lo)) * span;
    const g = s('g', {}, svg);
    for (let v = -0.5; v <= 1.5001; v += 0.5) {
      s('line', { class: 'w-grid', x1: X(v), x2: X(v), y1: Y(lo), y2: Y(hi) }, g);
      s('line', { class: 'w-grid', y1: Y(v), y2: Y(v), x1: X(lo), x2: X(hi) }, g);
    }
    s('line', { class: 'w-axis', x1: X(lo), x2: X(hi), y1: Y(0), y2: Y(0) }, g);
    s('line', { class: 'w-axis', x1: X(0), x2: X(0), y1: Y(lo), y2: Y(hi) }, g);
    s('text', { class: 'w-text muted', x: X(hi) - 4, y: Y(0) - 6, 'text-anchor': 'end' }, g).textContent = 'x₁';
    s('text', { class: 'w-text muted', x: X(0) + 6, y: Y(hi) + 12 }, g).textContent = 'x₂';
    s('text', { class: 'w-text muted', x: X(1), y: Y(0) + 16, 'text-anchor': 'middle' }, g).textContent = '1';
    s('text', { class: 'w-text muted', x: X(0) - 8, y: Y(1) + 4, 'text-anchor': 'end' }, g).textContent = '1';
    const corners = [[lo, lo], [hi, lo], [hi, hi], [lo, hi]];
    function cut(f) {
      const out = [], line = [];
      for (let i = 0; i < 4; i++) {
        const P = corners[i], Q = corners[(i + 1) % 4], fp = f(...P), fq = f(...Q);
        if (fp > 0) out.push(P);
        if ((fp > 0) !== (fq > 0) && fp !== fq) {
          const t = fp / (fp - fq), pt = [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];
          out.push(pt); line.push(pt);
        }
      }
      return { out, line };
    }
    const region = (f) => cut(f).out.map(([a, b]) => `${X(a).toFixed(1)},${Y(b).toFixed(1)}`).join(' ');
    const line = (f) => { const l = cut(f).line; return l.length >= 2 ? l.slice(0, 2) : null; };
    return { X, Y, region, line };
  }
  function marker(g, P, x, y, target, ok) {
    const cx = P.X(x), cy = P.Y(y), col = ok == null ? 'var(--ink)' : ok ? 'var(--good)' : 'var(--bad)';
    if (target) s('circle', { cx, cy, r: 9, fill: 'var(--paper)', stroke: col, 'stroke-width': 3.5 }, g);
    else s('path', { d: `M${cx - 8},${cy - 8} L${cx + 8},${cy + 8} M${cx + 8},${cy - 8} L${cx - 8},${cy + 8}`, stroke: col, 'stroke-width': 3.5, 'stroke-linecap': 'round' }, g);
  }

  /* ---------- 00 파이썬: 그래프 그리기 ---------- */
  W.sinPlot = (box) => {
    title(box, '직접 그려 보기 · np.arange 와 plt.plot');
    const PRE = { 'sin(x)': 'sin(x)', 'cos(x)': 'cos(x)', 'sin(x)*x/10': 'sin(x)*x/10', 'x/10 - 1': 'x/10 - 1' };
    let expr = 'sin(x)', end = 20, st = 0.1;
    const svg = svgBox(box, 440, 200);
    const fr = h('<div class="w-row"><span class="w-lab">y =</span><input class="text-in" spellcheck="false" aria-label="그릴 식"></div>');
    const exprIn = fr.querySelector('input');
    exprIn.value = expr;
    box.appendChild(fr);
    const pre = buttons(box, Object.keys(PRE), expr, (k) => { expr = PRE[k]; exprIn.value = expr; draw(); });
    exprIn.addEventListener('input', () => { expr = exprIn.value; pre.setOn(null); draw(); });
    slider(box, { label: '끝', min: 1, max: 30, step: 1, value: end, onInput: (v) => { end = v; draw(); } });
    slider(box, { label: '간격', min: 0.05, max: 2, step: 0.05, value: st, onInput: (v) => { st = v; draw(); } });
    const code = h('<div class="code-pane"></div>');
    const peek = h('<div class="calc"></div>');
    box.append(code, peek);
    const info = hint(box, '');
    const M = Object.getOwnPropertyNames(Math).reduce((o, k) => ((o[k] = Math[k]), o), {});
    const ALLOWED = new Set(['x', 'sin', 'cos', 'tan', 'exp', 'sqrt', 'log', 'abs', 'pow', 'min', 'max', 'floor', 'ceil', 'round', 'pi', 'e', 'PI', 'E']);
    function compile(src) {
      const msg = 'x와 숫자, + - * / ** ( ) 와 sin, cos, tan, exp, sqrt, log, abs, pi 만 쓸 수 있어요';
      if (src.length > 120 || !/^[\sx0-9+\-*/().,^a-z_]*$/i.test(src)) throw new Error(msg);
      const names = (src.replace(/np\./g, '').match(/[a-z_][a-z0-9_]*/gi) || []);
      if (names.some((n) => !ALLOWED.has(n))) throw new Error(msg);
      const js = src.replace(/\^/g, '**').replace(/np\./g, '').replace(/\bpi\b/g, 'PI').replace(/\be\b/g, 'E');
      // eslint-disable-next-line no-new-func
      const f = new Function('M', 'x', `with (M) { return (${js}); }`);
      f(M, 1);
      return (x) => f(M, x);
    }
    function draw() {
      let f;
      try { f = compile(expr || '0'); exprIn.classList.remove('bad'); }
      catch (e) { exprIn.classList.add('bad'); info.innerHTML = `<span class="ng">식을 읽지 못했어요.</span> ${e.message.includes('x와') ? e.message : '예: sin(x) * 2, x**2 / 100'}`; return; }
      if (!isFinite(f(1)) && !isNaN(f(1))) { exprIn.classList.add('bad'); return; }
      svg.innerHTML = '';
      const xs = [];
      for (let x = 0; x < end - 1e-9 && xs.length < 2000; x += st) xs.push(+x.toFixed(4));
      const ys = xs.map((x) => f(x)).map((y) => (isFinite(y) ? y : NaN));
      const finite = ys.filter((y) => !isNaN(y));
      const ymax = Math.max(1, ...finite.map(Math.abs));
      const X = (x) => 30 + (x / Math.max(end, 1)) * 395, Y = (y) => 100 - (y / ymax) * 80;
      s('line', { class: 'w-axis', x1: 30, x2: 430, y1: 100, y2: 100 }, svg);
      s('line', { class: 'w-axis', x1: 30, x2: 30, y1: 15, y2: 185 }, svg);
      [ymax, -ymax].forEach((v) => s('text', { class: 'w-text muted', x: 24, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = fmt(v));
      [0, end / 2, end].forEach((t) => s('text', { class: 'w-text muted', x: X(t), y: 118, 'text-anchor': 'middle' }, svg).textContent = fmt(t));
      s('polyline', { points: xs.map((x, i) => (isNaN(ys[i]) ? '' : `${X(x)},${Y(ys[i])}`)).filter(Boolean).join(' '), fill: 'none', stroke: 'var(--red)', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, svg);
      if (xs.length <= 80) xs.forEach((x, i) => !isNaN(ys[i]) && s('circle', { cx: X(x), cy: Y(ys[i]), r: 2.6, fill: 'var(--ink)' }, svg));
      const pyExpr = expr.replace(/\b(sin|cos|tan|exp|sqrt|log|abs)\(/g, 'np.$1(');
      code.innerHTML = `import numpy as np\nimport matplotlib.pyplot as plt\n\nx = np.arange(0, <span class="n">${fmt(end)}</span>, <span class="n">${fmt(st)}</span>)\ny = <span class="n">${pyExpr.replace(/</g, '&lt;')}</span>\nplt.plot(x, y)\nplt.show()`;
      const show = (arr) => '[' + arr.slice(0, 5).map((v) => fmt(v)).join(', ') + (arr.length > 5 ? ', …' : '') + ']';
      peek.innerHTML = `x = ${show(xs)}<br>y = <span class="v">${show(ys)}</span>`;
      info.innerHTML = `x 배열에 점이 <b>${xs.length}개</b> 들어 있어요. 간격을 키우면 점이 줄어서 그래프가 각져 보여요 — plot은 점과 점을 직선으로 이어 그릴 뿐이거든요. 식 칸에 직접 써 보세요.`;
    }
    draw();
  };

  /* ---------- 01-1 퍼셉트론 ---------- */
  W.perceptron = (box) => {
    title(box, '직접 만져 보기 · 퍼셉트론 한 개');
    const svg = svgBox(box, 440, 200);
    const p = { x1: 1, x2: 0, w1: 0.5, w2: 0.5, th: 0.7 };
    const row = h('<div class="w-row" style="justify-content:center"></div>');
    const t1 = toggle('x1', p.x1, (v) => { p.x1 = v; draw(true); });
    const t2 = toggle('x2', p.x2, (v) => { p.x2 = v; draw(true); });
    row.append(lab('입력 x₁'), t1.el, h('<span style="width:10px"></span>'), lab('x₂'), t2.el);
    box.appendChild(row);
    slider(box, { label: 'w₁', min: -1, max: 1.5, value: p.w1, onInput: (v) => { p.w1 = v; draw(); } });
    slider(box, { label: 'w₂', min: -1, max: 1.5, value: p.w2, onInput: (v) => { p.w2 = v; draw(); } });
    slider(box, { label: 'θ', min: -1, max: 2, value: p.th, onInput: (v) => { p.th = v; draw(); } });
    const calc = h('<div class="calc"></div>');
    const table = h('<table class="w-table"></table>');
    const verdict = h('<div class="verdict"></div>');
    box.append(calc, table, verdict);
    hint(box, '입력 버튼이나 그림 속 원을 눌러 보고, 가중치·임계값을 움직이거나 숫자를 직접 입력해 보세요. 표의 줄을 누르면 그 입력으로 바뀌어요.');
    const E1 = 'M74,55 L196,92', E2 = 'M74,145 L196,108', E3 = 'M264,100 L346,100';
    const out = (a, b) => (a * p.w1 + b * p.w2 > p.th ? 1 : 0);
    function setInputs(a, b) { p.x1 = a; p.x2 = b; t1.set(a); t2.set(b); draw(true); }
    function draw(anim) {
      svg.innerHTML = '';
      const sum = p.x1 * p.w1 + p.x2 * p.w2, y = sum > p.th ? 1 : 0;
      const edge = (d, w, on) => s('path', { d, class: 'w-edge' + (w < 0 ? ' neg' : '') + (on ? ' on' : ''), 'stroke-width': 1.5 + Math.min(Math.abs(w), 2) * 6 }, svg);
      edge(E1, p.w1, p.x1); edge(E2, p.w2, p.x2);
      s('path', { d: E3, class: 'w-edge' + (y ? ' on' : ''), 'stroke-width': 4 }, svg);
      s('text', { class: 'w-text', x: 128, y: 58 }, svg).textContent = `w₁=${fmt(p.w1)}`;
      s('text', { class: 'w-text', x: 128, y: 152 }, svg).textContent = `w₂=${fmt(p.w2)}`;
      [[50, 55, 'x1', 'x₁'], [50, 145, 'x2', 'x₂']].forEach(([cx, cy, k, l]) => {
        const c = s('circle', { class: 'w-node click' + (p[k] ? ' on' : ''), cx, cy, r: 24 }, svg);
        c.addEventListener('click', () => (k === 'x1' ? setInputs(1 - p.x1, p.x2) : setInputs(p.x1, 1 - p.x2)));
        s('text', { class: 'w-text big', x: cx, y: cy + 5, 'text-anchor': 'middle', 'pointer-events': 'none' }, svg).textContent = p[k];
        s('text', { class: 'w-text muted', x: cx, y: cy - 30, 'text-anchor': 'middle' }, svg).textContent = l;
      });
      s('circle', { class: 'w-node' + (y ? ' on' : ''), cx: 230, cy: 100, r: 36 }, svg);
      s('text', { class: 'w-text muted', x: 230, y: 92, 'text-anchor': 'middle' }, svg).textContent = 'Σ';
      s('text', { class: 'w-text big', x: 230, y: 112, 'text-anchor': 'middle' }, svg).textContent = fmt(sum);
      s('text', { class: 'w-text muted', x: 230, y: 156, 'text-anchor': 'middle' }, svg).textContent = `θ = ${fmt(p.th)}`;
      s('circle', { class: 'w-node' + (y ? ' on' : ''), cx: 372, cy: 100, r: 26 }, svg);
      s('text', { class: 'w-text big', x: 372, y: 106, 'text-anchor': 'middle', 'font-size': 18 }, svg).textContent = y;
      s('text', { class: 'w-text muted', x: 372, y: 64, 'text-anchor': 'middle' }, svg).textContent = '출력 y';
      if (anim) { if (p.x1) pulse(svg, E1); if (p.x2) pulse(svg, E2); if (y) pulse(svg, E3, 520); }
      calc.innerHTML = `${fmt(p.w1)}×<span class="v">${p.x1}</span> + ${fmt(p.w2)}×<span class="v">${p.x2}</span> = <b>${fmt(sum)}</b> ${sum > p.th ? '&gt;' : '≤'} θ(${fmt(p.th)}) → y = <b class="${y ? 'ok' : 'ng'}">${y}</b>`;
      const outs = INPUTS.map(([a, b]) => out(a, b));
      table.innerHTML = '<tr><th>x₁</th><th>x₂</th><th>w₁x₁ + w₂x₂</th><th>y</th></tr>' + INPUTS.map(([a, b], i) =>
        `<tr class="click ${a === p.x1 && b === p.x2 ? 'hl' : ''}" data-a="${a}" data-b="${b}"><td>${a}</td><td>${b}</td><td>${fmt(a * p.w1 + b * p.w2)}</td><td><b>${outs[i]}</b></td></tr>`).join('');
      table.querySelectorAll('tr.click').forEach((tr) => (tr.onclick = () => setInputs(+tr.dataset.a, +tr.dataset.b)));
      const g = whichGate(outs);
      verdict.className = 'verdict ' + (g && !g.startsWith('항상') ? 'ok' : 'ng');
      verdict.innerHTML = g && !g.startsWith('항상') ? `지금 설정은 <b>${g} 게이트</b>와 똑같이 동작해요.` : g ? `지금 설정은 입력과 상관없이 <b>${g}</b>이에요.` : '지금 설정은 이름 있는 게이트가 아니에요.';
    }
    draw();
  };

  /* ---------- 01-2 게이트를 퍼셉트론으로 ---------- */
  W.gateFit = (box) => {
    title(box, '퀴즈 · 가중치와 임계값으로 게이트 만들기');
    const PRESET = { AND: [0.2, 0.3, 0.4], OR: [0.3, 0.3, 0.2], NAND: [-0.2, -0.3, -0.4], XOR: [0.5, 0.5, 0.2] };
    let target = 'AND';
    const p = { w1: 0.5, w2: 0.5, th: 0.2 };
    buttons(box, Object.keys(PRESET), target, (v) => { target = v; draw(); });
    const s1 = slider(box, { label: 'w₁', min: -1, max: 1, value: p.w1, onInput: (v) => { p.w1 = v; draw(); } });
    const s2 = slider(box, { label: 'w₂', min: -1, max: 1, value: p.w2, onInput: (v) => { p.w2 = v; draw(); } });
    const s3 = slider(box, { label: 'θ', min: -1, max: 1, value: p.th, onInput: (v) => { p.th = v; draw(); } });
    const table = h('<table class="w-table"></table>');
    const verdict = h('<div class="verdict"></div>');
    const row = h('<div class="w-row" style="margin-top:10px"></div>');
    const preset = h('<button class="w-btn">노트에 적은 값 넣어 보기</button>');
    const rnd = h('<button class="w-btn">🎲 무작위 탐색</button>');
    row.append(preset, rnd);
    preset.onclick = () => { const [a, b, c] = PRESET[target]; set(a, b, c); };
    rnd.onclick = () => {
      for (let k = 0; k < 5000; k++) {
        const a = Math.round((Math.random() * 2 - 1) * 10) / 10, b = Math.round((Math.random() * 2 - 1) * 10) / 10, c = Math.round((Math.random() * 2 - 1) * 10) / 10;
        if (INPUTS.every(([x, y]) => (a * x + b * y > c ? 1 : 0) === TRUTH[target](x, y))) { set(a, b, c); return; }
      }
      verdict.className = 'verdict ng';
      verdict.innerHTML = `5,000번 찾아봤지만 <b>${target}</b>를 만드는 값이 없어요. 단층 퍼셉트론으로는 불가능하다는 뜻이에요.`;
    };
    function set(a, b, c) { Object.assign(p, { w1: a, w2: b, th: c }); s1.set(a); s2.set(b); s3.set(c); draw(); }
    box.append(table, verdict, row);
    function draw() {
      let right = 0;
      table.innerHTML = '<tr><th>x₁</th><th>x₂</th><th>w₁x₁+w₂x₂</th><th>y</th><th>' + target + '</th><th></th></tr>' +
        INPUTS.map(([a, b]) => {
          const sum = p.w1 * a + p.w2 * b, y = sum > p.th ? 1 : 0, t = TRUTH[target](a, b), ok = y === t;
          right += ok;
          return `<tr><td>${a}</td><td>${b}</td><td>${fmt(sum)} ${sum > p.th ? '&gt;' : '≤'} ${fmt(p.th)}</td><td><b>${y}</b></td><td>${t}</td><td class="${ok ? 'ok' : 'ng'}">${ok ? '✓' : '✗'}</td></tr>`;
        }).join('');
      verdict.className = 'verdict ' + (right === 4 ? 'ok' : 'ng');
      verdict.innerHTML = right === 4
        ? `<b>${target} 게이트 완성!</b> 같은 퍼셉트론인데 매개변수만 바꿨어요.`
        : target === 'XOR'
          ? `${right}/4 맞음 — XOR은 아무리 바꿔도 4개를 다 맞출 수 없어요. 이게 다음에 나올 <b>XOR 문제</b>예요.`
          : `${right}/4 맞음 — 슬라이더를 움직이거나 숫자를 입력해서 4줄을 모두 ✓로 만들어 보세요.`;
    }
    draw();
  };

  /* ---------- 01-2+ 논리 게이트 보드 ---------- */
  W.gateBoard = (box) => {
    title(box, '눌러 보기 · 논리 게이트');
    let gate = 'AND', A = 1, B = 0;
    buttons(box, ['NOT', 'AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR'], gate, (v) => { gate = v; draw(); });
    const svg = svgBox(box, 380, 160);
    const row = h('<div class="w-row" style="justify-content:center"></div>');
    const ta = toggle('A', A, (v) => { A = v; draw(); });
    const tb = toggle('B', B, (v) => { B = v; draw(); });
    const labB = lab('B');
    row.append(lab('A'), ta.el, labB, tb.el);
    box.appendChild(row);
    const table = h('<table class="w-table"></table>');
    box.appendChild(table);
    hint(box, '진리표의 줄을 누르거나, 그림 왼쪽의 입력 숫자를 눌러도 바뀌어요.');
    const BODY = {
      AND: 'M120,40 H165 A40,40 0 0 1 165,120 H120 Z',
      OR: 'M112,40 Q150,40 178,56 Q206,70 222,80 Q206,90 178,104 Q150,120 112,120 Q134,80 112,40 Z',
      NOT: 'M125,45 L200,80 L125,115 Z',
    };
    const setAB = (a, b) => { A = a; B = b; ta.set(a); tb.set(b); draw(); };
    function draw() {
      svg.innerHTML = '';
      const kind = gate === 'NOT' ? 'NOT' : /AND/.test(gate) ? 'AND' : 'OR';
      const xor = /XOR|XNOR/.test(gate);
      const bubble = gate === 'NOT' || /^N|XNOR/.test(gate);
      const out = gate === 'NOT' ? TRUTH.NOT(A) : TRUTH[gate](A, B);
      const wire = (d, on) => s('path', { d, class: 'w-edge' + (on ? ' on' : ''), 'stroke-width': 4 }, svg);
      if (kind === 'NOT') wire('M30,80 H130', A);
      else { wire('M30,55 H135', A); wire('M30,105 H135', B); }
      const endX = kind === 'AND' ? 205 : kind === 'OR' ? 222 : 200;
      wire(`M${bubble ? endX + 14 : endX},80 H350`, out);
      s('path', { d: BODY[kind], class: 'w-gate' }, svg);
      if (xor) s('path', { d: 'M100,40 Q122,80 100,120', fill: 'none', stroke: 'var(--ink)', 'stroke-width': 3 }, svg);
      if (bubble) s('circle', { cx: endX + 7, cy: 80, r: 7, class: 'w-gate' }, svg);
      s('text', { class: 'w-text', x: kind === 'NOT' ? 150 : 158, y: 85, 'text-anchor': 'middle' }, svg).textContent = gate;
      const inp = (y, v, on) => {
        s('circle', { class: 'w-node click' + (v ? ' on' : ''), cx: 18, cy: y - 5, r: 13 }, svg).addEventListener('click', on);
        s('text', { class: 'w-text big', x: 18, y, 'text-anchor': 'middle', 'pointer-events': 'none' }, svg).textContent = v;
      };
      if (kind === 'NOT') inp(85, A, () => setAB(1 - A, B));
      else { inp(60, A, () => setAB(1 - A, B)); inp(110, B, () => setAB(A, 1 - B)); }
      s('circle', { class: 'w-node' + (out ? ' on' : ''), cx: 360, cy: 80, r: 16 }, svg);
      s('text', { class: 'w-text big', x: 360, y: 85, 'text-anchor': 'middle' }, svg).textContent = out;
      tb.el.style.display = labB.style.display = kind === 'NOT' ? 'none' : '';
      const rows = gate === 'NOT' ? [[0, 0], [1, 0]] : INPUTS;
      table.innerHTML = `<tr><th>A</th>${gate === 'NOT' ? '' : '<th>B</th>'}<th>출력</th></tr>` +
        rows.map(([a, b]) => {
          const o = gate === 'NOT' ? TRUTH.NOT(a) : TRUTH[gate](a, b);
          const cur = a === A && (gate === 'NOT' || b === B);
          return `<tr class="click ${cur ? 'hl' : ''}" data-a="${a}" data-b="${b}"><td>${a}</td>${gate === 'NOT' ? '' : `<td>${b}</td>`}<td><b>${o}</b></td></tr>`;
        }).join('');
      table.querySelectorAll('tr.click').forEach((tr) => (tr.onclick = () => setAB(+tr.dataset.a, gate === 'NOT' ? B : +tr.dataset.b)));
    }
    draw();
  };

  /* ---------- 01-3 numpy 한 줄씩 ---------- */
  W.numpyStep = (box) => {
    title(box, '한 줄씩 실행해 보기 · numpy로 만든 게이트');
    const G = { AND: [0.2, 0.3, -0.4], NAND: [-0.2, -0.3, 0.4], OR: [0.3, 0.3, -0.2] };
    let gate = 'AND', x1 = 1, x2 = 1, i = 0, timer = null;
    const p = { w1: 0.2, w2: 0.3, b: -0.4 };
    const sl = [];
    const pre = buttons(box, Object.keys(G), gate, (v) => { gate = v; [p.w1, p.w2, p.b] = G[v]; sl[0].set(p.w1); sl[1].set(p.w2); sl[2].set(p.b); i = 0; draw(); });
    const custom = () => { gate = 'MY_GATE'; pre.setOn(null); i = 0; draw(); };
    sl.push(slider(box, { label: 'w₁', min: -1, max: 1, step: 0.1, value: p.w1, onInput: (v) => { p.w1 = v; custom(); } }));
    sl.push(slider(box, { label: 'w₂', min: -1, max: 1, step: 0.1, value: p.w2, onInput: (v) => { p.w2 = v; custom(); } }));
    sl.push(slider(box, { label: 'b', min: -1, max: 1, step: 0.1, value: p.b, onInput: (v) => { p.b = v; custom(); } }));
    const row = h('<div class="w-row"></div>');
    const t1 = toggle('x1', x1, (v) => { x1 = v; i = 0; draw(); });
    const t2 = toggle('x2', x2, (v) => { x2 = v; i = 0; draw(); });
    const next = h('<button class="w-btn on" style="margin-left:auto">다음 줄 ▶</button>');
    const play = h('<button class="w-btn">자동 재생</button>');
    row.append(lab('x1'), t1.el, lab('x2'), t2.el, next, play);
    box.appendChild(row);
    const pane = h('<div class="code-pane"></div>');
    const calc = h('<div class="calc"></div>');
    box.append(pane, calc);
    const out = hint(box, '');
    next.onclick = () => { i = (i + 1) % steps().length; draw(); };
    play.onclick = () => {
      if (timer) { clearInterval(timer); timer = null; play.textContent = '자동 재생'; return; }
      i = 0; draw(); play.textContent = '멈춤';
      timer = setInterval(() => {
        if (!box.isConnected) return clearInterval(timer);
        i++;
        if (i >= steps().length) { clearInterval(timer); timer = null; play.textContent = '자동 재생'; i = steps().length - 1; }
        draw();
      }, 900);
    };
    function steps() {
      const xw = [x1 * p.w1, x2 * p.w2], sm = xw[0] + xw[1], tmp = sm + p.b, y = tmp <= 0 ? 0 : 1;
      return [
        [1, `x = [${x1}, ${x2}]`, '입력 두 개를 넘파이 배열로 묶어요.'],
        [2, `w = [${fmt(p.w1)}, ${fmt(p.w2)}]`, '가중치도 배열로.'],
        [3, `b = ${fmt(p.b)}`, '임계값 θ 대신 편향 b = −θ 를 써요.'],
        [4, `x*w = [${fmt(xw[0])}, ${fmt(xw[1])}]`, '같은 자리끼리 곱해요 (원소별 곱).'],
        [4, `np.sum(x*w) = ${fmt(sm)}`, '모든 원소를 더해요.'],
        [4, `tmp = ${fmt(sm)} + (${fmt(p.b)}) = ${fmt(tmp)}`, '편향을 더하면 "0보다 크냐"만 보면 돼요.'],
        [5, `${fmt(tmp)} <= 0 → ${tmp <= 0 ? 'True' : 'False'}`, '0 이하면 0, 크면 1.'],
        [y ? 8 : 6, `return ${y}`, `${gate}(${x1}, ${x2}) = ${y}`],
      ];
    }
    function draw() {
      const code = [
        `def ${gate}(x1, x2):`,
        `  x = np.array([x1, x2])`,
        `  w = np.array([<span class="n">${fmt(p.w1)}</span>, <span class="n">${fmt(p.w2)}</span>])`,
        `  b = <span class="n">${fmt(p.b)}</span>`,
        `  tmp = np.sum(x*w) + b`,
        `  if tmp <= 0:`,
        `    return 0`,
        `  else:`,
        `    return 1`,
      ];
      const st = steps(), [line, val, say] = st[Math.min(i, st.length - 1)];
      pane.innerHTML = code.map((c, k) => (k === line ? `<span class="step-on" style="display:inline-block;min-width:100%">${c}</span>` : `<span style="opacity:${k <= line ? 0.9 : 0.4}">${c}</span>`)).join('\n');
      calc.innerHTML = `<span class="v">${val}</span>`;
      out.innerHTML = `<b>${i + 1}/${st.length}</b> · ${say}`;
    }
    draw();
  };

  /* ---------- 01-4 직선 하나로 나누기 ---------- */
  W.boundary = (box) => {
    title(box, '직선 하나로 ○ 와 ✕ 를 나눌 수 있을까?');
    const P0 = { AND: [0.2, 0.3, -0.4], OR: [0.3, 0.3, -0.2], NAND: [-0.2, -0.3, 0.4], XOR: [0.3, 0.3, -0.2] };
    let target = 'AND';
    let custom = null; // 직접 만든 목표값 [y00, y10, y01, y11]
    const p = { w1: 0.2, w2: 0.3, b: -0.4 };
    const sl = [];
    const goal = (a, c) => (custom ? custom[INPUTS.findIndex(([x, y]) => x === a && y === c)] : TRUTH[target](a, c));
    buttons(box, [...Object.keys(P0), '직접 만들기'], target, (v) => {
      if (v === '직접 만들기') { custom = INPUTS.map(([a, c]) => (TRUTH[target] || TRUTH.AND)(a, c)); target = '내 문제'; }
      else {
        custom = null; target = v; const [a, c, d] = P0[v]; Object.assign(p, { w1: a, w2: c, b: d });
        sl[0].set(a); sl[1].set(c); sl[2].set(d);
      }
      tries.textContent = ''; draw();
    });
    const svg = svgBox(box, 280, 280);
    svg.style.maxWidth = '340px'; svg.style.margin = '0 auto';
    sl.push(slider(box, { label: 'w₁', min: -1, max: 1, step: 0.05, value: p.w1, onInput: (v) => { p.w1 = v; draw(); } }));
    sl.push(slider(box, { label: 'w₂', min: -1, max: 1, step: 0.05, value: p.w2, onInput: (v) => { p.w2 = v; draw(); } }));
    sl.push(slider(box, { label: 'b', min: -1.5, max: 1.5, step: 0.05, value: p.b, onInput: (v) => { p.b = v; draw(); } }));
    const calc = h('<div class="calc"></div>');
    const verdict = h('<div class="verdict"></div>');
    const rnd = h('<button class="w-btn" style="margin-top:10px">🎲 무작위 직선 10,000개</button>');
    const tries = h('<p class="hint"></p>');
    rnd.onclick = () => {
      let best = 0, hits = 0, bestP = null;
      for (let k = 0; k < 10000; k++) {
        const w1 = Math.random() * 2 - 1, w2 = Math.random() * 2 - 1, b = Math.random() * 3 - 1.5;
        const c = INPUTS.filter(([a, d]) => step(w1 * a + w2 * d + b) === goal(a, d)).length;
        if (c === 4) { hits++; if (!bestP) bestP = [w1, w2, b]; }
        best = Math.max(best, c);
      }
      tries.innerHTML = `10,000개 직선 중 4점을 모두 맞게 나눈 직선: <b>${hits.toLocaleString()}개</b> (가장 잘한 직선: ${best}/4)` +
        (hits === 0 ? ' — 직선 하나로는 불가능하다는 뜻이에요.' : ' — 그중 하나를 그려 볼게요.');
      if (bestP) { const [a, c, d] = bestP.map((v) => Math.round(v * 100) / 100); Object.assign(p, { w1: a, w2: c, b: d }); sl[0].set(a); sl[1].set(c); sl[2].set(d); draw(); }
    };
    box.append(calc, verdict, rnd, tries);
    hint(box, '‘직접 만들기’를 누른 뒤 그래프의 점을 누르면 ○(1) ↔ ✕(0) 가 바뀌어요. 나만의 문제를 만들어 직선 하나로 나눠지는지 확인해 보세요.');
    const P = plane(svg);
    const shade = s('polygon', { class: 'w-shade' }, svg);
    const ln = s('line', { stroke: 'var(--red)', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
    const marks = s('g', {}, svg);
    s('text', { class: 'w-text muted', x: 262, y: 22, 'text-anchor': 'end' }, svg).textContent = '색칠된 쪽 = 1';
    function draw() {
      const f = (a, c) => p.w1 * a + p.w2 * c + p.b;
      shade.setAttribute('points', P.region(f));
      const L = P.line(f);
      if (L) { ln.setAttribute('x1', P.X(L[0][0])); ln.setAttribute('y1', P.Y(L[0][1])); ln.setAttribute('x2', P.X(L[1][0])); ln.setAttribute('y2', P.Y(L[1][1])); ln.style.display = ''; }
      else ln.style.display = 'none';
      marks.innerHTML = '';
      let right = 0;
      INPUTS.forEach(([a, c], i) => {
        const t = goal(a, c), ok = step(f(a, c)) === t; right += ok;
        marker(marks, P, a, c, t, ok);
        const hit = s('circle', { cx: P.X(a), cy: P.Y(c), r: 16, fill: 'transparent', style: custom ? 'cursor:pointer' : '' }, marks);
        hit.addEventListener('click', () => { if (!custom) return; custom[i] = 1 - custom[i]; tries.textContent = ''; draw(); });
      });
      calc.innerHTML = p.w2 !== 0
        ? `직선: x₂ = (${fmt(-p.w1 / p.w2)})·x₁ + (${fmt(-p.b / p.w2)})`
        : `직선: ${fmt(p.w1)}·x₁ + ${fmt(p.b)} = 0 (세로선)`;
      const isXorLike = custom && ['XOR', 'XNOR'].includes(whichGate(custom));
      verdict.className = 'verdict ' + (right === 4 ? 'ok' : 'ng');
      verdict.innerHTML = right === 4
        ? `<b>${target}: 직선 하나로 나눠졌어요!</b> ○(1)는 색칠된 쪽, ✕(0)는 반대쪽.`
        : target === 'XOR' || isXorLike
          ? `<b>${right}/4</b> — ○ 두 개가 대각선으로 마주 보고 있어서, 어떻게 그어도 한 점은 반대편에 남아요.`
          : `<b>${right}/4</b> — 빨간 점이 반대쪽에 있어요. 슬라이더나 숫자로 직선을 옮겨 보세요.`;
    }
    draw();
  };

  /* ---------- 01-5 XOR 다층 퍼셉트론 ---------- */
  W.xorNet = (box) => {
    title(box, '직접 만져 보기 · 2층으로 만든 XOR');
    let x1 = 1, x2 = 0;
    const B0 = { s1: 0.7, s2: -0.2, y: -0.7 };
    const b = { ...B0 };
    const row = h('<div class="w-row" style="justify-content:center"></div>');
    const t1 = toggle('x1', x1, (v) => { x1 = v; draw(true); });
    const t2 = toggle('x2', x2, (v) => { x2 = v; draw(true); });
    row.append(lab('x₁'), t1.el, lab('x₂'), t2.el);
    box.appendChild(row);
    const svg = svgBox(box, 440, 230);
    const table = h('<table class="w-table"></table>');
    const verdict = h('<div class="verdict"></div>');
    box.append(table, verdict);
    const tune = h('<div class="quiz"><b>편향을 바꿔 보기</b> — 각 뉴런의 b 값을 바꾸면 무슨 게이트가 되는지 바로 보여요.</div>');
    box.appendChild(tune);
    const sls = {
      s1: slider(tune, { label: 'b(s₁)', min: -1.5, max: 1.5, step: 0.05, value: b.s1, onInput: (v) => { b.s1 = v; draw(); } }),
      s2: slider(tune, { label: 'b(s₂)', min: -1.5, max: 1.5, step: 0.05, value: b.s2, onInput: (v) => { b.s2 = v; draw(); } }),
      y: slider(tune, { label: 'b(y)', min: -1.5, max: 1.5, step: 0.05, value: b.y, onInput: (v) => { b.y = v; draw(); } }),
    };
    const reset = h('<button class="w-btn" style="margin-top:6px">↺ 노트의 값</button>');
    reset.onclick = () => { Object.assign(b, B0); Object.keys(sls).forEach((k) => sls[k].set(B0[k])); draw(); };
    tune.appendChild(reset);
    tune.querySelectorAll('.slider').forEach((r) => (r.style.gridTemplateColumns = '54px 1fr 72px'));
    const plotWrap = h('<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:12px;align-items:center;margin-top:12px"></div>');
    const psvg = s('svg', { viewBox: '0 0 280 280' }, plotWrap);
    plotWrap.appendChild(h('<p class="hint" style="margin:0">은닉층의 두 뉴런이 각각 <b>직선 하나씩</b> 긋습니다.<br><span style="color:var(--blue)">s₁ 선</span> 아래쪽, <span style="color:var(--red)">s₂ 선</span> 위쪽 — 두 조건이 겹치는 <b>띠</b>만 1이 돼요. 직선 두 개면 XOR도 나눌 수 있어요.</p>'));
    box.appendChild(plotWrap);
    const f1 = (a, c) => -0.5 * a - 0.5 * c + b.s1, f2 = (a, c) => 0.5 * a + 0.5 * c + b.s2;
    const s1 = (a, c) => step(f1(a, c)), s2 = (a, c) => step(f2(a, c)), yv = (p, q) => step(0.5 * p + 0.5 * q + b.y);
    const net = (a, c) => yv(s1(a, c), s2(a, c));
    const N = { x1: [50, 70], x2: [50, 160], s1: [220, 70], s2: [220, 160], y: [380, 115] };
    const path = (a, c) => `M${N[a][0] + 22},${N[a][1]} L${N[c][0] - 26},${N[c][1]}`;
    const EDGES = [['x1', 's1', -0.5], ['x2', 's1', -0.5], ['x1', 's2', 0.5], ['x2', 's2', 0.5], ['s1', 'y', 0.5], ['s2', 'y', 0.5]];
    const setIn = (a, c) => { x1 = a; x2 = c; t1.set(a); t2.set(c); draw(true); };
    function draw(anim) {
      const v = { x1, x2, s1: s1(x1, x2), s2: s2(x1, x2) };
      v.y = yv(v.s1, v.s2);
      svg.innerHTML = '';
      [['입력층', 50], ['은닉층', 220], ['출력층', 380]].forEach(([t, x]) => s('text', { class: 'w-text muted', x, y: 18, 'text-anchor': 'middle' }, svg).textContent = t);
      EDGES.forEach(([a, c, w]) => s('path', { d: path(a, c), class: 'w-edge' + (w < 0 ? ' neg' : '') + (v[a] ? ' on' : ''), 'stroke-width': 3.5 }, svg));
      const node = (k, label, sub, click) => {
        const [cx, cy] = N[k];
        const c = s('circle', { class: 'w-node' + (v[k] ? ' on' : '') + (click ? ' click' : ''), cx, cy, r: k[0] === 'x' ? 22 : 26 }, svg);
        if (click) c.addEventListener('click', click);
        s('text', { class: 'w-text big', x: cx, y: cy + 5, 'text-anchor': 'middle', 'pointer-events': 'none' }, svg).textContent = v[k];
        if (label) s('text', { class: 'w-text', x: cx, y: cy - 34, 'text-anchor': 'middle' }, svg).textContent = label;
        if (sub) s('text', { class: 'w-text muted', x: cx, y: cy + 44, 'text-anchor': 'middle' }, svg).textContent = sub;
      };
      const g1 = whichGate(INPUTS.map(([a, c]) => s1(a, c))), g2 = whichGate(INPUTS.map(([a, c]) => s2(a, c)));
      const gy = whichGate(INPUTS.map(([p, q]) => yv(p, q)));
      node('x1', 'x₁', null, () => setIn(1 - x1, x2)); node('x2', 'x₂', null, () => setIn(x1, 1 - x2));
      node('s1', `s₁ = ${g1 || '?'}`, `w=−0.5, b=${fmt(b.s1)}`); node('s2', `s₂ = ${g2 || '?'}`, `w=0.5, b=${fmt(b.s2)}`); node('y', `y = ${gy || '?'}`, `w=0.5, b=${fmt(b.y)}`);
      if (anim) {
        EDGES.slice(0, 4).forEach(([a, c]) => v[a] && pulse(svg, path(a, c)));
        EDGES.slice(4).forEach(([a, c]) => v[a] && pulse(svg, path(a, c), 560));
      }
      let right = 0;
      table.innerHTML = '<tr><th>x₁</th><th>x₂</th><th>s₁</th><th>s₂</th><th>y</th><th>XOR</th><th></th></tr>' +
        INPUTS.map(([a, c]) => {
          const y = net(a, c), t = TRUTH.XOR(a, c), ok = y === t; right += ok;
          return `<tr class="click ${a === x1 && c === x2 ? 'hl' : ''}" data-a="${a}" data-b="${c}"><td>${a}</td><td>${c}</td><td>${s1(a, c)}</td><td>${s2(a, c)}</td><td><b>${y}</b></td><td>${t}</td><td class="${ok ? 'ok' : 'ng'}">${ok ? '✓' : '✗'}</td></tr>`;
        }).join('');
      table.querySelectorAll('tr.click').forEach((tr) => (tr.onclick = () => setIn(+tr.dataset.a, +tr.dataset.b)));
      verdict.className = 'verdict ' + (right === 4 ? 'ok' : 'ng');
      verdict.innerHTML = right === 4 ? '<b>XOR 완성!</b> 퍼셉트론 3개를 2층으로 쌓았더니 단층으로는 불가능했던 XOR이 됐어요.' : `<b>${right}/4</b> — 지금 네트워크는 XOR이 아니에요. 편향을 다시 맞춰 보세요.`;
      drawPlot();
    }
    function drawPlot() {
      psvg.innerHTML = '';
      const P = plane(psvg);
      s('polygon', { points: P.region((a, c) => Math.min(f1(a, c), f2(a, c))), class: 'w-shade' }, psvg);
      [[f1, 'var(--blue)'], [f2, 'var(--red)']].forEach(([f, col]) => {
        const L = P.line(f);
        if (L) s('line', { x1: P.X(L[0][0]), y1: P.Y(L[0][1]), x2: P.X(L[1][0]), y2: P.Y(L[1][1]), stroke: col, 'stroke-width': 2.5, 'stroke-dasharray': '6 4' }, psvg);
      });
      const g = s('g', {}, psvg);
      INPUTS.forEach(([a, c]) => {
        if (a === x1 && c === x2) s('circle', { cx: P.X(a), cy: P.Y(c), r: 16, fill: '#e9bf5c55', stroke: 'var(--on)' }, g);
        marker(g, P, a, c, TRUTH.XOR(a, c), net(a, c) === TRUTH.XOR(a, c));
        s('circle', { cx: P.X(a), cy: P.Y(c), r: 16, fill: 'transparent', style: 'cursor:pointer' }, g).addEventListener('click', () => setIn(a, c));
      });
    }
    draw();
  };
})();

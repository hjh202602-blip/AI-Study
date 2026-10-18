/*
 * 코드 실행기 — 노트 속 파이썬 코드를 브라우저에서 진짜로 실행한다 (Pyodide).
 * 처음 ▶ 실행을 누를 때 한 번만 파이썬(약 10MB)을 내려받는다.
 *   - ```py 코드 블록 → ▶ 실행 / ✎ 고치기 / ↺ 되돌리기
 *   - 함수를 정의한 코드는 실행 뒤 >>> 입력칸과 AND(1, 1) 같은 호출 버튼이 생긴다
 *   - input() 은 '입력값' 칸에 적은 값을 차례로 쓴다, plt.show() 는 그림으로 보여 준다
 *   - 언어 표시가 없고 AND(0, 0) 처럼 호출만 적힌 블록도 한 줄씩 실행할 수 있다
 *
 * 안전장치 — 보는 사람이 어떤 코드를 적어도 페이지가 망가지지 않게:
 *   - 파이썬은 페이지와 분리된 별도 작업 공간(Web Worker)에서 돈다. 화면·저장소·다른 탭에 손댈 수 없다.
 *   - 시간 제한: 너무 오래 걸리면(무한 반복 등) 작업 공간을 통째로 끄고 새로 켠다. ■ 멈춤 버튼도 있다.
 *   - 출력 제한: 출력이 너무 많으면 나머지는 생략한다.
 *   - 결과는 글자로만 붙인다(HTML로 해석하지 않음). 그림은 PNG 데이터만 받는다.
 */
(() => {
  const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  const TIME_LIMIT = 8000;        // 보통 코드
  const TIME_LIMIT_PKG = 30000;   // numpy·matplotlib 을 처음 불러오는 코드
  const OUTPUT_LIMIT = 20000;     // 글자 수
  const SETUP = `
import builtins, os
os.environ['MPLBACKEND'] = 'AGG'
def __input(msg=''):
    v = __next_input()
    if v is None:
        raise EOFError("input() 에 넣을 값이 부족해요. 코드 아래 '입력값' 칸에 한 줄에 하나씩 적어 주세요.")
    v = str(v)
    print(f"{msg}{v}")
    return v
builtins.input = __input
`;
  const MPL = `
import io, base64
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as __plt
def __show(*a, **k):
    buf = io.BytesIO()
    __plt.gcf().savefig(buf, format='png', dpi=90, bbox_inches='tight')
    __plt.close('all')
    __emit_img(base64.b64encode(buf.getvalue()).decode())
__plt.show = __show
`;

  // ---- 작업 공간(Worker) 안에서 도는 코드 ----
  function workerMain(cfg) {
    /* global importScripts, loadPyodide */
    importScripts(cfg.PYODIDE + 'pyodide.js');
    let py = null, inputs = [], mpl = false;
    const ready = (async () => {
      py = await loadPyodide({ indexURL: cfg.PYODIDE });
      py.setStdout({ batched: (t) => postMessage({ type: 'out', text: t }) });
      py.setStderr({ batched: (t) => postMessage({ type: 'err', text: t }) });
      py.globals.set('__emit_img', (b) => postMessage({ type: 'img', data: b }));
      py.globals.set('__next_input', () => (inputs.length ? inputs.shift() : null));
      await py.runPythonAsync(cfg.SETUP);
      postMessage({ type: 'ready' });
    })().catch((e) => postMessage({ type: 'fatal', text: String((e && e.message) || e) }));
    onmessage = async (e) => {
      await ready;
      const code = String(e.data.code || '');
      inputs = (e.data.inputs || []).map(String);
      try {
        await py.loadPackagesFromImports(code);
        if (!mpl && /matplotlib/.test(code)) { await py.runPythonAsync(cfg.MPL); mpl = true; }
        const r = await py.runPythonAsync(code);
        let v = null;
        if (r !== undefined && r !== null) { v = String(r); if (r.destroy) r.destroy(); }
        postMessage({ type: 'done', value: v });
      } catch (err) {
        postMessage({ type: 'error', text: String((err && err.message) || err) });
      }
    };
  }

  // ---- 페이지 쪽 ----
  let worker = null, ready = null, job = null;
  function spawn() {
    const src = '(' + workerMain.toString() + ')(' + JSON.stringify({ PYODIDE, SETUP, MPL }) + ')';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    ready = new Promise((res, rej) => {
      worker.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === 'ready') return res();
        if (m.type === 'fatal') { rej(new Error(m.text)); kill(); return; }
        if (job) job.onMsg(m);
      };
      worker.onerror = (e) => { rej(new Error(e.message || '파이썬을 시작하지 못했어요')); kill(); };
    });
    return ready;
  }
  function kill() { if (worker) worker.terminate(); worker = null; ready = null; }
  function stopCurrent() { if (job) job.stop('■ 멈췄어요.'); }

  function cleanError(msg) {
    const lines = String(msg).split('\n');
    const i = lines.findIndex((l) => l.includes('File "<exec>"'));
    return i >= 0 ? 'Traceback:\n' + lines.slice(i).join('\n').trim() : lines.filter(Boolean).pop();
  }

  async function exec(code, out, { echo, inputs, onRun } = {}) {
    if (echo) out.line('>>> ' + echo, 'echo');
    if (job) { out.line('다른 코드가 실행 중이에요. 끝나거나 ■ 멈춤을 누른 뒤 다시 해 주세요.', 'err'); return false; }
    if (!worker) out.status('파이썬을 준비하는 중… (처음 한 번만, 몇 초 걸려요)');
    try { await (ready || spawn()); }
    catch (e) { out.clearStatus(); out.line('파이썬을 불러오지 못했어요. 인터넷 연결을 확인해 주세요. (' + e.message + ')', 'err'); return false; }
    out.clearStatus();
    const limit = /\b(import|from)\s+(numpy|matplotlib)/.test(code) ? TIME_LIMIT_PKG : TIME_LIMIT;
    return new Promise((resolve) => {
      let size = 0, cut = false;
      const add = (t, cls) => {
        if (cut) return;
        size += t.length;
        if (size > OUTPUT_LIMIT) { cut = true; out.line('… 출력이 너무 많아서 나머지는 생략했어요.', 'err'); return; }
        out.line(t, cls);
      };
      const finish = (ok) => { clearTimeout(timer); job = null; if (onRun) onRun(false); resolve(ok); };
      job = {
        onMsg(m) {
          if (m.type === 'out') add(String(m.text));
          else if (m.type === 'err') add(String(m.text), 'err');
          else if (m.type === 'img') {
            if (typeof m.data === 'string' && m.data.length < 4e6 && /^[A-Za-z0-9+/=]+$/.test(m.data)) out.img(m.data);
          } else if (m.type === 'done') { if (m.value != null) add(String(m.value), 'val'); finish(true); }
          else if (m.type === 'error') {
            const msg = cleanError(m.text);
            add(msg, 'err');
            if (/NameError/.test(msg)) out.line('💡 함수가 아직 없어요. 위쪽 코드 블록을 먼저 ▶ 실행해 주세요.', 'echo');
            finish(false);
          }
        },
        stop(reason) {
          kill();
          out.line(reason, 'err');
          out.line('💡 파이썬을 새로 켰어요. 함수를 쓰려면 위쪽 코드 블록을 다시 ▶ 실행해 주세요.', 'echo');
          finish(false);
        },
      };
      const timer = setTimeout(() => job && job.stop(`⏱ ${limit / 1000}초가 지나도 끝나지 않아서 멈췄어요. 끝나지 않는 반복(while True 등)이 있는지 확인해 보세요.`), limit);
      if (onRun) onRun(true);
      worker.postMessage({ code, inputs: inputs || [] });
    });
  }

  function makeOut(el) {
    return {
      line(t, cls) { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = t; el.appendChild(d); },
      img(b64) { const i = document.createElement('img'); i.src = 'data:image/png;base64,' + b64; i.alt = '그래프'; el.appendChild(i); },
      status(t) { this.clearStatus(); const d = document.createElement('div'); d.className = 'status'; d.textContent = t; el.appendChild(d); },
      clearStatus() { el.querySelectorAll('.status').forEach((s) => s.remove()); },
      clear() { el.innerHTML = ''; },
    };
  }

  // def NAME(a, b) 를 찾아 호출 예시 버튼을 만든다
  function callExamples(code) {
    const out = [];
    for (const m of code.matchAll(/^def\s+(\w+)\s*\(([^)]*)\)/gm)) {
      const args = m[2].split(',').map((s) => s.trim()).filter(Boolean);
      if (args.length === 2) [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b]) => out.push(`${m[1]}(${a}, ${b})`));
      else if (args.length === 1) [0, 1].forEach((a) => out.push(`${m[1]}(${a})`));
      else if (args.length === 0) out.push(`${m[1]}()`);
    }
    return out.slice(0, 16);
  }

  const CALL_LINE = /^\s*[A-Za-z_]\w*\s*\(.*\)\s*(#.*)?$/;
  const countInputs = (code) => (code.match(/\binput\s*\(/g) || []).length;

  function enhance(pre, { lang = 'python', title } = {}) {
    const codeEl = pre.querySelector('code') || pre;
    const original = codeEl.textContent.replace(/\n$/, '');
    const callsOnly = lang === 'calls';
    const box = document.createElement('div');
    box.className = 'runner';
    box.innerHTML = `<div class="runner-bar"><span class="lang">${title ? title.replace(/[<>&]/g, '') : callsOnly ? 'PYTHON · 호출' : 'PYTHON'}</span>
      <button class="run">▶ 실행</button><button class="stop" hidden>■ 멈춤</button>${callsOnly ? '' : '<button class="edit">✎ 고치기</button><button class="reset" hidden>↺ 되돌리기</button>'}</div>`;
    pre.replaceWith(box);
    box.appendChild(pre);
    const ta = document.createElement('textarea');
    ta.spellcheck = false; ta.hidden = true; ta.value = original; ta.maxLength = 20000;
    box.appendChild(ta);
    const inBox = document.createElement('div');
    inBox.className = 'runner-inputs';
    inBox.innerHTML = '<label>입력값 — <code>input()</code> 에 차례로 들어가요 (한 줄에 하나씩)</label><textarea spellcheck="false" rows="3"></textarea>';
    const inTa = inBox.querySelector('textarea');
    box.appendChild(inBox);
    const outEl = document.createElement('div'); outEl.className = 'runner-out';
    const repl = document.createElement('div'); repl.className = 'runner-repl'; repl.hidden = true;
    repl.innerHTML = '<div class="runner-chips"></div><label>&gt;&gt;&gt;</label><input placeholder="여기에 파이썬을 입력하고 Enter (예: AND(1, 1))" spellcheck="false" maxlength="2000">';
    box.append(outEl, repl);
    const out = makeOut(outEl);
    const runBtn = box.querySelector('.run'), stopBtn = box.querySelector('.stop'), editBtn = box.querySelector('.edit'), resetBtn = box.querySelector('.reset');
    const input = repl.querySelector('input'), chips = repl.querySelector('.runner-chips');
    const history = []; let hi = 0;
    const current = () => (ta.hidden ? original : ta.value);
    const syncInputs = () => {
      const k = countInputs(current());
      inBox.hidden = !k;
      if (k && !inTa.value.trim()) inTa.value = Array(k).fill('1').join('\n');
    };
    syncInputs();
    ta.addEventListener('input', syncInputs);
    const onRun = (on) => { stopBtn.hidden = !on; runBtn.disabled = on; };
    stopBtn.onclick = stopCurrent;
    const inputValues = () => inTa.value.split('\n').map((v) => v.replace(/\r$/, '')).filter((v, i, a) => i < a.length - 1 || v !== '');

    runBtn.onclick = async () => {
      out.clear();
      if (callsOnly) {
        for (const l of original.split('\n')) {
          const c = l.replace(/#.*$/, '').trim();
          if (c && !(await exec(c, out, { echo: c, onRun }))) break;
        }
      } else {
        const ok = await exec(current(), out, { inputs: inputValues(), onRun });
        if (ok && !outEl.textContent.trim() && !outEl.querySelector('img')) out.line('✓ 실행 완료 (출력은 없어요)', 'echo');
        const ex = callExamples(current());
        chips.innerHTML = '';
        ex.forEach((c) => { const b = document.createElement('button'); b.textContent = c; b.onclick = () => runLine(c); chips.appendChild(b); });
        if (ok && ex.length) out.line('아래 버튼을 누르거나 >>> 칸에 직접 입력해서 함수를 불러 보세요.', 'echo');
        repl.hidden = false;
      }
    };
    async function runLine(c) {
      if (!c.trim()) return;
      history.push(c); hi = history.length;
      await exec(c, out, { echo: c, inputs: inputValues(), onRun });
      outEl.scrollTop = outEl.scrollHeight;
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const c = input.value; input.value = ''; runLine(c); }
      if (e.key === 'ArrowUp' && history.length) { hi = Math.max(0, hi - 1); input.value = history[hi]; e.preventDefault(); }
      if (e.key === 'ArrowDown' && history.length) { hi = Math.min(history.length, hi + 1); input.value = history[hi] || ''; e.preventDefault(); }
    });
    if (editBtn) editBtn.onclick = () => {
      const editing = ta.hidden;
      ta.hidden = !editing; pre.hidden = editing;
      editBtn.textContent = editing ? '👁 보기' : '✎ 고치기';
      resetBtn.hidden = false;
      if (editing) { ta.style.height = Math.max(120, pre.offsetHeight || ta.scrollHeight) + 'px'; ta.focus(); }
      else { codeEl.textContent = ta.value; try { delete codeEl.dataset.highlighted; window.hljs && hljs.highlightElement(codeEl); } catch {} }
      syncInputs();
    };
    if (resetBtn) resetBtn.onclick = () => {
      ta.value = original; codeEl.textContent = original;
      try { delete codeEl.dataset.highlighted; window.hljs && hljs.highlightElement(codeEl); } catch {}
      out.clear();
      inTa.value = '';
      syncInputs();
    };
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); const st = ta.selectionStart; ta.setRangeText('    ', st, ta.selectionEnd, 'end'); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runBtn.click(); }
    });
    return box;
  }

  // 마크다운에서 만든 코드 블록 중 실행할 수 있는 것을 고른다
  function enhanceAll(root) {
    root.querySelectorAll('pre > code').forEach((c) => {
      const cls = c.dataset.lang ?? c.className ?? '';
      const text = c.textContent.trim();
      if (/language-(py|python)\b/.test(cls)) enhance(c.parentElement);
      else if (!/language-/.test(cls) && text && text.split('\n').filter((l) => l.trim()).every((l) => CALL_LINE.test(l))) enhance(c.parentElement, { lang: 'calls' });
    });
  }

  window.AIMAP_RUNNER = { enhance, enhanceAll };
})();

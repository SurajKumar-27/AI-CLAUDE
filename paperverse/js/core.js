/* Paperverse core: registries + small helpers shared by every visualisation.
   Plain script (no modules) so the site also works when opened from disk. */
(function () {
  const PV = (window.PV = window.PV || {});
  PV.papers = [];
  PV.viz = {};

  PV.tracks = {
    primer: { name: "Start here", color: "#f4f1ff", blurb: "The zero-knowledge on-ramp" },
    arch: { name: "Architecture", color: "#f5b642", blurb: "How a model is built" },
    train: { name: "Training & tuning", color: "#ff8570", blurb: "How a model learns and gets aligned" },
    reason: { name: "Reasoning & agents", color: "#5ec8ff", blurb: "How a model thinks, uses tools and harnesses" },
    speed: { name: "Efficiency", color: "#5be3b0", blurb: "How a model runs fast and cheap" },
    inside: { name: "Interpretability", color: "#c3a6ff", blurb: "Looking inside the black box" },
  };

  PV.register = (paper) => PV.papers.push(paper);
  PV.defineViz = (name, fn) => (PV.viz[name] = fn);

  PV.reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- DOM ---------- */
  PV.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "html") el.innerHTML = v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return el;
  };

  /* ---------- maths ---------- */
  PV.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  PV.lerp = (a, b, t) => a + (b - a) * t;
  PV.ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  PV.easeOut = (t) => 1 - Math.pow(1 - t, 3);
  PV.rng = function (seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };
  PV.softmax = function (xs, temp = 1) {
    const m = Math.max(...xs);
    const e = xs.map((x) => Math.exp((x - m) / temp));
    const z = e.reduce((a, b) => a + b, 0);
    return e.map((x) => x / z);
  };
  PV.alpha = function (hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  PV.mix = function (h1, h2, t) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const c = (s) => Math.round(PV.lerp((a >> s) & 255, (b >> s) & 255, t));
    return `rgb(${c(16)},${c(8)},${c(0)})`;
  };

  PV.C = {
    bg: "#070b14", bg2: "#0c1322", panel: "#111a2c", panel2: "#16223a",
    line: "#243350", line2: "#33466b", ink: "#edf2fb", ink2: "#b3c0d8", ink3: "#7d8ba6",
    glow: "#ffe9b8", good: "#5be3b0", bad: "#ff6b7a",
    arch: "#f5b642", train: "#ff8570", reason: "#5ec8ff", speed: "#5be3b0", inside: "#c3a6ff",
  };
  PV.FONT = {
    body: '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
    display: '"Bricolage Grotesque", "Avenir Next", "Segoe UI", system-ui, sans-serif',
  };

  /* ---------- canvas + animation ---------- */
  // Creates a DPR-aware canvas that fills `root`, and a RAF loop that stops on cleanup
  // or while the tab is hidden. draw(ctx, W, H, t, dt) is called every frame.
  PV.canvasLoop = function (root, draw, opts = {}) {
    const cv = PV.h("canvas");
    root.appendChild(cv);
    const ctx = cv.getContext("2d");
    const state = { W: 0, H: 0, dpr: 1, running: true, t: 0 };
    const resize = () => {
      const r = cv.getBoundingClientRect();
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.W = Math.max(10, r.width);
      state.H = Math.max(10, r.height);
      cv.width = Math.round(state.W * state.dpr);
      cv.height = Math.round(state.H * state.dpr);
      if (opts.static) frame(performance.now());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    let last = performance.now(), raf = 0;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!document.hidden) state.t += PV.reduceMotion && !opts.forceMotion ? dt * 0.35 : dt;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      ctx.clearRect(0, 0, state.W, state.H);
      if (state.W > 10) draw(ctx, state.W, state.H, state.t, dt);
      if (state.running && !opts.static) raf = requestAnimationFrame(frame);
    }
    resize();
    if (!opts.static) raf = requestAnimationFrame(frame);
    // pointer helper in CSS pixels
    state.pointer = { x: -1, y: -1, down: false, inside: false };
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      state.pointer.x = e.clientX - r.left;
      state.pointer.y = e.clientY - r.top;
    };
    cv.addEventListener("pointermove", (e) => { pos(e); state.pointer.inside = true; });
    cv.addEventListener("pointerleave", () => { state.pointer.inside = false; });
    cv.addEventListener("pointerdown", (e) => { pos(e); state.pointer.down = true; opts.onDown && opts.onDown(state.pointer.x, state.pointer.y, e); });
    window.addEventListener("pointerup", () => (state.pointer.down = false));
    state.canvas = cv;
    state.ctx = ctx;
    state.redraw = () => frame(performance.now());
    state.stop = () => { state.running = false; cancelAnimationFrame(raf); ro.disconnect(); };
    return state;
  };

  /* ---------- text helpers for canvas ---------- */
  PV.text = function (ctx, str, x, y, o = {}) {
    ctx.font = `${o.weight || 400} ${o.size || 13}px ${o.font || PV.FONT.body}`;
    ctx.fillStyle = o.color || PV.C.ink;
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = o.base || "middle";
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  };
  PV.rrect = function (ctx, x, y, w, h, r) {
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  PV.box = function (ctx, x, y, w, h, o = {}) {
    PV.rrect(ctx, x, y, w, h, o.r == null ? 8 : o.r);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.stroke(); }
  };
  PV.arrow = function (ctx, x1, y1, x2, y2, o = {}) {
    ctx.strokeStyle = o.color || PV.C.ink3;
    ctx.fillStyle = o.color || PV.C.ink3;
    ctx.lineWidth = o.lw || 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1), s = o.head || 7;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - s * Math.cos(a - 0.45), y2 - s * Math.sin(a - 0.45));
    ctx.lineTo(x2 - s * Math.cos(a + 0.45), y2 - s * Math.sin(a + 0.45));
    ctx.closePath();
    ctx.fill();
  };
  // word-wraps text into lines that fit maxW; returns lines
  PV.wrap = function (ctx, str, maxW) {
    const words = str.split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // shrink the font (down to minSize) and then truncate with an ellipsis so `str` fits maxW
  PV.fit = function (ctx, str, maxW, size, o = {}) {
    let s = size;
    const font = (sz) => `${o.weight || 400} ${sz}px ${o.font || PV.FONT.body}`;
    ctx.font = font(s);
    while (s > (o.minSize || 8) && ctx.measureText(str).width > maxW) ctx.font = font(--s);
    let out = str;
    while (out.length > 1 && ctx.measureText(out).width > maxW) out = out.slice(0, -2) + "…";
    return { text: out, size: s };
  };

  /* ---------- controls ---------- */
  PV.controls = function (root) {
    const bar = PV.h("div", { class: "viz-controls" });
    root.appendChild(bar);
    let n = 0;
    const api = {
      el: bar,
      slider(label, o) {
        const id = "vz-" + Math.random().toString(36).slice(2, 8) + n++;
        const out = PV.h("output", { for: id });
        const inp = PV.h("input", { type: "range", id, min: o.min, max: o.max, step: o.step || 1, value: o.value });
        const fmt = o.fmt || ((v) => v);
        const upd = () => { out.textContent = fmt(+inp.value); o.onInput && o.onInput(+inp.value); };
        inp.addEventListener("input", upd);
        bar.appendChild(PV.h("label", { for: id }, label, inp, out));
        out.textContent = fmt(+inp.value);
        return { input: inp, set(v) { inp.value = v; upd(); }, get: () => +inp.value };
      },
      button(label, onClick, o = {}) {
        const b = PV.h("button", { class: "vbtn", type: "button", "aria-pressed": o.pressed == null ? null : String(!!o.pressed) }, label);
        b.addEventListener("click", () => onClick(b));
        bar.appendChild(b);
        return b;
      },
      // a set of mutually exclusive buttons
      toggle(options, value, onChange) {
        const btns = options.map(([val, label]) => {
          const b = PV.h("button", { class: "vbtn", type: "button", "aria-pressed": String(val === value) }, label);
          b.addEventListener("click", () => {
            btns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
            onChange(val);
          });
          bar.appendChild(b);
          return b;
        });
        return btns;
      },
      note(text) {
        const s = PV.h("span", { style: { color: PV.C.ink3 } }, text);
        bar.appendChild(s);
        return s;
      },
    };
    return api;
  };

  PV.caption = function (root, html) {
    const c = PV.h("div", { class: "viz-caption", html });
    root.appendChild(c);
    return { el: c, set: (h) => (c.innerHTML = h) };
  };
  PV.note = function (root, text) {
    root.appendChild(PV.h("div", { class: "viz-note" }, text));
  };

  /* ---------- SVG ---------- */
  const NS = "http://www.w3.org/2000/svg";
  PV.svg = function (tag, attrs = {}, ...kids) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
    for (const kid of kids.flat()) if (kid != null) el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    return el;
  };
})();

/* Reusable visualisations: flow diagrams, typed transcripts, bar + line charts. */
(function () {
  const { h, C, FONT, svg } = PV;

  /* ---------- flow: boxes + arrows with a step-by-step walkthrough ---------- */
  PV.defineViz("flow", (root, o, api) => {
    const col = api.color;
    const steps = o.steps || [];
    let step = 0, stepT = 0, playing = !PV.reduceMotion;
    const cap = PV.caption(root, "");
    const nodes = o.nodes.map((n) => ({ ...n }));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const edges = o.edges.map((e) => ({ ...e }));
    const edgeKey = (e) => e.a + ">" + e.b;

    function activeSets() {
      const s = steps[step] || {};
      return { on: new Set(s.on || []), edges: new Set(s.edges || []) };
    }
    function setStep(i) {
      step = (i + steps.length) % steps.length;
      stepT = 0;
      const s = steps[step];
      cap.set(`<b>${step + 1}/${steps.length}</b> &nbsp;${s ? s.text : ""}`);
    }

    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      stepT += dt;
      if (playing && steps.length && stepT > (o.interval || 3.2)) setStep(step + 1);
      const act = activeSets();
      const top = 44, bot = 56;
      const px = (n) => n.x * W;
      const py = (n) => top + n.y * (H - top - bot);
      ctx.font = `700 13px ${FONT.body}`;
      for (const n of nodes) {
        const tw = Math.max(ctx.measureText(n.label).width, n.sub ? measureSub(ctx, n.sub) : 0);
        n.w = Math.min(W * (n.maxW || 0.3), Math.max(84, tw + 26));
        n.hh = n.sub ? 50 : 34;
      }
      // edges
      edges.forEach((e) => {
        const a = byId[e.a], b = byId[e.b];
        const on = act.edges.has(edgeKey(e));
        const [x1, y1, x2, y2] = clipLine(px(a), py(a), a.w, a.hh, px(b), py(b), b.w, b.hh);
        const bend = e.bend || 0;
        const mx = (x1 + x2) / 2 - (y2 - y1) * bend, my = (y1 + y2) / 2 + (x2 - x1) * bend;
        ctx.strokeStyle = on ? col : C.line2;
        ctx.lineWidth = on ? 2 : 1.3;
        ctx.setLineDash(e.dashed ? [5, 5] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        // arrow head
        const ang = Math.atan2(y2 - my, x2 - mx);
        ctx.fillStyle = on ? col : C.line2;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 8 * Math.cos(ang - 0.45), y2 - 8 * Math.sin(ang - 0.45));
        ctx.lineTo(x2 - 8 * Math.cos(ang + 0.45), y2 - 8 * Math.sin(ang + 0.45));
        ctx.fill();
        if (on) {
          for (let k = 0; k < 3; k++) {
            const u = ((t * 0.7 + k / 3) % 1);
            const qx = (1 - u) * (1 - u) * x1 + 2 * (1 - u) * u * mx + u * u * x2;
            const qy = (1 - u) * (1 - u) * y1 + 2 * (1 - u) * u * my + u * u * y2;
            ctx.fillStyle = C.glow;
            ctx.beginPath();
            ctx.arc(qx, qy, 3, 0, 7);
            ctx.fill();
          }
        }
        if (e.label) {
          PV.text(ctx, e.label, mx, my - 9, { size: 11, color: on ? C.ink : C.ink3, align: "center", font: FONT.mono });
        }
      });
      // nodes
      for (const n of nodes) {
        const on = act.on.has(n.id);
        const x = px(n) - n.w / 2, y = py(n) - n.hh / 2;
        const c = n.color || col;
        if (on) {
          ctx.shadowColor = c;
          ctx.shadowBlur = 18 + 6 * Math.sin(t * 4);
        }
        PV.box(ctx, x, y, n.w, n.hh, { r: 10, fill: on ? PV.alpha(c.startsWith("#") ? c : "#ffffff", 0.18) : C.panel, stroke: on ? c : C.line2, lw: on ? 2 : 1 });
        ctx.shadowBlur = 0;
        PV.text(ctx, n.label, px(n), py(n) - (n.sub ? 9 : 0), { size: 13, weight: 700, color: on ? C.ink : C.ink2, align: "center" });
        if (n.sub) PV.text(ctx, n.sub, px(n), py(n) + 11, { size: 11, color: C.ink3, align: "center" });
      }
    });

    function measureSub(ctx, s) {
      ctx.font = `400 11px ${FONT.body}`;
      const w = ctx.measureText(s).width;
      ctx.font = `700 13px ${FONT.body}`;
      return w;
    }
    // shorten a centre-to-centre line so it starts/ends on the box edges
    function clipLine(x1, y1, w1, h1, x2, y2, w2, h2) {
      const cut = (x, y, w, hh, dx, dy) => {
        const sx = Math.abs(dx) > 1e-6 ? (w / 2 + 4) / Math.abs(dx) : Infinity;
        const sy = Math.abs(dy) > 1e-6 ? (hh / 2 + 4) / Math.abs(dy) : Infinity;
        const s = Math.min(sx, sy);
        return [x + dx * s, y + dy * s];
      };
      const dx = x2 - x1, dy = y2 - y1;
      const [ax, ay] = cut(x1, y1, w1, h1, dx, dy);
      const [bx, by] = cut(x2, y2, w2, h2, -dx, -dy);
      return [ax, ay, bx, by];
    }

    if (steps.length) {
      const ctl = PV.controls(root);
      ctl.button("◀ Step", () => { playing = false; playBtn.setAttribute("aria-pressed", "false"); setStep(step - 1); });
      const playBtn = ctl.button("Auto-play", (b) => { playing = !playing; b.setAttribute("aria-pressed", String(playing)); }, { pressed: playing });
      ctl.button("Step ▶", () => { playing = false; playBtn.setAttribute("aria-pressed", "false"); setStep(step + 1); });
      setStep(0);
    }
    return () => st.stop();
  });

  /* ---------- chat: a transcript that types itself out ---------- */
  PV.defineViz("chat", (root, o, api) => {
    const box = h("div", { class: "chat" });
    root.appendChild(box);
    const roles = {
      user: { label: "You", color: C.ink2 },
      model: { label: "Model", color: api.color },
      thought: { label: "Thought", color: C.inside },
      action: { label: "Action", color: C.reason },
      obs: { label: "Observation", color: C.speed },
      tool: { label: "Tool", color: C.speed },
      system: { label: "System", color: C.ink3 },
      critic: { label: "Critique", color: C.train },
      bad: { label: "Model", color: C.bad },
      good: { label: "Model", color: C.good },
    };
    let timers = [], alive = true;
    const speed = o.speed || 90; // chars per second
    function play() {
      timers.forEach(clearTimeout);
      timers = [];
      box.innerHTML = "";
      let delay = 200;
      o.lines.forEach((ln) => {
        const r = roles[ln.who] || { label: ln.who, color: C.ink2 };
        const label = ln.label || r.label;
        const msg = h("div", { class: "msg " + (ln.who === "user" ? "me" : ""), style: { "--mc": ln.color || r.color } },
          h("span", { class: "who" }, label),
          h("div", { class: "body" }));
        const body = msg.querySelector(".body");
        const text = ln.text;
        timers.push(setTimeout(() => {
          if (!alive) return;
          box.appendChild(msg);
          if (PV.reduceMotion || ln.instant) { body.innerHTML = text; box.scrollTop = box.scrollHeight; return; }
          let i = 0;
          const plain = text.replace(/<[^>]+>/g, "");
          const tick = () => {
            if (!alive) return;
            i += Math.max(1, Math.round(speed / 30));
            if (i >= plain.length) { body.innerHTML = text; box.scrollTop = box.scrollHeight; return; }
            body.textContent = plain.slice(0, i);
            box.scrollTop = box.scrollHeight;
            timers.push(setTimeout(tick, 33));
          };
          tick();
        }, delay));
        const plainLen = ln.text.replace(/<[^>]+>/g, "").length;
        delay += (PV.reduceMotion ? 150 : (plainLen / speed) * 1000) + (ln.pause || 550);
      });
    }
    const ctl = PV.controls(root);
    ctl.button("↻ Replay", play);
    if (o.note) ctl.note(o.note);
    play();
    return () => { alive = false; timers.forEach(clearTimeout); };
  });

  /* ---------- bars: horizontal bars drawn to scale from zero ---------- */
  PV.defineViz("bars", (root, o, api) => {
    const W = 640, rowH = o.series ? 20 : 30, gap = o.series ? 18 : 12;
    const cats = o.series ? o.categories : o.items.map((i) => i.label);
    const nSeries = o.series ? o.series.length : 1;
    const groupH = nSeries * rowH + gap;
    const labelW = o.labelW || 190, top = o.title ? 64 : 30, right = 70;
    const legendH = o.series ? 30 : 0;
    const H = top + cats.length * groupH + 40 + legendH;
    const all = o.series ? o.series.flatMap((s) => s.values) : o.items.map((i) => i.value);
    const max = o.max || Math.max(...all) * 1.08;
    const x = (v) => labelW + (v / max) * (W - labelW - right);
    const fmt = o.fmt || ((v) => v + (o.unit || ""));
    const el = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.title || "bar chart", preserveAspectRatio: "xMidYMid meet" });
    if (o.title) el.appendChild(svg("text", { x: 16, y: 28, fill: C.ink, "font-family": FONT.display, "font-size": 17, "font-weight": 700 }, o.title));
    if (o.subtitle) el.appendChild(svg("text", { x: 16, y: 48, fill: C.ink3, "font-family": FONT.body, "font-size": 12 }, o.subtitle));
    // grid
    const ticks = niceTicks(0, max, 4);
    ticks.forEach((tk) => {
      el.appendChild(svg("line", { x1: x(tk), x2: x(tk), y1: top - 8, y2: top + cats.length * groupH - gap + 6, stroke: C.line, "stroke-width": 1 }));
      el.appendChild(svg("text", { x: x(tk), y: top + cats.length * groupH + 10, fill: C.ink3, "font-family": FONT.mono, "font-size": 10, "text-anchor": "middle" }, fmtTick(tk)));
    });
    const bars = [];
    cats.forEach((cat, ci) => {
      const gy = top + ci * groupH;
      el.appendChild(svg("text", { x: labelW - 10, y: gy + (nSeries * rowH) / 2, fill: C.ink2, "font-family": FONT.body, "font-size": 12.5, "text-anchor": "end", "dominant-baseline": "middle" }, cat));
      for (let si = 0; si < nSeries; si++) {
        const v = o.series ? o.series[si].values[ci] : o.items[ci].value;
        if (v == null) continue;
        const item = o.series ? null : o.items[ci];
        const color = o.series ? o.series[si].color : item.color || (item.hi ? api.color : C.line2);
        const y = gy + si * rowH;
        const r = svg("rect", { x: labelW, y: y + 3, height: rowH - 6, width: 0, rx: 4, fill: color });
        el.appendChild(r);
        const t = svg("text", { x: labelW + 6, y: y + rowH / 2, fill: C.ink, "font-family": FONT.mono, "font-size": 11.5, "dominant-baseline": "middle", opacity: 0 }, fmt(v));
        el.appendChild(t);
        bars.push({ r, t, w: x(v) - labelW });
      }
    });
    if (o.series) {
      let lx = labelW;
      o.series.forEach((s) => {
        const ly = H - 18;
        el.appendChild(svg("rect", { x: lx, y: ly - 6, width: 12, height: 12, rx: 3, fill: s.color }));
        const tt = svg("text", { x: lx + 18, y: ly, fill: C.ink2, "font-family": FONT.body, "font-size": 12, "dominant-baseline": "middle" }, s.name);
        el.appendChild(tt);
        lx += 30 + s.name.length * 7;
      });
    }
    const wrap = h("div", { style: { padding: "8px 10px", display: "grid", alignItems: "center", height: "100%", overflow: "auto" } }, el);
    root.appendChild(wrap);
    if (o.note) PV.note(root, o.note);
    let start = null, raf;
    const anim = (now) => {
      if (start == null) start = now;
      const p = PV.reduceMotion ? 1 : PV.easeOut(Math.min(1, (now - start) / 900));
      bars.forEach((b) => {
        b.r.setAttribute("width", Math.max(0, b.w * p));
        b.t.setAttribute("x", 8 + labelW + b.w * p);
        b.t.setAttribute("opacity", p > 0.6 ? 1 : 0);
      });
      if (p < 1) raf = requestAnimationFrame(anim);
    };
    raf = requestAnimationFrame(anim);
    return () => cancelAnimationFrame(raf);
  });

  function niceTicks(a, b, n) {
    const span = b - a, step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function fmtTick(v) {
    if (Math.abs(v) >= 1e6) return v / 1e6 + "M";
    if (Math.abs(v) >= 1e3) return v / 1e3 + "k";
    return String(v);
  }
  PV.niceTicks = niceTicks;

  /* ---------- lines: x/y chart with optional log axes ---------- */
  PV.defineViz("lines", (root, o, api) => {
    const W = 640, H = 400, L = 64, R = o.right || 120, T = o.title ? 56 : 24, B = 54;
    const xs = o.x, ys = o.y;
    const tx = (v) => (xs.log ? Math.log10(v) : v);
    const ty = (v) => (ys.log ? Math.log10(v) : v);
    const X = (v) => L + ((tx(v) - tx(xs.min)) / (tx(xs.max) - tx(xs.min))) * (W - L - R);
    const Y = (v) => H - B - ((ty(v) - ty(ys.min)) / (ty(ys.max) - ty(ys.min))) * (H - T - B);
    const el = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.title || "line chart" });
    if (o.title) el.appendChild(svg("text", { x: 16, y: 26, fill: C.ink, "font-family": FONT.display, "font-size": 17, "font-weight": 700 }, o.title));
    if (o.subtitle) el.appendChild(svg("text", { x: 16, y: 44, fill: C.ink3, "font-size": 12, "font-family": FONT.body }, o.subtitle));
    const xt = xs.ticks || (xs.log ? logTicks(xs.min, xs.max) : niceTicks(xs.min, xs.max, 5));
    const yt = ys.ticks || (ys.log ? logTicks(ys.min, ys.max) : niceTicks(ys.min, ys.max, 4));
    xt.forEach((v) => {
      el.appendChild(svg("line", { x1: X(v), x2: X(v), y1: T, y2: H - B, stroke: C.line, "stroke-width": 1 }));
      el.appendChild(svg("text", { x: X(v), y: H - B + 16, fill: C.ink3, "font-size": 10.5, "font-family": FONT.mono, "text-anchor": "middle" }, (xs.fmt || fmtTick)(v)));
    });
    yt.forEach((v) => {
      el.appendChild(svg("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: C.line, "stroke-width": 1 }));
      el.appendChild(svg("text", { x: L - 8, y: Y(v), fill: C.ink3, "font-size": 10.5, "font-family": FONT.mono, "text-anchor": "end", "dominant-baseline": "middle" }, (ys.fmt || fmtTick)(v)));
    });
    el.appendChild(svg("text", { x: (L + W - R) / 2, y: H - 12, fill: C.ink2, "font-size": 12, "text-anchor": "middle", "font-family": FONT.body }, xs.label || ""));
    el.appendChild(svg("text", { x: 14, y: (T + H - B) / 2, fill: C.ink2, "font-size": 12, "text-anchor": "middle", "font-family": FONT.body, transform: `rotate(-90 14 ${(T + H - B) / 2})` }, ys.label || ""));
    const paths = [];
    (o.series || []).forEach((s) => {
      const d = s.points.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
      const p = svg("path", { d, fill: "none", stroke: s.color || api.color, "stroke-width": s.width || 2.5, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": s.dashed ? "6 6" : null });
      el.appendChild(p);
      paths.push({ p, dashed: s.dashed });
      const last = s.points[s.points.length - 1];
      if (s.dots) s.points.forEach((pt) => el.appendChild(svg("circle", { cx: X(pt[0]), cy: Y(pt[1]), r: 4, fill: s.color || api.color })));
      el.appendChild(svg("text", { x: X(last[0]) + 8, y: Y(last[1]) + (s.labelDy || 0), fill: s.color || api.color, "font-size": 12, "font-weight": 700, "font-family": FONT.body, "dominant-baseline": "middle" }, s.name));
    });
    (o.marks || []).forEach((m) => {
      el.appendChild(svg("circle", { cx: X(m.x), cy: Y(m.y), r: 5, fill: m.color || C.glow, stroke: C.bg, "stroke-width": 2 }));
      el.appendChild(svg("text", { x: X(m.x) + (m.dx || 8), y: Y(m.y) + (m.dy || -10), fill: m.color || C.glow, "font-size": 11.5, "font-family": FONT.body, "text-anchor": m.anchor || "start" }, m.text));
    });
    root.appendChild(h("div", { style: { padding: "6px 8px", display: "grid", alignItems: "center", height: "100%" } }, el));
    if (o.note) PV.note(root, o.note);
    if (!PV.reduceMotion) {
      paths.forEach(({ p, dashed }) => {
        if (dashed) return;
        const len = p.getTotalLength ? p.getTotalLength() : 1000;
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len;
        p.getBoundingClientRect();
        p.style.transition = "stroke-dashoffset 1.3s cubic-bezier(.3,.7,.2,1)";
        requestAnimationFrame(() => (p.style.strokeDashoffset = 0));
      });
    }
    return () => {};
  });

  function logTicks(a, b) {
    const out = [];
    for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) {
      const v = Math.pow(10, e);
      if (v >= a * 0.999 && v <= b * 1.001) out.push(v);
    }
    return out;
  }
  PV.logTicks = logTicks;
})();

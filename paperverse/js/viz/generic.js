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
      const narrow = W < 520;
      const fs = narrow ? 11.5 : 13, sfs = narrow ? 10 : 11;
      const top = 44, bot = 56;
      const py = (n) => top + n.y * (H - top - bot);
      // on narrow screens labels wrap onto two lines instead of spilling out of their box
      for (const n of nodes) {
        ctx.font = `700 ${fs}px ${FONT.body}`;
        const tw = Math.max(ctx.measureText(n.label).width, n.sub ? measureSub(ctx, n.sub, sfs) : 0);
        n.w = Math.min(W * Math.max(n.maxW || 0.3, narrow ? 0.3 : 0), Math.max(narrow ? 70 : 84, tw + 24));
        ctx.font = `700 ${fs}px ${FONT.body}`;
        n.lines = PV.wrap(ctx, n.label, n.w - 14).slice(0, 2);
        n.subText = n.sub ? PV.fit(ctx, n.sub, n.w - 12, sfs, { minSize: 9 }) : null;
        n.hh = 16 + n.lines.length * (fs + 3) + (n.sub ? sfs + 4 : 0);
        n.cx = PV.clamp(n.x * W, n.w / 2 + 4, W - n.w / 2 - 4);
      }
      if (narrow) {
        // boxes on the same row may only use up to the gap to their neighbours
        for (const n of nodes) {
          let lim = n.w;
          for (const m of nodes) if (m !== n && Math.abs(py(m) - py(n)) < 46) lim = Math.min(lim, Math.abs(m.x * W - n.x * W) - 6);
          n.w = Math.max(56, lim);
          ctx.font = `700 ${fs}px ${FONT.body}`;
          n.lines = PV.wrap(ctx, n.label, n.w - 10).slice(0, 3);
          n.subText = n.sub ? PV.fit(ctx, n.sub, n.w - 8, sfs, { minSize: 8.5 }) : null;
          n.hh = 14 + n.lines.length * (fs + 3) + (n.sub ? sfs + 4 : 0);
          n.cx = PV.clamp(n.x * W, n.w / 2 + 3, W - n.w / 2 - 3);
        }
      }
      const px = (n) => n.cx;
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
        ctx.font = `400 ${W < 520 ? 9.5 : 11}px ${FONT.mono}`;
        if (e.label && Math.hypot(x2 - x1, y2 - y1) > ctx.measureText(e.label).width + 18) {
          PV.text(ctx, e.label, mx, my - 9, { size: W < 520 ? 9.5 : 11, color: on ? C.ink : C.ink3, align: "center", font: FONT.mono });
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
        const textH = n.lines.length * (fs + 3) + (n.sub ? sfs + 4 : 0);
        let ty = py(n) - textH / 2 + (fs + 3) / 2;
        n.lines.forEach((ln) => { PV.text(ctx, ln, px(n), ty, { size: fs, weight: 700, color: on ? C.ink : C.ink2, align: "center" }); ty += fs + 3; });
        if (n.subText) PV.text(ctx, n.subText.text, px(n), ty + 1, { size: n.subText.size, color: C.ink3, align: "center" });
      }
    });

    function measureSub(ctx, s, size) {
      ctx.font = `400 ${size}px ${FONT.body}`;
      return ctx.measureText(s).width;
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

  /* ---------- chart helpers: charts are laid out at the container's real pixel width ---------- */
  const measureCtx = document.createElement("canvas").getContext("2d");
  // wraps `str` to maxW and appends the lines as SVG text; returns the height used
  function svgText(el, str, x, y, maxW, o) {
    measureCtx.font = `${o.weight || 400} ${o.size}px ${o.font || FONT.body}`;
    const lines = PV.wrap(measureCtx, str, maxW);
    lines.forEach((ln, i) => el.appendChild(svg("text", { x, y: y + i * o.size * 1.3, fill: o.fill, "font-family": o.font || FONT.body, "font-size": o.size, "font-weight": o.weight || 400, "dominant-baseline": "hanging" }, ln)));
    return lines.length * o.size * 1.3;
  }
  // re-renders a chart whenever its container changes width; animates only the first time
  function responsiveChart(root, o, render) {
    const wrap = h("div", { class: "chart-wrap" });
    root.appendChild(wrap);
    if (o.note) PV.note(root, o.note);
    let lastW = 0, first = true, raf = 0;
    const draw = () => {
      const W = Math.max(280, Math.floor(wrap.clientWidth));
      if (Math.abs(W - lastW) < 8) return;
      lastW = W;
      cancelAnimationFrame(raf);
      wrap.innerHTML = "";
      const out = render(W, first && !PV.reduceMotion);
      wrap.appendChild(out.el);
      if (out.animate) raf = out.animate();
      first = false;
    };
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    draw();
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }
  function chartHeader(el, o, W) {
    let y = 12;
    if (o.title) y += svgText(el, o.title, 12, y, W - 24, { size: W < 480 ? 15 : 17, weight: 700, font: FONT.display, fill: C.ink }) + 2;
    if (o.subtitle) y += svgText(el, o.subtitle, 12, y, W - 24, { size: 12, fill: C.ink3 });
    return y + 12;
  }

  /* ---------- bars: horizontal bars drawn to scale from zero ---------- */
  PV.defineViz("bars", (root, o, api) => {
    const cats = o.series ? o.categories : o.items.map((i) => i.label);
    const nSeries = o.series ? o.series.length : 1;
    const all = o.series ? o.series.flatMap((s) => s.values).filter((v) => v != null) : o.items.map((i) => i.value);
    const max = o.max || Math.max(...all) * 1.08;
    const fmt = o.fmt || ((v) => v + (o.unit || ""));
    return responsiveChart(root, o, (W, animate) => {
      const narrow = W < 520;
      const el = svg("svg", { width: W, role: "img", "aria-label": o.title || "bar chart" });
      const top = chartHeader(el, o, W);
      const rowH = o.series ? (narrow ? 18 : 20) : narrow ? 22 : 30;
      const labelW = narrow ? 12 : Math.min(o.labelW || 190, W * 0.36);
      const right = 76;
      const x0 = narrow ? 12 : labelW;
      const x = (v) => x0 + (v / max) * (W - x0 - right);
      const bars = [];
      let y = top;
      const ticksTop = y;
      cats.forEach((cat, ci) => {
        if (narrow) {
          y += svgText(el, cat, 12, y, W - 24, { size: 12.5, fill: C.ink2 }) + 2;
        } else {
          measureCtx.font = `400 12.5px ${FONT.body}`;
          const lines = PV.wrap(measureCtx, cat, labelW - 16);
          const blockH = nSeries * rowH;
          lines.forEach((ln, li) => el.appendChild(svg("text", { x: labelW - 10, y: y + blockH / 2 + (li - (lines.length - 1) / 2) * 15, fill: C.ink2, "font-family": FONT.body, "font-size": 12.5, "text-anchor": "end", "dominant-baseline": "middle" }, ln)));
        }
        for (let si = 0; si < nSeries; si++) {
          const v = o.series ? o.series[si].values[ci] : o.items[ci].value;
          const yy = y + si * rowH;
          if (v == null) continue;
          const item = o.series ? null : o.items[ci];
          const color = o.series ? o.series[si].color : item.color || (item.hi ? api.color : C.line2);
          const r = svg("rect", { x: x0, y: yy + 3, height: rowH - 6, width: animate ? 0 : Math.max(0, x(v) - x0), rx: 4, fill: color });
          const t = svg("text", { x: (animate ? x0 : x(v)) + 6, y: yy + rowH / 2, fill: C.ink, "font-family": FONT.mono, "font-size": 11.5, "dominant-baseline": "middle", opacity: animate ? 0 : 1 }, fmt(v));
          el.append(r, t);
          bars.push({ r, t, w: x(v) - x0 });
        }
        y += nSeries * rowH + (narrow ? 12 : o.series ? 16 : 10);
      });
      // grid + ticks (drawn first so bars sit on top)
      const grid = svg("g");
      niceTicks(0, max, narrow ? 3 : 4).forEach((tk) => {
        grid.appendChild(svg("line", { x1: x(tk), x2: x(tk), y1: ticksTop - 4, y2: y - 4, stroke: C.line, "stroke-width": 1 }));
        grid.appendChild(svg("text", { x: x(tk), y: y + 8, fill: C.ink3, "font-family": FONT.mono, "font-size": 10.5, "text-anchor": "middle" }, fmtTick(tk)));
      });
      el.insertBefore(grid, el.firstChild);
      y += 22;
      if (o.series) {
        let lx = 12, ly = y + 6;
        measureCtx.font = `400 12px ${FONT.body}`;
        o.series.forEach((sr) => {
          const w = 24 + measureCtx.measureText(sr.name).width;
          if (lx + w > W - 12) { lx = 12; ly += 20; }
          el.appendChild(svg("rect", { x: lx, y: ly - 6, width: 12, height: 12, rx: 3, fill: sr.color }));
          el.appendChild(svg("text", { x: lx + 18, y: ly, fill: C.ink2, "font-family": FONT.body, "font-size": 12, "dominant-baseline": "middle" }, sr.name));
          lx += w + 16;
        });
        y = ly + 16;
      }
      el.setAttribute("height", y + 8);
      el.setAttribute("viewBox", `0 0 ${W} ${y + 8}`);
      return {
        el,
        animate: animate ? () => {
          let start = null, raf = 0;
          const step = (now) => {
            if (start == null) start = now;
            const p = PV.easeOut(Math.min(1, (now - start) / 900));
            bars.forEach((b) => {
              b.r.setAttribute("width", Math.max(0, b.w * p));
              b.t.setAttribute("x", x0 + 6 + b.w * p);
              b.t.setAttribute("opacity", p > 0.6 ? 1 : 0);
            });
            if (p < 1) raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
          return raf;
        } : null,
      };
    });
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
    const xs = o.x, ys = o.y;
    const tx = (v) => (xs.log ? Math.log10(v) : v);
    const ty = (v) => (ys.log ? Math.log10(v) : v);
    return responsiveChart(root, o, (W, animate) => {
      const narrow = W < 520;
      const el = svg("svg", { width: W, role: "img", "aria-label": o.title || "line chart" });
      const T = chartHeader(el, o, W) + 6;
      const plotH = narrow ? Math.max(200, W * 0.62) : Math.min(300, Math.max(220, W * 0.42));
      const L = narrow ? 50 : 64, R = narrow ? 16 : o.right || 130, B = 48;
      const H = T + plotH + B;
      const X = (v) => L + ((tx(v) - tx(xs.min)) / (tx(xs.max) - tx(xs.min))) * (W - L - R);
      const Y = (v) => T + plotH - ((ty(v) - ty(ys.min)) / (ty(ys.max) - ty(ys.min))) * plotH;
      const xt = xs.ticks || (xs.log ? logTicks(xs.min, xs.max) : niceTicks(xs.min, xs.max, narrow ? 4 : 5));
      const yt = ys.ticks || (ys.log ? logTicks(ys.min, ys.max) : niceTicks(ys.min, ys.max, 4));
      xt.forEach((v) => {
        el.appendChild(svg("line", { x1: X(v), x2: X(v), y1: T, y2: T + plotH, stroke: C.line, "stroke-width": 1 }));
        el.appendChild(svg("text", { x: X(v), y: T + plotH + 16, fill: C.ink3, "font-size": 10.5, "font-family": FONT.mono, "text-anchor": "middle" }, (xs.fmt || fmtTick)(v)));
      });
      yt.forEach((v) => {
        el.appendChild(svg("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: C.line, "stroke-width": 1 }));
        el.appendChild(svg("text", { x: L - 8, y: Y(v), fill: C.ink3, "font-size": 10.5, "font-family": FONT.mono, "text-anchor": "end", "dominant-baseline": "middle" }, (ys.fmt || fmtTick)(v)));
      });
      measureCtx.font = `400 12px ${FONT.body}`;
      const xl = PV.fit(measureCtx, xs.label || "", W - L - R, 12);
      el.appendChild(svg("text", { x: (L + W - R) / 2, y: T + plotH + 38, fill: C.ink2, "font-size": xl.size, "text-anchor": "middle", "font-family": FONT.body }, xl.text));
      const yl = PV.fit(measureCtx, ys.label || "", plotH, 12);
      el.appendChild(svg("text", { x: 12, y: T + plotH / 2, fill: C.ink2, "font-size": yl.size, "text-anchor": "middle", "font-family": FONT.body, transform: `rotate(-90 12 ${T + plotH / 2})` }, yl.text));
      const paths = [];
      (o.series || []).forEach((sr) => {
        const d = sr.points.map((pt, i) => (i ? "L" : "M") + X(pt[0]).toFixed(1) + " " + Y(pt[1]).toFixed(1)).join(" ");
        const path = svg("path", { d, fill: "none", stroke: sr.color || api.color, "stroke-width": sr.width || 2.5, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": sr.dashed ? "6 6" : null });
        el.appendChild(path);
        paths.push({ path, dashed: sr.dashed });
        if (sr.dots) sr.points.forEach((pt) => el.appendChild(svg("circle", { cx: X(pt[0]), cy: Y(pt[1]), r: 4, fill: sr.color || api.color })));
        if (!narrow) {
          const last = sr.points[sr.points.length - 1];
          el.appendChild(svg("text", { x: X(last[0]) + 8, y: Y(last[1]) + (sr.labelDy || 0), fill: sr.color || api.color, "font-size": 12, "font-weight": 700, "font-family": FONT.body, "dominant-baseline": "middle" }, sr.name));
        }
      });
      (o.marks || []).forEach((m) => {
        el.appendChild(svg("circle", { cx: X(m.x), cy: Y(m.y), r: 5, fill: m.color || C.glow, stroke: C.bg, "stroke-width": 2 }));
        if (narrow) return; // on phones the annotation is written under the legend instead
        const fitted = PV.fit(measureCtx, m.text, W * 0.5, 11.5);
        el.appendChild(svg("text", { x: X(m.x) + (m.dx || 8), y: Y(m.y) + (m.dy || -10), fill: m.color || C.glow, "font-size": fitted.size, "font-family": FONT.body, "text-anchor": m.anchor || "start" }, fitted.text));
      });
      let bottom = H;
      if (narrow) {
        // legend below the plot instead of labels at the line ends
        let lx = 12, ly = H + 4;
        measureCtx.font = `700 12px ${FONT.body}`;
        (o.series || []).forEach((sr) => {
          const w = 26 + measureCtx.measureText(sr.name).width;
          if (lx + w > W - 12) { lx = 12; ly += 20; }
          el.appendChild(svg("line", { x1: lx, x2: lx + 16, y1: ly, y2: ly, stroke: sr.color || api.color, "stroke-width": 3, "stroke-dasharray": sr.dashed ? "4 3" : null }));
          el.appendChild(svg("text", { x: lx + 22, y: ly, fill: sr.color || api.color, "font-size": 12, "font-weight": 700, "font-family": FONT.body, "dominant-baseline": "middle" }, sr.name));
          lx += w + 14;
        });
        bottom = ly + 16;
        (o.marks || []).forEach((m) => {
          bottom += 4;
          el.appendChild(svg("circle", { cx: 18, cy: bottom + 6, r: 5, fill: m.color || C.glow }));
          bottom += svgText(el, m.text.replace(/[→←]/g, "").trim(), 30, bottom, W - 42, { size: 12, fill: m.color || C.glow }) + 4;
        });
      }
      el.setAttribute("height", bottom);
      el.setAttribute("viewBox", `0 0 ${W} ${bottom}`);
      return {
        el,
        animate: animate ? () => {
          paths.forEach(({ path, dashed }) => {
            if (dashed) return;
            const len = path.getTotalLength ? path.getTotalLength() : 1000;
            path.style.strokeDasharray = len;
            path.style.strokeDashoffset = len;
            path.getBoundingClientRect();
            path.style.transition = "stroke-dashoffset 1.3s cubic-bezier(.3,.7,.2,1)";
            requestAnimationFrame(() => (path.style.strokeDashoffset = 0));
          });
          return 0;
        } : null,
      };
    });
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

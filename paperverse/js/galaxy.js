/* The observatory: every paper is a star in a Three.js galaxy.
   Distance from the core = publication date (2017 at the centre, 2026 at the rim).
   Spiral arm = research track. Faint threads = "builds on" lineage. */
(function () {
  const { h } = PV;
  const ARM = { arch: 0, train: 1, reason: 2, speed: 3, inside: 4 };
  const Y0 = 2017;
  let Y1 = 2026.9; // the rim; pushed outward when newer papers arrive

  function yearFrac(p) {
    const [y, m] = (p.date || String(p.year)).split("-").map(Number);
    return (y + ((m || 6) - 1) / 12 - Y0) / (Y1 - Y0);
  }

  PV.initGalaxy = function (wrap) {
    PV.papers.forEach((p) => {
      const [y, m] = (p.date || String(p.year)).split("-").map(Number);
      Y1 = Math.max(Y1, y + ((m || 6) - 1) / 12 + 0.15);
    });
    const THREE = window.THREE;
    let gl = null;
    try {
      const test = document.createElement("canvas");
      gl = test.getContext("webgl2") || test.getContext("webgl");
    } catch (e) { gl = null; }
    if (!THREE || !gl) {
      wrap.appendChild(h("div", { class: "galaxy-fallback" }, "The 3D galaxy needs WebGL, which isn't available here. Every paper is listed below."));
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    wrap.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    const tip = h("div", { class: "galaxy-tip", hidden: true });
    wrap.appendChild(tip);
    wrap.appendChild(h("div", { class: "galaxy-hint" }, "DRAG TO ORBIT · SCROLL TO ZOOM · CLICK A STAR"));
    const legend = h("div", { class: "galaxy-legend" });
    Object.entries(PV.tracks).forEach(([k, t]) => {
      if (k === "primer") return;
      legend.appendChild(h("span", null, h("i", { style: { background: t.color, color: t.color } }), t.name));
    });
    legend.appendChild(h("span", { style: { color: PV.C.ink3, marginTop: "4px" } }, `centre 2017 → rim ${Math.floor(Y1)}`));
    wrap.appendChild(legend);

    /* textures */
    const glowTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d");
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, "rgba(255,255,255,1)");
      grd.addColorStop(0.18, "rgba(255,255,255,0.85)");
      grd.addColorStop(0.45, "rgba(255,255,255,0.22)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      return t;
    })();
    function labelSprite(text, color) {
      const c = document.createElement("canvas");
      const g = c.getContext("2d");
      const font = `700 44px ${PV.FONT.display}`;
      g.font = font;
      const w = Math.ceil(g.measureText(text).width) + 24;
      c.width = w;
      c.height = 64;
      g.font = font;
      g.fillStyle = color;
      g.textBaseline = "middle";
      g.shadowColor = "rgba(0,0,0,0.9)";
      g.shadowBlur = 8;
      g.fillText(text, 12, 34);
      const tex = new THREE.CanvasTexture(c);
      tex.minFilter = THREE.LinearFilter;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 }));
      const k = 0.0105;
      s.scale.set(w * k, 64 * k, 1);
      return s;
    }

    /* background stars */
    {
      const n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      const r = PV.rng(7);
      for (let i = 0; i < n; i++) {
        const u = r() * 2 - 1, th = r() * Math.PI * 2, R = 60 + r() * 90;
        const s = Math.sqrt(1 - u * u);
        pos.set([R * s * Math.cos(th), R * u, R * s * Math.sin(th)], i * 3);
        const b = 0.35 + r() * 0.5;
        col.set([b, b, b * 1.1], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.5, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    }

    const galaxy = new THREE.Group();
    scene.add(galaxy);

    /* spiral-arm dust */
    const armAngle = (arm, r) => (arm / 5) * Math.PI * 2 + r * 0.42;
    {
      const n = 9000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      const r = PV.rng(42);
      const keys = Object.keys(ARM);
      for (let i = 0; i < n; i++) {
        const arm = i % 5;
        const R = 0.6 + Math.pow(r(), 0.8) * 10.5;
        const spread = 0.18 + R * 0.05;
        const a = armAngle(arm, R) + (r() - 0.5) * spread * 1.4;
        const jitter = (r() - 0.5) * spread;
        pos.set([Math.cos(a) * R + jitter, (r() - 0.5) * 0.35 * (1.2 - R / 12), Math.sin(a) * R + jitter], i * 3);
        const c = new THREE.Color(PV.tracks[keys[arm]].color);
        const fade = 0.25 + r() * 0.45;
        col.set([c.r * fade, c.g * fade, c.b * fade], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      galaxy.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.13, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    }

    /* year rings */
    const ringR = (fr) => 1.1 + fr * 9.4;
    [2020, 2023, 2026, 2029, 2032].filter((y) => y <= Y1).forEach((y) => {
      const R = ringR((y - Y0) / (Y1 - Y0));
      const pts = [];
      for (let i = 0; i <= 128; i++) pts.push(new THREE.Vector3(Math.cos((i / 128) * Math.PI * 2) * R, 0, Math.sin((i / 128) * Math.PI * 2) * R));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x33466b, transparent: true, opacity: 0.35 }));
      galaxy.add(line);
      const lab = labelSprite(String(y), "#7d8ba6");
      lab.material.opacity = 0.55;
      lab.scale.multiplyScalar(0.7);
      lab.position.set(R + 0.1, 0.05, 0.25);
      galaxy.add(lab);
    });

    /* core */
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe9b8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    core.scale.set(2.6, 2.6, 1);
    galaxy.add(core);

    /* paper stars */
    const stars = [];
    const perSlot = {};
    PV.papers.forEach((p) => {
      let pos;
      if (p.track === "primer") pos = new THREE.Vector3(0, 1.6, 0);
      else {
        const fr = yearFrac(p);
        const R = ringR(fr);
        const key = p.track + Math.round(fr * 20);
        const k = (perSlot[key] = (perSlot[key] || 0) + 1) - 1;
        const a = armAngle(ARM[p.track], R) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.16;
        pos = new THREE.Vector3(Math.cos(a) * R, 0.25 + ((p.signals ? p.signals.impact : 3) - 3) * 0.12, Math.sin(a) * R);
      }
      const color = new THREE.Color(PV.tracks[p.track].color);
      const size = p.track === "primer" ? 1.5 : 0.7 + (p.signals ? p.signals.impact : 3) * 0.13;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      spr.scale.set(size, size, 1);
      spr.position.copy(pos);
      spr.userData = { paper: p, base: size, phase: Math.random() * 6 };
      galaxy.add(spr);
      // bright pinpoint centre
      const pin = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pin.scale.set(size * 0.28, size * 0.28, 1);
      pin.position.copy(pos);
      galaxy.add(pin);
      const lab = labelSprite(p.short || p.title, PV.tracks[p.track].color);
      lab.position.copy(pos).add(new THREE.Vector3(0, size * 0.42 + 0.18, 0));
      lab.material.opacity = p.era === "frontier" || p.track === "primer" ? 0.95 : 0.62;
      galaxy.add(lab);
      stars.push({ spr, lab, p, pos });
    });

    /* lineage threads */
    const threads = [];
    stars.forEach((s) => {
      (s.p.builds || []).forEach((id) => {
        const t = stars.find((x) => x.p.id === id);
        if (!t) return;
        const mid = s.pos.clone().add(t.pos).multiplyScalar(0.5);
        mid.y += 0.8 + s.pos.distanceTo(t.pos) * 0.12;
        const curve = new THREE.QuadraticBezierCurve3(t.pos, mid, s.pos);
        const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));
        const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(PV.tracks[s.p.track].color), transparent: true, opacity: 0.14 });
        const line = new THREE.Line(geo, mat);
        galaxy.add(line);
        threads.push({ line, a: s.p.id, b: t.p.id });
      });
    });

    /* camera orbit */
    let theta = 0.9, phi = 1.02, radius = 19, targetR = 19;
    let autoSpin = !PV.reduceMotion, dragging = false, lastX = 0, lastY = 0, moved = 0, paused = false;
    const cvs = renderer.domElement;
    cvs.setAttribute("aria-label", "3D galaxy of research papers. Every paper is also listed below.");
    cvs.setAttribute("role", "img");
    cvs.addEventListener("pointerdown", (e) => { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; cvs.setPointerCapture(e.pointerId); });
    cvs.addEventListener("pointermove", (e) => {
      const r = cvs.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      mouse.px = e.clientX - r.left;
      mouse.py = e.clientY - r.top;
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      theta -= dx * 0.006;
      phi = PV.clamp(phi - dy * 0.005, 0.25, 1.45);
      lastX = e.clientX; lastY = e.clientY;
      if (moved > 4) autoSpin = false;
    });
    cvs.addEventListener("pointerup", () => {
      dragging = false;
      if (moved < 6 && hovered) PV.openDeck(hovered.p.id, 0);
    });
    cvs.addEventListener("pointerleave", () => { mouse.x = 9; hovered = null; tip.hidden = true; });
    cvs.addEventListener("wheel", (e) => {
      e.preventDefault();
      targetR = PV.clamp(targetR * (1 + Math.sign(e.deltaY) * 0.08), 7, 34);
    }, { passive: false });

    const ray = new THREE.Raycaster();
    const mouse = { x: 9, y: 9, px: 0, py: 0 };
    let hovered = null;

    function resize() {
      const r = wrap.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / Math.max(1, r.height);
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(wrap);
    resize();

    let visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(wrap);
    PV.galaxyPause = (v) => { paused = v; };

    const clock = new THREE.Clock();
    function tick() {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, clock.getDelta());
      if (paused || !visible || document.hidden) return;
      const t = clock.elapsedTime;
      if (autoSpin) theta += dt * 0.05;
      radius += (targetR - radius) * 0.08;
      camera.position.set(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
      camera.lookAt(0, 0, 0);
      galaxy.rotation.y += dt * 0.012;
      core.scale.setScalar(2.6 + Math.sin(t * 1.3) * 0.15);

      ray.setFromCamera(mouse, camera);
      const hits = ray.intersectObjects(stars.map((s) => s.spr));
      const now = hits.length ? stars.find((s) => s.spr === hits[0].object) : null;
      if (now !== hovered) {
        hovered = now;
        threads.forEach((th) => {
          const on = hovered && (th.a === hovered.p.id || th.b === hovered.p.id);
          th.line.material.opacity = on ? 0.75 : hovered ? 0.05 : 0.14;
        });
        cvs.style.cursor = hovered ? "pointer" : "";
        if (hovered) {
          const p = hovered.p;
          tip.innerHTML = "";
          tip.append(h("span", { style: { color: PV.tracks[p.track].color, fontFamily: PV.FONT.mono, fontSize: "0.66rem", letterSpacing: "0.1em", textTransform: "uppercase" } }, `${PV.tracks[p.track].name} · ${p.year}`),
            h("b", null, p.title), h("span", { style: { color: PV.C.ink2 } }, p.oneLiner));
          tip.hidden = false;
        } else tip.hidden = true;
      }
      if (hovered) {
        tip.style.left = PV.clamp(mouse.px, 130, wrap.clientWidth - 130) + "px";
        tip.style.top = Math.max(110, mouse.py) + "px";
      }
      stars.forEach((s) => {
        const hot = s === hovered;
        const k = s.spr.userData.base * (hot ? 1.6 : 1 + 0.07 * Math.sin(t * 2 + s.spr.userData.phase));
        s.spr.scale.set(k, k, 1);
        s.lab.material.opacity = hot ? 1 : s.p.era === "frontier" || s.p.track === "primer" ? 0.95 : 0.62;
      });
      renderer.render(scene, camera);
    }
    tick();
  };
})();

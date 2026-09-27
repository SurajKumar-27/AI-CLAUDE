/* 3D scenes (Three.js) + the default cover animation. */
(function () {
  const { h, C, FONT } = PV;

  /* Shared Three.js harness: renderer, orbit-by-drag, resize, clean disposal. */
  PV.three = function (root, setup, o = {}) {
    const THREE = window.THREE;
    let ok = false;
    try { const c = document.createElement("canvas"); ok = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) {}
    if (!THREE || !ok) {
      root.appendChild(h("div", { class: "galaxy-fallback" }, "This 3D scene needs WebGL, which isn't available in this browser. The text on the left covers the same idea."));
      return () => {};
    }
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    root.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(o.fov || 45, 1, 0.1, 500);
    const orbit = { theta: o.theta ?? 0.7, phi: o.phi ?? 1.1, r: o.r ?? 12, target: new THREE.Vector3(...(o.target || [0, 0, 0])), spin: o.spin ?? 0.08 };
    let drag = false, lx = 0, ly = 0, alive = true, userMoved = false;
    const el = renderer.domElement;
    el.addEventListener("pointerdown", (e) => { drag = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      orbit.theta -= (e.clientX - lx) * 0.007;
      orbit.phi = PV.clamp(orbit.phi - (e.clientY - ly) * 0.006, 0.2, 1.5);
      lx = e.clientX; ly = e.clientY; userMoved = true;
    });
    el.addEventListener("pointerup", () => (drag = false));
    el.addEventListener("wheel", (e) => { e.preventDefault(); orbit.r = PV.clamp(orbit.r * (1 + Math.sign(e.deltaY) * 0.07), (o.r ?? 12) * 0.5, (o.r ?? 12) * 2); }, { passive: false });
    const resize = () => {
      const r = root.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / Math.max(1, r.height);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(root);
    resize();
    const glow = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, "rgba(255,255,255,1)");
      grd.addColorStop(0.3, "rgba(255,255,255,0.6)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const label = (text, color, scale = 0.012, size = 40) => {
      const c = document.createElement("canvas");
      const g = c.getContext("2d");
      const font = `700 ${size}px ${FONT.body}`;
      g.font = font;
      c.width = Math.ceil(g.measureText(text).width) + 16;
      c.height = size + 20;
      g.font = font;
      g.fillStyle = color;
      g.textBaseline = "middle";
      g.shadowColor = "rgba(0,0,0,.9)";
      g.shadowBlur = 6;
      g.fillText(text, 8, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.minFilter = THREE.LinearFilter;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.scale.set(c.width * scale, c.height * scale, 1);
      return s;
    };
    const ctx = { THREE, scene, camera, renderer, glow, label, orbit, root };
    const update = setup(ctx) || (() => {});
    const clock = new THREE.Clock();
    let raf;
    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;
      if (!userMoved && !PV.reduceMotion) orbit.theta += dt * orbit.spin;
      camera.position.set(
        orbit.target.x + orbit.r * Math.sin(orbit.phi) * Math.cos(orbit.theta),
        orbit.target.y + orbit.r * Math.cos(orbit.phi),
        orbit.target.z + orbit.r * Math.sin(orbit.phi) * Math.sin(orbit.theta));
      camera.lookAt(orbit.target);
      update(t, dt);
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
      });
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) {}
    };
  };

  /* ---------- 3D embedding space: words as points, meaning as direction ---------- */
  PV.defineViz("embed3d", (root, o, api) => {
    const groups = [
      { name: "royalty", color: C.arch, words: [["king", 3.2, 2.2, 0.4], ["queen", 3.2, 2.2, 2.4], ["prince", 2.4, 1.6, 0.6], ["princess", 2.4, 1.6, 2.6], ["throne", 3.8, 2.9, 1.3]] },
      { name: "people", color: C.train, words: [["man", 0.6, -0.4, 0.4], ["woman", 0.6, -0.4, 2.4], ["boy", -0.2, -1.0, 0.6], ["girl", -0.2, -1.0, 2.6]] },
      { name: "animals", color: C.speed, words: [["cat", -3.4, 1.0, -2.2], ["dog", -3.0, 1.4, -2.8], ["kitten", -3.9, 0.4, -1.8], ["puppy", -3.5, 0.8, -3.3], ["wolf", -2.4, 2.1, -3.2]] },
      { name: "places", color: C.reason, words: [["Paris", 1.6, -2.6, -3.0], ["France", 2.6, -1.9, -3.2], ["Tokyo", 0.4, -3.1, -2.2], ["Japan", 1.4, -2.4, -2.4], ["Delhi", -0.4, -2.8, -3.4], ["India", 0.6, -2.1, -3.6]] },
      { name: "code", color: C.inside, words: [["python", -2.8, -2.2, 2.4], ["function", -3.4, -1.4, 3.0], ["bug", -2.2, -1.2, 3.4], ["compile", -3.8, -2.4, 1.8]] },
    ];
    const cap = PV.caption(root, "<b>Each dot is a word.</b> Similar meanings sit close together. Drag to spin.");
    let showArrows = true;
    const cleanup = PV.three(root, ({ THREE, scene, glow, label }) => {
      const pts = [];
      groups.forEach((g) => g.words.forEach(([w, x, y, z]) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(g.color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.scale.set(0.55, 0.55, 1);
        s.position.set(x, y, z);
        scene.add(s);
        const l = label(w, g.color, 0.011);
        l.position.set(x, y + 0.42, z);
        scene.add(l);
        pts.push({ w, v: new THREE.Vector3(x, y, z) });
      }));
      // faint axes grid
      const grid = new THREE.GridHelper(10, 10, 0x33466b, 0x1a2640);
      grid.position.y = -4;
      scene.add(grid);
      const get = (w) => pts.find((p) => p.w === w).v;
      const arrows = new THREE.Group();
      scene.add(arrows);
      const mkArrow = (a, b, color) => {
        const dir = get(b).clone().sub(get(a));
        const ar = new THREE.ArrowHelper(dir.clone().normalize(), get(a), dir.length() - 0.2, new THREE.Color(color), 0.3, 0.18);
        arrows.add(ar);
      };
      mkArrow("man", "woman", C.glow);
      mkArrow("king", "queen", C.glow);
      mkArrow("boy", "girl", C.glow);
      mkArrow("France", "Paris", C.reason);
      mkArrow("Japan", "Tokyo", C.reason);
      mkArrow("India", "Delhi", C.reason);
      return (t) => { arrows.visible = showArrows; };
    }, { r: 14, phi: 1.2 });
    const ctl = PV.controls(root);
    ctl.button("Show meaning arrows", (b) => { showArrows = !showArrows; b.setAttribute("aria-pressed", String(showArrows)); }, { pressed: true });
    ctl.note("Yellow arrows: “male → female” points the same way everywhere. Blue: “country → capital”.");
    return cleanup;
  });

  /* ---------- 3D loss landscape: gradient descent as a ball rolling downhill ---------- */
  PV.defineViz("landscape3d", (root, o, api) => {
    const f = (x, z) => 0.18 * (x * x + z * z) * 0.35 + 1.1 * Math.sin(x * 0.9) * Math.cos(z * 0.8) + 0.5 * Math.cos(x * 1.7 + 0.5) * 0.6 + 2.2;
    const grad = (x, z) => {
      const e = 1e-3;
      return [(f(x + e, z) - f(x - e, z)) / (2 * e), (f(x, z + e) - f(x, z - e)) / (2 * e)];
    };
    let lr = 0.12, ball = { x: 3.6, z: 3.1 }, trail = [], reset = () => { ball = { x: 3.4 + Math.random() * 0.8, z: 2.6 + Math.random() * 1.2 }; trail = []; };
    const cap = PV.caption(root, "<b>Height = how wrong the model is (the loss).</b> Training rolls the ball downhill, one small step at a time.");
    const cleanup = PV.three(root, ({ THREE, scene, glow }) => {
      const N = 70, S = 10;
      const geo = new THREE.PlaneGeometry(S, S, N, N);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const lo = new THREE.Color(C.reason), hi = new THREE.Color(C.train);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), y = f(x, z);
        pos.setY(i, y);
        const c = lo.clone().lerp(hi, PV.clamp((y - 0.8) / 3.4, 0, 1));
        colors.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
      scene.add(mesh);
      const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0c1322, wireframe: true, transparent: true, opacity: 0.25 }));
      scene.add(wire);
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const dl = new THREE.DirectionalLight(0xffffff, 0.9);
      dl.position.set(4, 8, 3);
      scene.add(dl);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffe9b8, emissiveIntensity: 0.6 }));
      scene.add(sphere);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffe9b8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.set(1, 1, 1);
      scene.add(halo);
      const trailGeo = new THREE.BufferGeometry();
      const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffe9b8 }));
      scene.add(trailLine);
      let acc = 0;
      return (t, dt) => {
        acc += dt;
        if (acc > 0.09) {
          acc = 0;
          const [gx, gz] = grad(ball.x, ball.z);
          ball.x = PV.clamp(ball.x - lr * gx * 3, -4.9, 4.9);
          ball.z = PV.clamp(ball.z - lr * gz * 3, -4.9, 4.9);
          trail.push(new THREE.Vector3(ball.x, f(ball.x, ball.z) + 0.05, ball.z));
          if (trail.length > 120) trail.shift();
          trailGeo.setFromPoints(trail);
          const loss = f(ball.x, ball.z);
          cap.set(`<b>Loss ${loss.toFixed(2)}</b> · each step moves the weights a little way downhill. Too big a step and the ball bounces around; too small and it crawls.`);
        }
        const y = f(ball.x, ball.z) + 0.16;
        sphere.position.set(ball.x, y, ball.z);
        halo.position.copy(sphere.position);
      };
    }, { r: 13, phi: 0.95, target: [0, 1.5, 0] });
    const ctl = PV.controls(root);
    ctl.slider("Step size", { min: 0.02, max: 0.6, step: 0.02, value: lr, fmt: (v) => v.toFixed(2), onInput: (v) => (lr = v) });
    ctl.button("Drop a new ball", reset);
    return cleanup;
  });

  /* ---------- 3D transformer stack: tokens rise through layers, attention arcs inside ---------- */
  PV.defineViz("stack3d", (root, o, api) => {
    const words = o.words || ["The", "cat", "sat", "on", "the", "mat"];
    const layers = o.layers || 6;
    const cap = PV.caption(root, o.caption || "<b>Words rise through a stack of layers.</b> Inside each layer, glowing arcs are attention: words looking at other words.");
    return PV.three(root, ({ THREE, scene, glow, label }) => {
      const col = new THREE.Color(api.color);
      const W = words.length, gap = 1.25, lh = 1.1;
      const x0 = -((W - 1) * gap) / 2;
      for (let l = 0; l < layers; l++) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(W * gap + 0.6, 0.06, 2.2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08 + (l % 2) * 0.03 }));
        plate.position.set(0, l * lh, 0);
        scene.add(plate);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(plate.geometry), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.35 }));
        edges.position.copy(plate.position);
        scene.add(edges);
      }
      words.forEach((w, i) => {
        const l = label(w, C.ink, 0.012);
        l.position.set(x0 + i * gap, -0.7, 0.9);
        scene.add(l);
      });
      const out = label(o.output || "→ next word?", C.glow, 0.013);
      out.position.set(0, layers * lh + 0.2, 0);
      scene.add(out);
      // particles for each token column
      const parts = [];
      for (let i = 0; i < W; i++) for (let k = 0; k < 3; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.scale.set(0.35, 0.35, 1);
        scene.add(s);
        parts.push({ s, i, off: k / 3 + Math.random() * 0.1 });
      }
      // attention arcs (rebuilt every so often)
      const arcGroup = new THREE.Group();
      scene.add(arcGroup);
      const rnd = PV.rng(3);
      let lastBuild = -10;
      function buildArcs(t) {
        arcGroup.children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
        arcGroup.clear();
        for (let l = 0; l < layers; l++) {
          for (let a = 0; a < 3; a++) {
            const q = 1 + Math.floor(rnd() * (W - 1));
            const k = Math.floor(rnd() * q);
            const p1 = new THREE.Vector3(x0 + q * gap, l * lh + 0.05, 0);
            const p2 = new THREE.Vector3(x0 + k * gap, l * lh + 0.05, 0);
            const mid = p1.clone().add(p2).multiplyScalar(0.5);
            mid.y += 0.35 + Math.abs(q - k) * 0.12;
            mid.z += 0.4;
            const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), new THREE.LineBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0.2 + rnd() * 0.6 }));
            arcGroup.add(line);
          }
        }
      }
      return (t) => {
        if (t - lastBuild > 1.6) { lastBuild = t; buildArcs(t); }
        parts.forEach((p) => {
          const u = (t * 0.25 + p.off) % 1;
          p.s.position.set(x0 + p.i * gap, -0.3 + u * (layers * lh + 0.3), 0);
          p.s.material.opacity = Math.sin(u * Math.PI);
        });
      };
    }, { r: 13, phi: 1.2, theta: 1.35, target: [0, (o.layers || 6) * 0.5, 0], spin: 0.12 });
  });

  /* ---------- default cover: an orbiting constellation of the deck's key words ---------- */
  PV.defineViz("orbit", (root, o, api) => {
    const words = (api.paper && api.paper.tags) || ["attention", "tokens", "layers"];
    const rnd = PV.rng(11);
    const dots = Array.from({ length: 90 }, () => ({ r: 30 + rnd() * 200, a: rnd() * 7, s: 0.1 + rnd() * 0.4, z: rnd() }));
    const st = PV.canvasLoop(root, (ctx, W, H, t) => {
      const cx = W / 2, cy = H / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.45);
      g.addColorStop(0, PV.alpha(api.color, 0.35));
      g.addColorStop(1, PV.alpha(api.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      dots.forEach((d) => {
        const a = d.a + t * d.s * 0.4;
        const x = cx + Math.cos(a) * d.r * (W / 560), y = cy + Math.sin(a) * d.r * 0.45 * (H / 420);
        ctx.fillStyle = PV.alpha(api.color, 0.25 + d.z * 0.6);
        ctx.beginPath();
        ctx.arc(x, y, 1 + d.z * 2, 0, 7);
        ctx.fill();
      });
      words.forEach((w, i) => {
        const a = t * 0.18 + (i / words.length) * Math.PI * 2;
        const rx = Math.min(W * 0.36, 260), ry = Math.min(H * 0.3, 150);
        const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        const depth = (Math.sin(a) + 1) / 2;
        PV.text(ctx, w, x, y, { size: 13 + depth * 7, weight: 700, color: api.color, align: "center", alpha: 0.45 + depth * 0.55 });
      });
      ctx.fillStyle = C.glow;
      ctx.shadowColor = C.glow;
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(cx, cy, 10 + Math.sin(t * 2) * 1.5, 0, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    return () => st.stop();
  });
})();

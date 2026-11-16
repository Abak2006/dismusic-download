// Dismusic site: progressive enhancement only. Without this script the page is complete and readable.
(() => {
  document.documentElement.classList.add("js");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Routing diagram: which wires and nodes light up for each step ----
  const ROUTES = {
    1: ["b-hp", "g-sp"],                 // per-app output: browser → headphones, game → speakers
    2: ["m-hp", "m-sp", "m-tv"],         // multi-output: music on all three
    3: ["b-tv"],                         // screen follow: browser window dragged onto the TV
    4: ["m-hp"],                         // enhance: music, bass-boosted, to headphones
  };
  const flow = document.querySelector(".flow");
  function setStep(step) {
    if (!flow) return;
    flow.dataset.step = step;
    const lit = new Set(ROUTES[step] || []);
    const nodes = new Set();
    flow.querySelectorAll(".wires path").forEach(p => {
      const on = lit.has(p.dataset.r);
      p.classList.toggle("on", on);
      if (on) p.dataset.r.split("-").forEach(n => nodes.add(n));
    });
    flow.querySelectorAll(".node").forEach(n => n.classList.toggle("on", nodes.has(n.dataset.n)));
    flow.querySelectorAll(".flow-steps li").forEach(li => li.classList.toggle("active", li.dataset.step === String(step)));
  }
  setStep(1);

  // ---- Equalizer: settle into each preset's real curve ----
  const eq = document.querySelector(".eq-section");
  function setPreset(li) {
    if (!eq || !li) return;
    const gains = li.dataset.bands.split(",").map(Number);
    eq.querySelectorAll(".band").forEach((b, i) => b.style.setProperty("--g", gains[i] ?? 0));
    eq.querySelector(".eq-name").textContent = li.querySelector("h3").textContent;
    eq.querySelector(".eq-vol").textContent = `Volume ${li.dataset.vol}%`;
    eq.querySelectorAll(".presets li").forEach(x => x.classList.toggle("active", x === li));
  }
  setPreset(document.querySelector(".presets li"));

  // Whichever step crosses the middle band of the screen becomes active.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        if (el.closest(".flow-steps")) setStep(Number(el.dataset.step));
        else setPreset(el);
      }
    }, { rootMargin: "-45% 0px -45% 0px" });
    document.querySelectorAll(".flow-steps li, .presets li").forEach(el => io.observe(el));
  }

  // ---- Scroll-linked: level meter and screenshots that tilt flat as they arrive ----
  const meter = document.querySelector(".meter span");
  const tilts = [...document.querySelectorAll(".tilt")];
  let ticking = false;
  function onScroll() {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (meter) meter.style.setProperty("--progress", max > 0 ? Math.min(1, scrollY / max) : 0);
    if (reduce) return;
    for (const el of tilts) {
      const r = el.getBoundingClientRect();
      // 1 when the element's top is at the bottom of the screen, 0 once it reaches 60% up.
      const t = (r.top - innerHeight * 0.4) / (innerHeight * 0.6);
      el.style.setProperty("--tilt", Math.max(0, Math.min(1, t)).toFixed(3));
    }
  }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener("resize", onScroll);
  onScroll();

  // ---- Copy the file fingerprint ----
  document.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const el = document.getElementById(btn.dataset.copy);
      const text = el.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied";
      } catch {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
        btn.textContent = "Press Ctrl+C";
      }
      setTimeout(() => (btn.textContent = "Copy"), 2000);
    });
  });

  // ---- Hero: a 10-band spectrum analyzer, the same bands as the app's equalizer ----
  const canvas = document.querySelector(".spectrum");
  if (!canvas || reduce) return;
  const ctx = canvas.getContext("2d");
  const BANDS = 10, BARS_PER_BAND = 6, N = BANDS * BARS_PER_BAND;
  const colors = ["#3d6bff", "#22d3ee", "#5eead4", "#fbbf24"];
  const level = new Float32Array(N);
  let w = 0, h = 0, dpr = 1, visible = true, boost = 0, lastY = scrollY;

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function lerpColor(t) {
    const x = t * (colors.length - 1), i = Math.min(colors.length - 2, Math.floor(x)), f = x - i;
    const a = parseInt(colors[i].slice(1), 16), b = parseInt(colors[i + 1].slice(1), 16);
    const ch = s => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  const barColors = Array.from({ length: N }, (_, i) => lerpColor(i / (N - 1)));

  function frame(t) {
    if (!visible) return;
    // Scrolling "plays" the analyzer a little louder.
    boost = Math.max(0, boost * 0.92);
    ctx.clearRect(0, 0, w, h);
    const gap = Math.max(2, w / N * 0.28), bw = w / N - gap;
    for (let i = 0; i < N; i++) {
      const f = i / N;
      // A music-like spectrum: more energy in the lows, moving at a few slow rates.
      const target = (0.5 - f * 0.28)
        + 0.18 * Math.sin(t / 620 + i * 0.55)
        + 0.12 * Math.sin(t / 290 + i * 1.7)
        + 0.08 * Math.sin(t / 150 + i * 3.1)
        + boost * (0.6 - f * 0.3);
      level[i] += (Math.max(0.04, Math.min(1, target)) - level[i]) * 0.18;
      const bh = level[i] * h;
      ctx.fillStyle = barColors[i];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(i * (bw + gap) + gap / 2, h - bh, bw, bh);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(i * (bw + gap) + gap / 2, h - bh - 6, bw, 2); // peak cap
    }
    requestAnimationFrame(frame);
  }
  new IntersectionObserver(([e]) => {
    const was = visible; visible = e.isIntersecting;
    if (visible && !was) requestAnimationFrame(frame);
  }).observe(canvas);
  addEventListener("scroll", () => { boost = Math.min(0.5, boost + Math.abs(scrollY - lastY) / 900); lastY = scrollY; }, { passive: true });
  addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
})();

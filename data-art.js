/* Homepage data art: a cloud of grey data points drawn from a 2D Gaussian,
   whose outermost points are red.

   At the top of the page the cloud is round and at full strength behind the
   landing view; on the first visit of a session it builds up from the centre
   outwards and its outliers turn red. Scrolling down zooms into it while it
   stretches into a tall ellipse and fades into a faint background, and once
   the fade is under way it turns slightly upright (scrolling back up reverses
   this); further scrolling moves vertically along the distribution, from
   its dense centre towards its sparse tail.
   With reduced motion the cloud is a still, faint background from the start.

   The cloud is drawn on a canvas and redrawn at most once per frame, only
   while something changes (scrolling, the waves or the build-up), so it stays
   smooth on phones. */
(function () {
  "use strict";

  var doc = document.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var narrow = window.matchMedia ? window.matchMedia("(max-width: 700px)") : { matches: false };
  // Phones and tablets: touch is the main input and there is no hover.
  var touch = !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);

  // The build-up animation plays once per browser session.
  var buildUp = false;
  if (!reduce) {
    try {
      buildUp = !sessionStorage.getItem("intro");
      sessionStorage.setItem("intro", "1");
    } catch (e) { buildUp = true; }
  }

  var canvas = document.createElement("canvas");
  canvas.className = "dataart";
  canvas.setAttribute("aria-hidden", "true");
  var ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx || !window.Path2D) return;
  document.body.insertBefore(canvas, document.body.firstChild);

  // Colours come from the theme's custom properties in styles.css.
  var colour = {};
  function readColours() {
    var cs = getComputedStyle(doc);
    colour.dot = cs.getPropertyValue("--intro-dot").trim() || "#9aa0a6";
    colour.red = cs.getPropertyValue("--intro-red").trim() || "#e34948";
    colour.flash = cs.getPropertyValue("--intro-flash").trim() || colour.red;
  }
  readColours();

  /* ------------------------------------------------------------- points */
  // Seeded generator, so the cloud looks the same on every visit.
  var seed = 7;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function gauss() {
    var u = rand() || 1e-9, v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  var N = 700, OUTLIERS = 10;
  var pts = [];
  // A main cluster plus two smaller off-centre ones, for an irregular outline.
  for (var i = 0; i < N; i++) {
    var u = rand(), a, b;
    if (u < 0.86) { a = gauss(); b = gauss(); }
    else if (u < 0.94) { a = 0.6 + 0.6 * gauss(); b = -0.35 + 0.55 * gauss(); }
    else { a = -0.55 + 0.55 * gauss(); b = 0.5 + 0.6 * gauss(); }
    pts.push({ a: a, b: b, r: Math.sqrt(a * a + b * b), j: rand() });
  }
  // The outermost points (largest Mahalanobis distance) are the red ones.
  pts.slice().sort(function (p, q) { return q.r - p.r; })
    .slice(0, OUTLIERS).forEach(function (p) { p.fringe = true; });
  // Keep a little clear space around each outlier, so it stands alone.
  var fringe = pts.filter(function (p) { return p.fringe; });
  pts = pts.filter(function (p) {
    return p.fringe || fringe.every(function (f) {
      var da = p.a - f.a, db = p.b - f.b;
      return da * da + db * db > 0.35 * 0.35;
    });
  });
  // On touch devices, keep every other grey point to lighten the animation.
  // Thinning after generation keeps the cloud's shape and its red outliers.
  if (touch) pts = pts.filter(function (p, i) { return p.fringe || i % 2 === 0; });
  var rMax = 0;
  pts.forEach(function (p) { rMax = Math.max(rMax, p.r); });
  pts.forEach(function (p) { p.delay = 350 + (p.r / rMax) * 700 + p.j * 150; });

  // The data manifold: a curved sheet the points lie on, drawn as a
  // wireframe mesh. `warp` bends the plane with a gentle dome and a soft
  // ripple; it is applied to both the mesh and the points.
  // `phase` makes slow waves travel across the sheet: a diagonal wave that
  // sways the surface sideways, and a faint pulse spreading from the centre.
  // Because the points are placed on the sheet, they ride the same waves.
  var phase = 0, waveAmp = 1;
  function warp(a, b) {
    var r = Math.sqrt(a * a + b * b);
    var dome = 1 + 0.18 * Math.exp(-(a * a + b * b) / 2.2) + 0.02 * waveAmp * Math.sin(1.5 * r - 0.8 * phase);
    var s = 0.035 * waveAmp * Math.sin(1.3 * (0.8 * a + 0.6 * b) - phase);
    return [a * dome + 0.1 * Math.sin(1.1 * b + 0.4) - 0.6 * s,
            b * dome + 0.12 * Math.sin(1.3 * a + 0.6) + 0.8 * s];
  }
  // Each mesh line is a polyline of short segments; `lv` holds each segment's
  // step of the edge fade (see place()).
  var EXTENT = 3.2, STEP = 0.4, SEGS = 48, LEVELS = 16, MESH = [];
  function meshLine(along, at) {
    return { along: along, at: at, xs: new Float64Array(SEGS + 1), ys: new Float64Array(SEGS + 1), lv: new Uint8Array(SEGS) };
  }
  for (var m = -EXTENT; m <= EXTENT + 1e-9; m += STEP) MESH.push(meshLine("a", m), meshLine("b", m));

  /* -------------------------------------------------------------- easing */
  // CSS timing functions, so the timings match the original animations.
  function cubic(x1, y1, x2, y2) {
    function bez(u, p1, p2) { return ((1 + 3 * p1 - 3 * p2) * u + (3 * p2 - 6 * p1)) * u * u + 3 * p1 * u; }
    return function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      var lo = 0, hi = 1, s = t;
      for (var n = 0; n < 20; n++) { s = (lo + hi) / 2; if (bez(s, x1, x2) < t) lo = s; else hi = s; }
      return bez(s, y1, y2);
    };
  }
  var easeOut = cubic(0, 0, 0.58, 1), easeInOut = cubic(0.42, 0, 0.58, 1);
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* -------------------------------------------------------------- layout */
  // `progress` runs from 0 (at the top of the page) to 1 (a faint
  // background). Along the way three overlapping stages each ease from 0 to 1
  // over their own share of it:
  // - zoom: the cloud grows and stretches into a tall ellipse in one motion
  //   (one standard deviation ends at 45% of the screen height but only a
  //   fraction of its width, `sxEnd`), and moves to the centre of the screen;
  // - fade: it fades into the background from the first scroll, finishing
  //   before the name has reached the middle of the screen (applied in
  //   draw());
  // - twirl: once the fade is under way, the tilt eases out and the cloud
  //   turns upright.
  var ZOOM = [0, 0.6], FADE = [0, 0.6], TWIRL = [0.2, 1];
  function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
  function stage(k, range) {
    return ease(Math.min(1, Math.max(0, (k - range[0]) / (range[1] - range[0]))));
  }
  var W = 0, H = 0, sxEnd, placedK = -1, placedPhase = -1;
  // Positions only change with the transition and the waves; scrolling past
  // it only moves the view, so the points and mesh are placed again only then.
  function place(k) {
    if (k === placedK && phase === placedPhase) return;
    placedK = k; placedPhase = phase;
    var zoom = stage(k, ZOOM), tw = stage(k, TWIRL);
    // The waves are gentler once the cloud is a large background.
    waveAmp = 1 - 0.6 * tw;
    // At the top the cloud is a wide, slightly tilted ellipse.
    var base = Math.min(W, H) * 0.085;
    var sx = base * 1.12 + (sxEnd - base * 1.12) * zoom;
    var sy = base * 0.92 + (H * 0.45 - base * 0.92) * zoom;
    var tilt = -0.25 * (1 - tw), ct = Math.cos(tilt), st = Math.sin(tilt);
    // At first the cloud sits in the empty space above the hero (40% of the
    // screen height); as it zooms it moves to the centre of the screen.
    var cx = W / 2, cy = H * (0.4 + 0.1 * zoom);
    // Points and mesh both sit on the warped sheet.
    pts.forEach(function (p) {
      var w = warp(p.a, p.b), u = w[0] * sx, v = w[1] * sy;
      p.x = cx + u * ct - v * st; p.y = cy + u * st + v * ct;
    });
    // The mesh dissolves at its edges: a soft radial fade (opaque centre,
    // 80% at 55% of the way out, transparent at the edge) over an ellipse
    // that follows the sheet's shape, reaching ~3 SD. Each segment takes the
    // fade at its midpoint, rounded to one of LEVELS steps.
    var rx = sx * EXTENT * 1.05, ry = sy * EXTENT * 1.05;
    function fadeAt(x, y) {
      var dx = x - cx, dy = y - cy, fu = (dx * ct + dy * st) / rx, fv = (dy * ct - dx * st) / ry;
      var d = Math.sqrt(fu * fu + fv * fv);
      return d < 0.55 ? 1 - 0.2 * d / 0.55 : d < 1 ? 0.8 * (1 - d) / 0.45 : 0;
    }
    MESH.forEach(function (line) {
      for (var j = 0; j <= SEGS; j++) {
        var t = -EXTENT + 2 * EXTENT * j / SEGS;
        var w = line.along === "a" ? warp(t, line.at) : warp(line.at, t), u = w[0] * sx, v = w[1] * sy;
        line.xs[j] = cx + u * ct - v * st; line.ys[j] = cy + u * st + v * ct;
        if (j) line.lv[j - 1] = Math.round(LEVELS * fadeAt((line.xs[j] + line.xs[j - 1]) / 2, (line.ys[j] + line.ys[j - 1]) / 2));
      }
    });
  }

  /* ---------------------------------------------------------------- draw */
  // Build-up timings (ms after the page loads): the mesh draws in first, then
  // the points settle onto it from the centre outwards, then the outliers
  // turn red with a ring spreading from each.
  var START = window.performance ? performance.now() : 0, RED_AT = 1450, BUILT = RED_AT + 800;
  var FLASH = 900, flashAt = -1;
  var dpr = 1, viewH = 0, progress = 0, pageFrac = 0;

  // How much of a mesh line to draw: segments up to `end`, the last of them
  // only up to the fraction `endF`. During the build-up `part` (0–1) of each
  // line's length is drawn, so the lines draw in.
  function meshExtent(line, part) {
    line.end = 0; line.endF = 1;
    if (part >= 1) { line.end = SEGS; return; }
    if (part <= 0) return;
    var xs = line.xs, ys = line.ys, total = 0, j;
    for (j = 1; j <= SEGS; j++) total += Math.hypot(xs[j] - xs[j - 1], ys[j] - ys[j - 1]);
    var left = total * part;
    for (j = 1; j <= SEGS; j++) {
      var seg = Math.hypot(xs[j] - xs[j - 1], ys[j] - ys[j - 1]);
      if (left <= seg) { line.end = j; line.endF = seg ? left / seg : 1; return; }
      left -= seg;
    }
    line.end = SEGS;
  }
  // Adds the drawn segments of a mesh line to the paths of their fade steps.
  function meshSegments(paths, line) {
    var xs = line.xs, ys = line.ys, lv = line.lv, prev = 0;
    for (var j = 1; j <= line.end; j++) {
      var L = lv[j - 1];
      if (L && L !== prev) paths[L].moveTo(xs[j - 1], ys[j - 1]);
      prev = L;
      if (!L) continue;
      var f = j === line.end ? line.endF : 1;
      paths[L].lineTo(xs[j - 1] + (xs[j] - xs[j - 1]) * f, ys[j - 1] + (ys[j] - ys[j - 1]) * f);
    }
  }
  // Adds a circle of radius r around each red outlier to the path.
  function outlierCircles(c, r) {
    fringe.forEach(function (p) { c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, 2 * Math.PI); });
  }

  function draw(now) {
    place(progress);
    var levels = narrow.matches ? { grey: 0.06, red: 0.35 } : { grey: 0.09, red: 0.5 };
    var f = stage(progress, FADE);
    var greyO = 1 + (levels.grey - 1) * f, redO = 1 + (levels.red - 1) * f;
    // Over the whole page the view moves one screen down the cloud.
    var dy = -pageFrac * H, t = now - START, building = buildUp && t < BUILT;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, dy * dpr);

    // Mesh, dissolving at its edges: one stroke per fade step.
    var paths = [], L;
    for (L = 1; L <= LEVELS; L++) paths[L] = new Path2D();
    MESH.forEach(function (line) {
      meshExtent(line, building ? easeInOut((t - Math.abs(line.at) * 90) / 1000) : 1);
      meshSegments(paths, line);
    });
    ctx.strokeStyle = colour.dot;
    ctx.lineWidth = 0.7;
    for (L = 1; L <= LEVELS; L++) {
      ctx.globalAlpha = greyO * 0.4 * L / LEVELS;
      ctx.stroke(paths[L]);
    }

    // Grey points, filled as one shape so that overlapping points do not
    // darken each other as the cloud fades. During the build-up each point
    // fades in on its own.
    ctx.fillStyle = colour.dot;
    var top = -dy - 4, bottom = -dy + viewH + 4;
    if (building) {
      pts.forEach(function (p) {
        var o = easeOut((t - p.delay) / 300);
        if (o <= 0 || p.y < top || p.y > bottom) return;
        ctx.globalAlpha = greyO * o;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, 2 * Math.PI);
        ctx.fill();
      });
    } else {
      ctx.globalAlpha = greyO;
      ctx.beginPath();
      pts.forEach(function (p) {
        if (p.y < top || p.y > bottom) return;
        ctx.moveTo(p.x + 2.4, p.y);
        ctx.arc(p.x, p.y, 2.4, 0, 2 * Math.PI);
      });
      ctx.fill();
    }

    // Red outliers.
    var redIn = building ? easeOut((t - RED_AT) / 450) : 1;
    if (redIn > 0) {
      ctx.globalAlpha = redO * redIn;
      ctx.fillStyle = colour.red;
      ctx.beginPath();
      outlierCircles(ctx, 3.3);
      ctx.fill();
    }
    // During the build-up a small ring marks each outlier, then spreads out
    // and fades as the outlier turns red.
    if (building) {
      var q = (t - RED_AT) / 800, e = easeOut(q), scale = 0.4 + 2.2 * e;
      ctx.globalAlpha = 0.6 * (1 - e);
      ctx.strokeStyle = colour.red;
      ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      outlierCircles(ctx, 7 * scale);
      ctx.stroke();
    }
    // Bright rings flash around the red outliers as the zoom begins.
    if (flashAt >= 0 && now - flashAt < FLASH) {
      var fe = easeOut((now - flashAt) / FLASH), fo, fs;
      if (fe < 0.18) { fo = fe / 0.18; fs = 0.6 + 0.5 * fo; }
      else { var g = (fe - 0.18) / 0.82; fo = 1 - g; fs = 1.1 + 2.1 * g; }
      ctx.globalAlpha = fo;
      ctx.strokeStyle = colour.flash;
      ctx.lineWidth = 2 * fs;
      ctx.beginPath();
      outlierCircles(ctx, 7 * fs);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* -------------------------------------------------------------- frames */
  // Scroll drives everything: over the first 60% of a screen the cloud
  // zooms, fades and twirls into the background; over the whole page the
  // view moves one screen down the cloud.
  // Armed while the page is at the very top; the flash fires once when
  // scrolling starts.
  var atTop = window.scrollY <= 0, pageMax = 1;
  function readScroll(now) {
    var y = window.scrollY;
    if (reduce) { progress = 1; pageFrac = 0; return; }
    progress = Math.min(1, Math.max(0, y / (0.6 * H)));
    pageFrac = Math.min(1, Math.max(0, y / pageMax));
    if (y <= 0) atTop = true;
    else if (atTop) { atTop = false; flashAt = now; }
  }

  // One loop draws at most once per frame. It keeps running while the waves
  // move, the build-up plays or a flash shows, and otherwise only runs when
  // the page scrolls, resizes or changes theme.
  // Advance the waves smoothly; one period takes ~7 s.
  // - Paused while the cloud is a faded background (barely visible there);
  //   the waves resume from where they stopped when scrolling back up.
  // - Switched off for good if the device struggles: if drawing over the
  //   first ~1.5 s of motion (at least 10 frames) averages more than 7 ms,
  //   the cloud stays still.
  var queued = false, dirty = true, lastWave = 0, lastDraw = 0;
  var wavesOn = !reduce && !!window.performance, samples = 0, spent = 0, started = 0, judged = false, BUDGET = 7;
  function request() {
    if (!queued) { queued = true; window.requestAnimationFrame(frame); }
  }
  function frame(now) {
    queued = false;
    readScroll(now);
    var waving = wavesOn && progress < 0.95;
    var animating = (buildUp && now - START < BUILT) || (flashAt >= 0 && now - flashAt < FLASH);
    // When only the waves move, draw at most ~60 times a second.
    if (!dirty && !animating && waving && now - lastDraw < 15) { request(); return; }
    if (waving && lastWave) phase += Math.min(now - lastWave, 100) / 1000 * (2 * Math.PI / 7);
    lastWave = waving ? now : 0;
    var t0 = performance.now();
    draw(now);
    dirty = false; lastDraw = now;
    if (waving && !judged) {
      if (!started) started = t0;
      spent += performance.now() - t0;
      samples++;
      if (samples >= 10 && (samples >= 45 || t0 - started > 1500)) {
        judged = true;
        if (spent / samples > BUDGET) wavesOn = false;   // too slow: stop for good
      }
    }
    if ((waving && wavesOn) || animating) request();
  }
  function redraw() { dirty = true; request(); }

  function measurePage() { pageMax = Math.max(1, doc.scrollHeight - H); }
  function resize() {
    var w = window.innerWidth;
    // On phones the address bar shows and hides while scrolling, changing
    // only the window height. The canvas is sized to the largest viewport
    // (styles.css), so the cloud keeps its layout instead of jumping.
    if (!(touch && w === W && H)) {
      W = w; H = window.innerHeight;
      // Where the text column leaves side margins of at least 100px, the
      // background is wide enough that 3.2 SD falls in the middle of each
      // margin, so a few red outliers stay visible beside the text further
      // down the page.
      var main = document.querySelector("main"), textW = W;
      if (main) {
        var cs = getComputedStyle(main);
        textW = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      }
      sxEnd = (W - textW) / 2 >= 100 ? (W + textW) / 4 / 3.2 : Math.min(W, 1100) * 0.13;
      placedK = -1;
      measurePage();
    }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewH = canvas.clientHeight || H;
    var bw = Math.round((canvas.clientWidth || W) * dpr), bh = Math.round(viewH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    redraw();
  }
  resize();

  /* -------------------------------------------------------------- events */
  if (!reduce) window.addEventListener("scroll", redraw, { passive: true });
  window.addEventListener("resize", resize);
  // The page height changes as fonts and content load.
  if (window.ResizeObserver) new ResizeObserver(function () { measurePage(); redraw(); }).observe(document.body);
  else window.addEventListener("load", function () { measurePage(); redraw(); });
  // Follow theme changes: the toggle sets data-theme, the system sets the scheme.
  function retheme() { readColours(); redraw(); }
  if (window.MutationObserver) new MutationObserver(retheme).observe(doc, { attributes: true, attributeFilter: ["data-theme"] });
  var scheme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
  if (scheme) {
    if (scheme.addEventListener) scheme.addEventListener("change", retheme);
    else if (scheme.addListener) scheme.addListener(retheme);
  }
})();

/* Homepage data art: a cloud of grey data points drawn from a 2D Gaussian,
   whose outermost points are red.

   At the top of the page the cloud is round and at full strength behind the
   landing view; on the first visit of a session it builds up from the centre
   outwards and its outliers turn red. Scrolling down zooms into it while it
   stretches into a tall ellipse and fades into a faint background, and once
   the fade is under way it turns slightly upright (scrolling back up reverses
   this); further scrolling moves vertically along the distribution, from
   its dense centre towards its sparse tail.
   With reduced motion the cloud is a still, faint background from the start. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
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

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  var svg = el("svg", { "class": "dataart", "aria-hidden": "true", focusable: "false" });
  document.body.insertBefore(svg, document.body.firstChild);
  // A soft radial fade (white centre, black edge) masks the manifold mesh, so
  // the sheet dissolves at its edges. Its geometry is updated in layout().
  var defs = el("defs", {}, svg);
  var fade = el("radialGradient", { id: "da-fade", gradientUnits: "userSpaceOnUse", cx: 0, cy: 0, r: 1 }, defs);
  el("stop", { offset: "0", "stop-color": "#fff" }, fade);
  el("stop", { offset: "0.55", "stop-color": "#fff", "stop-opacity": "0.8" }, fade);
  el("stop", { offset: "1", "stop-color": "#fff", "stop-opacity": "0" }, fade);
  var mask = el("mask", { id: "da-mask", maskUnits: "userSpaceOnUse", x: "-100%", y: "-100%", width: "300%", height: "300%" }, defs);
  var maskRect = el("rect", { fill: "url(#da-fade)" }, mask);

  var mover = el("g", {}, svg);
  var meshG = el("g", { "class": "da-mesh", mask: "url(#da-mask)" }, mover);
  var greyG = el("g", { "class": "da-grey" }, mover);
  var ringG = el("g", { "class": "da-ring" }, mover);
  var redG = el("g", { "class": "da-red" }, mover);
  var flashG = el("g", { "class": "da-flash" }, mover);

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
  pts.forEach(function (p) {
    rMax = Math.max(rMax, p.r);
    p.dot = el("circle", { r: 2.4 }, greyG);
    if (p.fringe) {
      p.ring = el("circle", { r: 7 }, ringG);
      p.red = el("circle", { r: 3.3 }, redG);
      p.flash = el("circle", { r: 7 }, flashG);
    }
  });

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
  var EXTENT = 3.2, STEP = 0.4, MESH = [];
  for (var m = -EXTENT; m <= EXTENT + 1e-9; m += STEP) {
    MESH.push({ along: "a", at: m, path: el("path", { pathLength: 1 }, meshG) });
    MESH.push({ along: "b", at: m, path: el("path", { pathLength: 1 }, meshG) });
  }


  /* -------------------------------------------------------------- layout */
  // `progress` runs from 0 (at the top of the page) to 1 (a faint
  // background). Along the way three overlapping stages each ease from 0 to 1
  // over their own share of it:
  // - zoom: the cloud grows and stretches into a tall ellipse in one motion
  //   (one standard deviation ends at 45% of the screen height but only a
  //   fraction of its width, `sxEnd`), and moves to the centre of the screen;
  // - fade: it fades into the background from the first scroll, finishing
  //   before the name has reached the middle of the screen (applied in
  //   update());
  // - twirl: once the fade is under way, the tilt eases out and the cloud
  //   turns upright.
  var ZOOM = [0, 0.6], FADE = [0, 0.6], TWIRL = [0.2, 1];
  function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
  function stage(k, range) {
    return ease(Math.min(1, Math.max(0, (k - range[0]) / (range[1] - range[0]))));
  }
  var W, H, sxEnd, progress = -1;
  var drawnPhase = -1;
  function layout(k) {
    if (k === progress && phase === drawnPhase) return;
    progress = k; drawnPhase = phase;
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
    function place(a, b) {
      var w = warp(a, b), u = w[0] * sx, v = w[1] * sy;
      return [cx + u * ct - v * st, cy + u * st + v * ct];
    }
    pts.forEach(function (p) {
      var q = place(p.a, p.b), x = q[0].toFixed(1), y = q[1].toFixed(1);
      p.dot.setAttribute("cx", x); p.dot.setAttribute("cy", y);
      if (p.fringe) {
        p.red.setAttribute("cx", x); p.red.setAttribute("cy", y);
        p.ring.setAttribute("cx", x); p.ring.setAttribute("cy", y);
        p.flash.setAttribute("cx", x); p.flash.setAttribute("cy", y);
      }
    });
    MESH.forEach(function (line) {
      var d = "";
      for (var j = 0; j <= 48; j++) {
        var t = -EXTENT + 2 * EXTENT * j / 48;
        var q = line.along === "a" ? place(t, line.at) : place(line.at, t);
        d += (j ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1);
      }
      line.path.setAttribute("d", d);
    });
    // The fade follows the sheet's shape: an ellipse reaching ~3 SD.
    var R = EXTENT * 1.05;
    fade.setAttribute("gradientTransform", "translate(" + cx.toFixed(1) + " " + cy.toFixed(1) + ") rotate(" +
      (tilt * 180 / Math.PI).toFixed(2) + ") scale(" + (sx * R).toFixed(1) + " " + (sy * R).toFixed(1) + ")");
    maskRect.setAttribute("x", -W); maskRect.setAttribute("y", -H * 2);
    maskRect.setAttribute("width", W * 3); maskRect.setAttribute("height", H * 5);
  }

  // Bright rings flash around the red outliers as the zoom begins.
  function flash() {
    if (reduce || !svg.animate) return;
    pts.forEach(function (p) {
      if (!p.fringe) return;
      p.flash.animate([
        { opacity: 0, transform: "scale(0.6)" },
        { opacity: 1, transform: "scale(1.1)", offset: 0.18 },
        { opacity: 0, transform: "scale(3.2)" }
      ], { duration: 900, easing: "ease-out" });
    });
  }
  // Armed while the page is at the very top; fires once when scrolling starts.
  var atTop = window.scrollY <= 0;

  // Scroll drives everything: over the first 60% of a screen the cloud
  // zooms, fades and twirls into the background; over the whole page the
  // view moves one screen down the cloud.
  function update() {
    var levels = narrow.matches ? { grey: 0.06, red: 0.35 } : { grey: 0.09, red: 0.5 };
    var k = 1, p = 0;
    if (!reduce) {
      k = Math.min(1, Math.max(0, window.scrollY / (0.6 * H)));
      var max = Math.max(1, doc.scrollHeight - H);
      p = Math.min(1, Math.max(0, window.scrollY / max));
    }
    layout(k);
    if (window.scrollY <= 0) atTop = true;
    else if (atTop) { atTop = false; flash(); }
    var f = stage(k, FADE);
    greyG.style.opacity = (1 + (levels.grey - 1) * f).toFixed(3);
    meshG.style.opacity = greyG.style.opacity;
    redG.style.opacity = (1 + (levels.red - 1) * f).toFixed(3);
    mover.setAttribute("transform", "translate(0 " + (-p * H).toFixed(1) + ")");
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
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
    progress = -1;
    update();
  }
  resize();

  /* ------------------------------------------------------------ build-up */
  // The manifold mesh draws in first, then the points settle onto it from
  // the centre outwards, then the outliers turn red.
  if (buildUp && svg.animate) {
    var RED_AT = 1450;
    MESH.forEach(function (line) {
      line.path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
        { duration: 1000, delay: Math.abs(line.at) * 90, easing: "ease-in-out", fill: "backwards" });
    });
    pts.forEach(function (p) {
      var delay = 350 + (p.r / rMax) * 700 + p.j * 150;
      p.dot.animate([{ opacity: 0 }, { opacity: 1 }],
        { duration: 300, delay: delay, easing: "ease-out", fill: "backwards" });
      if (p.fringe) {
        p.red.animate([{ opacity: 0 }, { opacity: 1 }],
          { duration: 450, delay: RED_AT, easing: "ease-out", fill: "backwards" });
        p.ring.animate([
          { opacity: 0.6, transform: "scale(0.4)" }, { opacity: 0, transform: "scale(2.6)" }
        ], { duration: 800, delay: RED_AT, easing: "ease-out", fill: "backwards" });
      }
    });
  }

  /* --------------------------------------------------------------- waves */
  // Advance the waves about 30 times a second; one period takes ~7 s.
  // - Paused while the cloud is a faded background (barely visible there);
  //   the waves resume from where they stopped when scrolling back up.
  // - Switched off for good if the device struggles: if updates over the
  //   first ~1.5 s of motion (at least 10 of them) average more than 7 ms,
  //   the cloud stays still.
  if (!reduce && window.requestAnimationFrame && window.performance) {
    var last = 0, samples = 0, spent = 0, started = 0, judged = false, BUDGET = 7;
    var tick = function (ts) {
      var dt = ts - last;
      if (dt > 33) {
        last = ts;
        if (progress < 0.95) {
          phase += Math.min(dt, 100) / 1000 * (2 * Math.PI / 7);
          var t0 = performance.now();
          layout(progress);
          if (!judged) {
            if (!started) started = t0;
            spent += performance.now() - t0;
            samples++;
            if (samples >= 10 && (samples >= 45 || t0 - started > 1500)) {
              judged = true;
              if (spent / samples > BUDGET) return;   // too slow: stop for good
            }
          }
        }
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  }

  /* -------------------------------------------------------------- events */
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", resize);
})();

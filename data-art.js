/* Homepage data art: a cloud of grey data points drawn from a 2D Gaussian,
   whose outermost points are red.

   At the top of the page the cloud is round and at full strength behind the
   landing view; on the first visit of a session it builds up from the centre
   outwards and its outliers turn red. Scrolling down stretches it into a tall
   ellipse and fades it into a faint background (scrolling back up reverses
   this); further scrolling moves vertically along the distribution, from its
   dense centre towards its sparse tail.
   With reduced motion the cloud is a still, faint background from the start. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var doc = document.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var narrow = window.matchMedia ? window.matchMedia("(max-width: 700px)") : { matches: false };

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
  var mover = el("g", {}, svg);
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
  for (var i = 0; i < N; i++) {
    var a = gauss(), b = gauss();
    pts.push({ a: a, b: b, r: Math.sqrt(a * a + b * b), j: rand() });
  }
  // The outermost points (largest Mahalanobis distance) are the red ones.
  pts.slice().sort(function (p, q) { return q.r - p.r; })
    .slice(0, OUTLIERS).forEach(function (p) { p.fringe = true; });
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

  /* -------------------------------------------------------------- layout */
  // `stretch` runs from 0 (round, at the top of the page) to 1 (a tall
  // ellipse: one standard deviation is 45% of the screen height but only a
  // fraction of its width).
  var W, H, stretch = -1;
  function layout(s) {
    if (s === stretch) return;
    stretch = s;
    var round = Math.min(W, H) * 0.085;
    var sx = round + (Math.min(W, 1100) * 0.13 - round) * s;
    var sy = round + (H * 0.45 - round) * s;
    // Round, the cloud sits in the empty space above the hero (40% of the
    // screen height); as it stretches it moves to the centre of the screen.
    var cx = W / 2, cy = H * (0.4 + 0.1 * s);
    pts.forEach(function (p) {
      var x = (cx + p.a * sx).toFixed(1), y = (cy + p.b * sy).toFixed(1);
      p.dot.setAttribute("cx", x); p.dot.setAttribute("cy", y);
      if (p.fringe) {
        p.red.setAttribute("cx", x); p.red.setAttribute("cy", y);
        p.ring.setAttribute("cx", x); p.ring.setAttribute("cy", y);
        p.flash.setAttribute("cx", x); p.flash.setAttribute("cy", y);
      }
    });
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

  function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }

  // Scroll drives everything: over the first 60% of a screen the cloud
  // stretches and fades into the background; over the whole page the view
  // moves one screen down the cloud.
  function update() {
    var levels = narrow.matches ? { grey: 0.06, red: 0.35 } : { grey: 0.09, red: 0.5 };
    var k = 1, p = 0;
    if (!reduce) {
      k = ease(Math.min(1, Math.max(0, window.scrollY / (0.6 * H))));
      var max = Math.max(1, doc.scrollHeight - H);
      p = Math.min(1, Math.max(0, window.scrollY / max));
    }
    layout(k);
    if (window.scrollY <= 0) atTop = true;
    else if (atTop) { atTop = false; flash(); }
    greyG.style.opacity = (1 + (levels.grey - 1) * k).toFixed(3);
    redG.style.opacity = (1 + (levels.red - 1) * k).toFixed(3);
    mover.setAttribute("transform", "translate(0 " + (-p * H).toFixed(1) + ")");
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    stretch = -1;
    update();
  }
  resize();

  /* ------------------------------------------------------------ build-up */
  // Points appear from the centre outwards, then the outliers turn red.
  if (buildUp && svg.animate) {
    var RED_AT = 1150;
    pts.forEach(function (p) {
      var delay = (p.r / rMax) * 700 + p.j * 150;
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

  /* -------------------------------------------------------------- events */
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", resize);
})();

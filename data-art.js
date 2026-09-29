/* Homepage data art: a tall elliptical cloud of grey data points drawn from
   a 2D Gaussian, whose outermost points are red.

   On the first visit of a session it plays as a short intro (a round cloud
   appears from the centre outwards, the outliers turn red), stretches
   vertically into a tall ellipse and then fades into a faint background. Scrolling the page moves vertically along the
   distribution, from its dense centre towards its sparse tail.
   With reduced motion there is no intro and the background stays still. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var doc = document.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var intro = doc.classList.contains("intro-pending") && !reduce;
  if (intro) { try { sessionStorage.setItem("intro", "1"); } catch (e) { /* private mode */ } }

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
    p.dot = el("circle", { r: 2 }, greyG);
    if (p.fringe) {
      p.ring = el("circle", { r: 6 }, ringG);
      p.red = el("circle", { r: 2.8 }, redG);
    }
  });

  /* -------------------------------------------------------------- layout */
  // The intro shows a round cloud; the background is a tall ellipse (one
  // standard deviation is 30% of the screen height but only a few percent of
  // its width). `stretch` runs from 0 (round) to 1 (tall).
  var W, H, stretch = intro ? 0 : 1;
  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    var round = Math.min(W, H) * 0.085;
    var sx = round + (Math.min(W, 1100) * 0.13 - round) * stretch;
    var sy = round + (H * 0.3 - round) * stretch;
    var cx = W / 2, cy = H / 2;
    pts.forEach(function (p) {
      var x = (cx + p.a * sx).toFixed(1), y = (cy + p.b * sy).toFixed(1);
      p.dot.setAttribute("cx", x); p.dot.setAttribute("cy", y);
      if (p.fringe) {
        p.red.setAttribute("cx", x); p.red.setAttribute("cy", y);
        p.ring.setAttribute("cx", x); p.ring.setAttribute("cy", y);
      }
    });
  }

  // Scrolling from top to bottom moves the view one screen down the cloud,
  // from its dense centre into its sparse lower tail.
  function scroll() {
    if (reduce) return;
    var max = Math.max(1, doc.scrollHeight - H);
    var p = Math.min(1, Math.max(0, window.scrollY / max));
    mover.setAttribute("transform", "translate(0 " + (-p * H).toFixed(1) + ")");
  }

  layout();
  scroll();

  /* --------------------------------------------------------------- intro */
  var RED_AT = 1150, FADE_AT = 2100;

  function settle(instant) {
    if (instant) svg.classList.add("instant");
    svg.classList.add("settled");
    if (instant) setTimeout(function () { svg.classList.remove("instant"); }, 50);
  }
  function reveal() {
    doc.classList.remove("intro-pending");
    doc.classList.add("intro-reveal");
    setTimeout(function () { doc.classList.remove("intro-reveal"); }, 900);
  }

  if (!intro || !svg.animate) {
    doc.classList.remove("intro-pending");
    if (stretch !== 1) { stretch = 1; layout(); }
    settle(true);
  } else {
    var anims = [], ended = false;
    pts.forEach(function (p) {
      // Points appear from the centre outwards.
      var delay = (p.r / rMax) * 700 + p.j * 150;
      anims.push(p.dot.animate([{ opacity: 0 }, { opacity: 1 }],
        { duration: 300, delay: delay, easing: "ease-out", fill: "backwards" }));
      if (p.fringe) {
        anims.push(p.red.animate([{ opacity: 0 }, { opacity: 1 }],
          { duration: 450, delay: RED_AT, easing: "ease-out", fill: "backwards" }));
        anims.push(p.ring.animate([
          { opacity: 0.6, transform: "scale(0.4)" }, { opacity: 0, transform: "scale(2.6)" }
        ], { duration: 800, delay: RED_AT, easing: "ease-out", fill: "backwards" }));
      }
    });
    // First the round cloud stretches vertically into the tall ellipse; only
    // then does it fade into the background while the page appears.
    var stretchOut = function (D, done) {
      var t0 = null, finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        stretch = 1;
        layout();
        done();
      }
      function step(ts) {
        if (finished) return;
        if (t0 === null) t0 = ts;
        var u = Math.min(1, (ts - t0) / D);
        stretch = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        layout();
        if (u < 1) window.requestAnimationFrame(step);
        else finish();
      }
      window.requestAnimationFrame(step);
      // Finish anyway if animation frames are throttled (background tab).
      setTimeout(finish, D + 250);
    };
    // Called by the timer, or early by any input (then the stretch is quicker).
    var end = function (evt) {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      anims.forEach(function (x) { try { x.finish(); } catch (e) { /* already done */ } });
      stretchOut(evt ? 350 : 1100, function () {
        reveal();
        settle(false);
      });
    };
    var timer = setTimeout(end, FADE_AT);
    ["click", "keydown", "wheel", "touchstart"].forEach(function (ev) {
      window.addEventListener(ev, end, { passive: true, once: true });
    });
  }

  /* -------------------------------------------------------------- events */
  // Moving the cloud is a single attribute update, so it runs on every scroll event.
  window.addEventListener("scroll", scroll, { passive: true });
  window.addEventListener("resize", function () { layout(); scroll(); });
})();

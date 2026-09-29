/* Step-by-step walkthrough of how the study measures memorisation bias,
   for the "Memorisation bias in medical AI" companion page. Alice's numbers
   are illustrative; the per-dataset counts in steps 6 and 7 are the study's. */
(function () {
  "use strict";

  var root = document.getElementById("mb-walk");
  if (!root || !document.createElementNS) return;

  var NS = "http://www.w3.org/2000/svg";
  var stage = root.querySelector(".walk-stage");
  var nav = root.querySelector(".walk-nav");
  var items = Array.prototype.slice.call(root.querySelectorAll(".walk-steps > li"));
  var N = items.length;
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var DATA = window.MEMORISATION;

  var state = { step: 1, narrow: null, seen: false };
  var svgRoot = null, hooks = {}, running = [], timers = [];

  /* -------------------------------------------------------------- maths */
  function pdf(x, m, s) { var z = (x - m) / s; return Math.exp(-0.5 * z * z) / (s * Math.sqrt(2 * Math.PI)); }
  function erf(x) {
    var t = 1 / (1 + 0.3275911 * Math.abs(x));
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x >= 0 ? y : -y;
  }
  function Phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
  function probit(p) {
    var lo = -8, hi = 8;
    for (var i = 0; i < 60; i++) { var mid = (lo + hi) / 2; if (Phi(mid) < p) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function quantiles(n, m, s) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(m + s * probit((i + 0.5) / n));
    return out;
  }
  // Small deterministic pseudo-random generator, so every visit looks the same.
  function rng(seed) {
    var x = seed;
    return function () { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  }
  function shuffle(a, rand) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // Energy distance between two samples: 2E|X−Y| − E|X−X'| − E|Y−Y'|.
  function energy(A, B) {
    function mean(P, Q) {
      var s = 0;
      P.forEach(function (p) { Q.forEach(function (q) { s += Math.abs(p - q); }); });
      return s / (P.length * Q.length);
    }
    return 2 * mean(A, B) - mean(A, A) - mean(B, B);
  }
  function pct(v) { return Math.round(v * 100) + "%"; }
  function pctFine(v) { var p = v * 100; return (p < 1 ? p.toFixed(2) : p.toFixed(1)) + "%"; }
  function int(n) { return Math.round(n).toLocaleString("en-US"); }

  /* ------------------------------------------------ illustrative numbers */
  // Alice's future ECG: IN models output a lower infarct probability (−23 points).
  var ALICE = { inMu: 0.50, inSd: 0.03, outMu: 0.73, outSd: 0.04 };
  var IN_PRED = quantiles(10, ALICE.inMu, ALICE.inSd);
  var OUT_PRED = quantiles(10, ALICE.outMu, ALICE.outSd);
  var OBS_E = energy(IN_PRED, OUT_PRED);
  var NULL_E = (function () {
    var rand = rng(11), all = IN_PRED.concat(OUT_PRED), out = [];
    for (var k = 0; k < 500; k++) {
      var s = shuffle(all.slice(), rand);
      out.push(energy(s.slice(0, 10), s.slice(10)));
    }
    return out;
  })();
  var NULL_HITS = NULL_E.filter(function (e) { return e >= OBS_E; }).length;

  // 20 models shown for the study's 200; which of 8 patients each one saw.
  // Alice (patient 2) is in exactly half of them.
  var ALICE_IDX = 2;
  var WITH_ALICE = [1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1];
  var SUBSETS = WITH_ALICE.map(function (w, k) {
    var s = shuffle([1, 1, 1, 1, 0, 0, 0, 0], rng(k * 37 + 5));
    if (s[ALICE_IDX] !== w) {
      for (var j = 0; j < 8; j++) {
        if (j !== ALICE_IDX && s[j] === w) { s[j] = 1 - w; s[ALICE_IDX] = w; break; }
      }
    }
    return s;
  });

  /* ------------------------------------------------------------ drawing */
  function el(tag, attrs, parent, text) {
    var node = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  function on(node, list) { node.setAttribute("data-steps", " " + list.join(" ") + " "); return node; }
  function text(parent, x, y, str, cls, anchor) {
    return el("text", { x: x, y: y, "class": cls || null, "text-anchor": anchor || null }, parent, str);
  }
  function block(parent, pos) { return el("g", { transform: "translate(" + pos[0] + " " + pos[1] + ")" }, parent); }

  function arrow(parent, x1, y1, x2, y2) {
    var g = el("g", {}, parent);
    var a = Math.atan2(y2 - y1, x2 - x1), h = 7, w = 4.5;
    var bx = x2 - h * Math.cos(a), by = y2 - h * Math.sin(a);
    el("line", { x1: x1, y1: y1, x2: bx, y2: by, "class": "w-line" }, g);
    el("path", {
      d: "M" + x2 + " " + y2 + "L" + (bx - w * Math.sin(a)) + " " + (by + w * Math.cos(a)) +
         "L" + (bx + w * Math.sin(a)) + " " + (by - w * Math.cos(a)) + "Z", "class": "w-head"
    }, g);
    return g;
  }

  function person(parent, cx, cy, s) {
    s = s || 1;
    var g = el("g", {}, parent);
    el("circle", { cx: cx, cy: cy - 18 * s, r: 13 * s, "class": "w-person" }, g);
    el("path", { d: "M" + (cx - 24 * s) + " " + (cy + 22 * s) + "Q" + (cx - 24 * s) + " " + (cy - s) + " " + cx + " " + (cy - s) +
      "Q" + (cx + 24 * s) + " " + (cy - s) + " " + (cx + 24 * s) + " " + (cy + 22 * s) + "Z", "class": "w-person" }, g);
    return g;
  }

  // A model tile; a blue corner square marks models trained on Alice's history.
  function model(parent, cx, cy, size, marked) {
    var g = el("g", {}, parent), h = size / 2, s = size / 48;
    el("rect", { x: cx - h, y: cy - h, width: size, height: size, rx: size * 0.16, "class": "w-tile" }, g);
    var L = [[-11, -10], [-11, 0], [-11, 10]], R = [[9, -5], [9, 5]], d = "";
    L.forEach(function (a) { R.forEach(function (b) { d += "M" + (cx + a[0] * s) + " " + (cy + a[1] * s) + "L" + (cx + b[0] * s) + " " + (cy + b[1] * s); }); });
    el("path", { d: d, "class": "w-glyph" }, g);
    L.concat(R).forEach(function (p) { el("circle", { cx: cx + p[0] * s, cy: cy + p[1] * s, r: 2.8 * s, "class": "w-node" }, g); });
    if (marked) {
      var m = size * 0.2;
      el("rect", { x: cx + h - size * 0.17 - m / 2, y: cy - h + size * 0.17 - m / 2, width: m, height: m, rx: 1.5, "class": "w-histmark" }, g);
    }
    return g;
  }

  // A small stack of model tiles, for a whole group of models.
  function stack(parent, cx, cy, size, marked) {
    var g = el("g", {}, parent);
    [8, 4, 0].forEach(function (o) { model(g, cx + o, cy - o, size, marked); });
    return g;
  }

  // An ECG record card: normal sinus rhythm, or with ST elevation (infarct).
  function ecg(parent, cx, cy, w, h, future) {
    var g = el("g", {}, parent);
    el("rect", { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 4, "class": future ? "w-fut" : "w-hist" }, g);
    var x0 = cx - w / 2 + 6, ww = w - 12, base = cy + h * 0.14, a = h * 0.5;
    var pts = future
      ? [[0, 0], [0.22, 0], [0.26, -0.08], [0.3, 0], [0.37, 0.06], [0.42, -0.62], [0.47, 0.14], [0.5, -0.22], [0.6, -0.3], [0.7, 0], [1, 0]]
      : [[0, 0], [0.22, 0], [0.26, -0.08], [0.3, 0], [0.37, 0.06], [0.42, -0.62], [0.47, 0.14], [0.51, 0], [0.6, -0.16], [0.7, 0], [1, 0]];
    el("path", {
      d: "M" + pts.map(function (p) { return (x0 + p[0] * ww).toFixed(1) + " " + (base + p[1] * a).toFixed(1); }).join("L"),
      "class": "w-trace"
    }, g);
    return g;
  }

  /* ------------------------------------------------------------ animation */
  function play(node, frames, opts) {
    if (reduce || !node.animate) return;
    running.push(node.animate(frames, opts));
  }
  function stagger(nodes, step, delay) {
    nodes.forEach(function (n, i) {
      play(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: (delay || 0) + i * step, easing: "ease-out", fill: "backwards" });
    });
  }
  function after(ms, fn) { if (!reduce) timers.push(setTimeout(fn, ms)); }
  function stopAll() {
    running.forEach(function (a) { a.cancel(); });
    running = [];
    timers.forEach(clearTimeout);
    timers = [];
  }

  /* ------------------------------------------ scene 1: records in time */
  function sceneTimeline(svg, narrow) {
    var s = on(el("g", {}, svg), [1]);
    var g = narrow ? el("g", { transform: "translate(0 110)" }, s) : s;
    var L = narrow ? {
      who: [34, 132, 0.8], line: [70, 432, 150], split: 334, cards: [112, 182, 268], fut: 386, cw: 58, ch: 36, cy: 100,
      zoneTop: 60, zoneBot: 204, labY: 50, cond: ["normal", "infarct"], years: ["1998", "2003", "2013", "today"]
    } : {
      who: [54, 132, 1], line: [100, 744, 150], split: 560, cards: [190, 300, 470], fut: 652, cw: 80, ch: 44, cy: 96,
      zoneTop: 40, zoneBot: 204, labY: 28, cond: ["normal rhythm", "anterior infarct"], years: ["1998", "2003", "2013", "today"]
    };
    var z0 = L.line[0] + 6, z1 = L.split, z2 = L.line[1];
    var zones = el("g", {}, g);
    el("rect", { x: z0, y: L.zoneTop, width: z1 - z0, height: L.zoneBot - L.zoneTop, "class": "w-zone-hist" }, zones);
    el("rect", { x: z1, y: L.zoneTop, width: z2 - z1, height: L.zoneBot - L.zoneTop, "class": "w-zone-fut" }, zones);
    text(zones, z0 + 6, L.labY, narrow ? "Historical" : "Historical records", "t-inb");
    text(zones, z1 + 8, L.labY, narrow ? "Future" : "Future records", "t-fut");

    person(g, L.who[0], L.who[1], L.who[2]);
    text(g, L.who[0], L.who[1] + 42 * L.who[2], "Alice", "t-strong", "middle");
    arrow(g, L.line[0], L.line[2], L.line[1], L.line[2]);

    var cards = [];
    L.cards.concat([L.fut]).forEach(function (x, i) {
      var fut = i === 3, c = el("g", {}, g);
      text(c, x, L.cy - L.ch / 2 - 7, L.cond[fut ? 1 : 0], fut ? "t-fut" : "t-faint", "middle");
      ecg(c, x, L.cy, L.cw, L.ch, fut);
      el("line", { x1: x, x2: x, y1: L.cy + L.ch / 2, y2: L.line[2], "class": "w-leader" }, c);
      el("circle", { cx: x, cy: L.line[2], r: 4, "class": "w-dotmark" }, c);
      text(c, x, L.line[2] + 20, L.years[i], null, "middle");
      cards.push(c);
    });

    var split = el("g", {}, g);
    el("line", { x1: L.split, x2: L.split, y1: L.zoneTop - 6, y2: L.zoneBot + 6, "class": "w-split" }, split);
    var capY = L.zoneBot + 22;
    var caps = el("g", {}, g);
    text(caps, (z0 + z1) / 2, capY, "can be used", "t-inb", "middle");
    text(caps, (z0 + z1) / 2, capY + 16, "for training", "t-inb", "middle");
    text(caps, (z1 + z2) / 2, capY, "never used", "t-fut", "middle");
    text(caps, (z1 + z2) / 2, capY + 16, "for training", "t-fut", "middle");

    hooks[1] = function () {
      stagger(cards, 260, 150);
      play(split, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 1300, fill: "backwards" });
      play(zones, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 1500, fill: "backwards" });
      play(caps, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 1800, fill: "backwards" });
    };
  }

  /* --------------------------------------- scene 2: train many models */
  var GRID = function (k) { return [140 + 40 * (k % 5), 70 + 40 * Math.floor(k / 5)]; };

  function sceneTrain(svg, P, narrow) {
    var s = on(el("g", {}, svg), [2]);
    var l = block(s, P.left), r = block(s, P.right);

    text(l, 130, 12, "Patients", "t-title", "middle");
    text(l, 130, 28, "historical records only", null, "middle");
    var pats = el("g", { "class": "w-pats" }, l), patNodes = [];
    for (var i = 0; i < 8; i++) {
      var x = 43 + 58 * (i % 4), y = 80 + 92 * Math.floor(i / 4);
      var p = el("g", { "class": "w-pat" }, pats);
      person(p, x, y, 0.62);
      ecg(p, x, y + 30, 34, 18, false);
      if (i === ALICE_IDX) text(p, x, y + 56, "Alice", "t-inb", "middle");
      patNodes.push(p);
    }

    text(r, 220, 12, "Models", "t-title", "middle");
    text(r, 220, 28, "each on a random half of patients", null, "middle");
    var tiles = SUBSETS.map(function (sub, k) {
      var g = GRID(k);
      return model(r, g[0], g[1], 30, sub[ALICE_IDX] === 1);
    });
    text(r, 220, 236, "20 shown of the study’s 200", "t-faint", "middle");
    if (!narrow) arrow(s, 272, 150, 440, 150);

    hooks[2] = function () {
      var t = 300;
      SUBSETS.forEach(function (sub, k) {
        var slow = k < 3, hold = slow ? 800 : 110, start = t;
        after(start, function () {
          pats.classList.add("round");
          patNodes.forEach(function (n, j) { n.classList.toggle("sel", sub[j] === 1); });
        });
        play(tiles[k], [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: start + (slow ? 450 : 50), fill: "backwards" });
        t += hold + (slow ? 150 : 20);
      });
      after(t, function () { pats.classList.remove("round"); });
    };
  }

  /* --------------------------------- scene 3: partition models for Alice */
  function scenePartition(svg, P) {
    var s = on(el("g", {}, svg), [3]);
    var l = block(s, P.left), r = block(s, P.right);

    person(l, 130, 84, 1.1);
    text(l, 130, 136, "Alice", "t-strong", "middle");
    [84, 130, 176].forEach(function (x) { ecg(l, x, 172, 40, 24, false); });
    text(l, 130, 206, "her historical records", "t-inb", "middle");

    var nIn = 0, nOut = 0, tiles = [];
    SUBSETS.forEach(function (sub, k) {
      var w = sub[ALICE_IDX] === 1, j = w ? nIn++ : nOut++;
      var gx = (w ? 44 : 256) + 36 * (j % 5), gy = 96 + 40 * Math.floor(j / 5);
      var from = GRID(k);
      tiles.push({ node: model(r, gx, gy, 30, w), dx: from[0] - gx, dy: from[1] - gy });
    });
    var labels = el("g", {}, r);
    el("line", { x1: 220, x2: 220, y1: 70, y2: 214, "class": "w-leader" }, labels);
    text(labels, 116, 58, "IN", "t-inb", "middle");
    text(labels, 328, 58, "OUT", "t-out", "middle");
    text(labels, 116, 176, "trained on Alice’s", "t-inb", "middle");
    text(labels, 116, 192, "historical records", "t-inb", "middle");
    text(labels, 328, 176, "not trained", "t-out", "middle");
    text(labels, 328, 192, "on them", "t-out", "middle");
    text(labels, 116, 222, "100 models", "t-strong", "middle");
    text(labels, 328, 222, "100 models", "t-strong", "middle");

    hooks[3] = function () {
      tiles.forEach(function (t, i) {
        var from = "translate(" + t.dx + "px," + t.dy + "px)";
        play(t.node, [
          { transform: from }, { transform: from, offset: 0.3 }, { transform: "translate(0px,0px)" }
        ], { duration: 1500, delay: i * 25, easing: "ease-in-out", fill: "backwards" });
      });
      play(labels, [{ opacity: 0 }, { opacity: 0, offset: 0.75 }, { opacity: 1 }], { duration: 2000, fill: "backwards" });
    };
  }

  /* ----------------------------------- scene 4: predict on the future */
  var X0 = 30, X1 = 420, BASE = 196, DH = 130;

  function scenePredict(svg, P) {
    var s = on(el("g", {}, svg), [4]);
    var l = block(s, P.left), r = block(s, P.right);

    text(l, 130, 12, "Alice’s future ECG", "t-title", "middle");
    text(l, 130, 28, "never seen by any model", "t-fut", "middle");
    ecg(l, 130, 70, 96, 50, true);
    arrow(l, 110, 100, 78, 140);
    arrow(l, 150, 100, 182, 140);
    stack(l, 70, 176, 30, true);
    stack(l, 186, 176, 30, false);
    text(l, 74, 222, "IN", "t-inb", "middle");
    text(l, 190, 222, "OUT", "t-out", "middle");
    text(l, 74, 238, "100 models", "t-faint", "middle");
    text(l, 190, 238, "100 models", "t-faint", "middle");

    var x = function (v) { return X0 + v * (X1 - X0); };
    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      el("line", { x1: x(t), x2: x(t), y1: BASE - DH, y2: BASE, "class": "w-grid" }, r);
      text(r, x(t), BASE + 34, pct(t), "t-tick", "middle");
    });
    el("line", { x1: X0, x2: X1, y1: BASE, y2: BASE, "class": "w-axis" }, r);
    text(r, (X0 + X1) / 2, BASE + 54, "Predicted probability of infarct", "t-axis", "middle");
    text(r, X0, 14, "IN: trained on Alice’s history", "t-inb");
    text(r, X0, 31, "OUT: not trained on it", "t-out");

    var k = (DH - 30) / Math.max(pdf(0, 0, ALICE.inSd), pdf(0, 0, ALICE.outSd));
    function curve(mu, sd, lineCls, areaCls) {
      var pts = [];
      for (var j = 0; j <= 160; j++) {
        var v = j / 160;
        pts.push(x(v).toFixed(1) + " " + (BASE - pdf(v, mu, sd) * k).toFixed(1));
      }
      var g = el("g", {}, r);
      el("path", { d: "M" + X0 + " " + BASE + "L" + pts.join("L") + "L" + X1 + " " + BASE + "Z", "class": areaCls }, g);
      el("path", { d: "M" + pts.join("L"), "class": lineCls }, g);
      return g;
    }
    var outC = curve(ALICE.outMu, ALICE.outSd, "w-out-line", "w-out-area");
    var inC = curve(ALICE.inMu, ALICE.inSd, "w-inb-line", "w-inb-area");
    var dots = [];
    IN_PRED.forEach(function (v) { dots.push(el("circle", { cx: x(v), cy: BASE + 9, r: 3.2, "class": "w-dot-inb" }, r)); });
    OUT_PRED.forEach(function (v) { dots.push(el("circle", { cx: x(v), cy: BASE + 18, r: 3.2, "class": "w-dot-out" }, r)); });

    var gap = el("g", {}, r);
    var top = BASE - DH + 8;
    el("line", { x1: x(ALICE.inMu), x2: x(ALICE.inMu), y1: top + 6, y2: BASE, "class": "w-mean inb" }, gap);
    el("line", { x1: x(ALICE.outMu), x2: x(ALICE.outMu), y1: top + 6, y2: BASE, "class": "w-mean out" }, gap);
    el("path", { d: "M" + x(ALICE.inMu) + " " + (top + 5) + "V" + top + "H" + x(ALICE.outMu) + "V" + (top + 5), "class": "w-leader" }, gap);
    text(gap, (x(ALICE.inMu) + x(ALICE.outMu)) / 2, top - 7,
      "IN − OUT: −" + Math.round((ALICE.outMu - ALICE.inMu) * 100) + " points", "t-strong", "middle");

    hooks[4] = function () {
      stagger(dots, 40, 200);
      play(inC, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 1000, fill: "backwards" });
      play(outC, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 1000, fill: "backwards" });
      play(gap, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 1600, fill: "backwards" });
    };
  }

  /* ------------------------------- scene 5: permutation test on Alice */
  function sceneTest(svg, P) {
    var s = on(el("g", {}, svg), [5]);
    var l = block(s, P.left), r = block(s, P.right);

    // Left: the 20 predictions, relabelled at random a few times.
    var A0 = 40, A1 = 244, ROW = [96, 166];
    var ax = function (v) { return A0 + v * (A1 - A0); };
    text(l, 130, 12, "Predictions on Alice’s future ECG", "t-title", "middle");
    text(l, 130, 28, "labels shuffled at random", null, "middle");
    text(l, 4, ROW[0] + 4, "IN", "t-inb");
    text(l, 4, ROW[1] + 4, "OUT", "t-out");
    ROW.forEach(function (y) { el("line", { x1: A0, x2: A1, y1: y + 14, y2: y + 14, "class": "w-axis" }, l); });
    [0, 0.5, 1].forEach(function (t) { text(l, ax(t), 206, pct(t), "t-tick", "middle"); });
    text(l, 142, 224, "predicted probability of infarct", "t-axis", "middle");

    var all = IN_PRED.concat(OUT_PRED), rand = rng(11), shuffles = [];
    for (var k = 0; k < 3; k++) {
      var idx = shuffle(all.map(function (_, i) { return i; }), rand), rowOf = [];
      idx.forEach(function (orig, pos) { rowOf[orig] = pos < 10 ? 0 : 1; });
      shuffles.push(rowOf);
    }
    var DY = ROW[1] - ROW[0];
    var dots = all.map(function (v, i) {
      var row = i < 10 ? 0 : 1, jit = ((i * 7) % 5 - 2) * 3;
      // Each dot sits in its real row; the shuffle animation offsets it from there.
      var g = el("g", {}, l);
      var blue = el("circle", { cx: ax(v), cy: ROW[row] + jit, r: 4.5, "class": "w-dot-inb", opacity: row ? 0 : 1 }, g);
      var grey = el("circle", { cx: ax(v), cy: ROW[row] + jit, r: 4.5, "class": "w-dot-out", opacity: row ? 1 : 0 }, g);
      return { g: g, blue: blue, grey: grey, row: row, i: i };
    });

    // Right: energy distances for 500 shuffles against Alice's observed one.
    var H0 = 20, H1 = 420, HB = 190, HH = 120;
    var maxE = OBS_E * 1.12, BINS = 28;
    var hx = function (e) { return H0 + e / maxE * (H1 - H0); };
    var counts = [];
    for (var b = 0; b < BINS; b++) counts.push(0);
    NULL_E.forEach(function (e) { counts[Math.min(BINS - 1, Math.floor(e / maxE * BINS))]++; });
    var cmax = Math.max.apply(null, counts), bw = (H1 - H0) / BINS;
    text(r, H0, 14, "Energy distance between IN and OUT", "t-title");
    text(r, H0, 31, "grey: 500 shuffles · blue: Alice’s real split", "t-faint");
    el("line", { x1: H0, x2: H1, y1: HB, y2: HB, "class": "w-axis" }, r);
    for (var tv = 0; tv <= maxE + 1e-9; tv += 0.1) text(r, hx(tv), HB + 16, tv.toFixed(1), "t-tick", "middle");
    text(r, (H0 + H1) / 2, HB + 36, "Energy distance (larger = more different)", "t-axis", "middle");
    var bars = [];
    counts.forEach(function (c, i) {
      if (!c) return;
      var h = c / cmax * HH;
      bars.push(el("rect", { x: H0 + i * bw + 1, y: HB - h, width: bw - 2, height: h, "class": "w-null grow-up" }, r));
    });
    var obs = el("g", {}, r);
    el("line", { x1: hx(OBS_E), x2: hx(OBS_E), y1: HB - HH - 10, y2: HB, "class": "w-obsb" }, obs);
    text(obs, hx(OBS_E) - 6, HB - HH - 2, "Alice", "t-inb", "end");
    var verdict = el("g", {}, r);
    text(verdict, hx(OBS_E) - 8, HB - HH + 22, NULL_HITS + " of 500 shuffles", "t-strong", "end");
    text(verdict, hx(OBS_E) - 8, HB - HH + 38, "reach Alice’s distance", "t-strong", "end");
    text(verdict, hx(OBS_E) - 8, HB - HH + 56, "significant difference", "t-inb", "end");

    hooks[5] = function () {
      var D = 4200;
      dots.forEach(function (d) {
        var rows = [d.row, d.row, shuffles[0][d.i], shuffles[0][d.i], shuffles[1][d.i], shuffles[1][d.i],
                    shuffles[2][d.i], shuffles[2][d.i], d.row];
        var offs = [0, 0.15, 0.22, 0.38, 0.45, 0.61, 0.68, 0.84, 0.92];
        play(d.g, rows.map(function (rw, j) { return { transform: "translate(0px," + (rw - d.row) * DY + "px)", offset: offs[j] }; })
          .concat([{ transform: "translate(0px,0px)", offset: 1 }]),
          { duration: D, easing: "ease-in-out" });
        play(d.blue, rows.map(function (rw, j) { return { opacity: rw ? 0 : 1, offset: offs[j] }; })
          .concat([{ opacity: d.row ? 0 : 1, offset: 1 }]), { duration: D });
        play(d.grey, rows.map(function (rw, j) { return { opacity: rw ? 1 : 0, offset: offs[j] }; })
          .concat([{ opacity: d.row ? 1 : 0, offset: 1 }]), { duration: D });
      });
      bars.forEach(function (bar, i) {
        play(bar, [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }],
          { duration: 700, delay: 700 + i * 90, easing: "ease-out", fill: "backwards" });
      });
      play(verdict, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: D, fill: "backwards" });
    };
  }

  /* ------------------------------------------- dataset rows (steps 6–7) */
  function rowsChart(r, title, note, values, ghosts, labelFn, subFn) {
    var B0 = 150, B1 = 400, MAXV = 0.05;
    var bx = function (v) { return B0 + Math.min(v, MAXV) / MAXV * (B1 - B0); };
    text(r, 0, 14, title, "t-title");
    if (note) text(r, 0, 31, note, "t-faint");
    [0, 0.025, 0.05].forEach(function (t) {
      el("line", { x1: bx(t), x2: bx(t), y1: 40, y2: 222, "class": "w-grid" }, r);
      text(r, bx(t), 238, t === 0.025 ? "2.5%" : pct(t), "t-tick", "middle");
    });
    text(r, (B0 + B1) / 2, 258, "Share of future records", "t-axis", "middle");
    var bars = [];
    DATA.datasets.forEach(function (d, i) {
      var y = 60 + i * 46;
      text(r, 0, y + 2, d.name, "t-strong");
      if (subFn) text(r, 0, y + 18, subFn(d, i), "t-faint");
      if (ghosts) el("rect", { x: B0, y: y - 8, width: bx(ghosts[i]) - B0, height: 12, rx: 2, "class": "w-rowbar ghost" }, r);
      var v = values[i];
      if (v > 0) bars.push(el("rect", { x: B0, y: y - 8, width: bx(v) - B0, height: 12, rx: 2, "class": "w-rowbar grow" }, r));
      if (labelFn) text(r, bx(v) + 6, y + 2, labelFn(d, i), "t-strong");
    });
    return bars;
  }

  /* --------------------------------- scene 6: every future record, all data */
  function sceneRepeat(svg, P) {
    var s = on(el("g", {}, svg), [6]);
    var l = block(s, P.left), r = block(s, P.right);

    text(l, 130, 12, "Future records", "t-title", "middle");
    text(l, 130, 28, "each tested the same way", null, "middle");
    var SIG = [17, 58], cells = [], sig = [];
    for (var i = 0; i < 96; i++) {
      var x = 30 + 17 * (i % 12), y = 52 + 18 * Math.floor(i / 12);
      var c = el("rect", { x: x, y: y, width: 12, height: 12, rx: 2, "class": "w-cell" + (SIG.indexOf(i) >= 0 ? " sig" : "") }, l);
      cells.push(c);
      if (SIG.indexOf(i) >= 0) sig.push(el("rect", { x: x - 3, y: y - 3, width: 18, height: 18, rx: 4, "class": "w-sigring" }, l));
    }
    text(l, 130, 222, "significant shift", "t-fut", "middle");

    var shares = DATA.datasets.map(function (d) { return d.future.sig / d.future.n; });
    var bars = rowsChart(r, "Future records with a significant shift", null, shares, null,
      function (d, i) { return pctFine(shares[i]); },
      function (d) { return int(d.future.sig) + " of " + int(d.future.n); });

    hooks[6] = function () {
      cells.forEach(function (c, i) {
        play(c, [{ opacity: 0.25 }, { opacity: 1, offset: 0.4 }, { opacity: 1 }],
          { duration: 400, delay: i * 14, fill: "backwards" });
      });
      sig.forEach(function (ring) {
        play(ring, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 1450, fill: "backwards" });
      });
      bars.forEach(function (b, i) {
        play(b, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
          { duration: 600, delay: 1500 + i * 150, easing: "cubic-bezier(.3,0,.2,1)", fill: "backwards" });
      });
    };
  }

  /* ------------------------------------------ scene 7: random control */
  function sceneControl(svg, P) {
    var s = on(el("g", {}, svg), [7]);
    var l = block(s, P.left), r = block(s, P.right);

    text(l, 130, 12, "The same 20 models", "t-title", "middle");
    text(l, 130, 28, "split at random", null, "middle");
    var groupOf = shuffle(SUBSETS.map(function (_, k) { return k % 2; }), rng(3));
    var n = [0, 0], tiles = [];
    SUBSETS.forEach(function (sub, k) {
      var g = groupOf[k], j = n[g]++;
      var gx = (g ? 164 : 60) + 36 * (j % 2), gy = 58 + 36 * Math.floor(j / 2);
      var mx = 58 + 36 * (k % 5), my = 58 + 36 * Math.floor(k / 5);
      tiles.push({ node: model(l, gx, gy, 28, sub[ALICE_IDX] === 1), dx: mx - gx, dy: my - gy });
    });
    var labels = el("g", {}, l);
    el("line", { x1: 130, x2: 130, y1: 44, y2: 218, "class": "w-leader" }, labels);
    text(labels, 78, 240, "Group A", "t-strong", "middle");
    text(labels, 182, 240, "Group B", "t-strong", "middle");

    var real = DATA.datasets.map(function (d) { return d.future.sig / d.future.n; });
    var zero = DATA.datasets.map(function (d) { return d.random.sig / d.random.n; });
    rowsChart(r, "Significant shifts, random split", "grey: patient-based split, for comparison", zero, real, null,
      function (d) { return int(d.random.sig) + " of " + int(d.random.n); });

    hooks[7] = function () {
      tiles.forEach(function (t, i) {
        var from = "translate(" + t.dx + "px," + t.dy + "px)";
        play(t.node, [{ transform: from }, { transform: from, offset: 0.3 }, { transform: "translate(0px,0px)" }],
          { duration: 1500, delay: i * 25, easing: "ease-in-out", fill: "backwards" });
      });
      play(labels, [{ opacity: 0 }, { opacity: 0, offset: 0.75 }, { opacity: 1 }], { duration: 2000, fill: "backwards" });
    };
  }

  /* ------------------------------------------------------------- build */
  function build(force) {
    var narrow = stage.clientWidth < 560;
    if (svgRoot && narrow === state.narrow && !force) return;
    state.narrow = narrow;
    stopAll();
    stage.textContent = "";
    hooks = {};
    svgRoot = el("svg", {
      viewBox: narrow ? "0 0 440 552" : "0 0 760 300",
      "class": narrow ? "narrow" : null,
      "aria-hidden": "true", focusable: "false"
    }, stage);
    var P = narrow ? { left: [90, 0], right: [0, 274] } : { left: [0, 20], right: [320, 14] };
    sceneTimeline(svgRoot, narrow);
    sceneTrain(svgRoot, P, narrow);
    scenePartition(svgRoot, P);
    scenePredict(svgRoot, P);
    sceneTest(svgRoot, P);
    if (DATA) { sceneRepeat(svgRoot, P); sceneControl(svgRoot, P); }
    apply(false);
  }

  /* --------------------------------------------------------- navigation */
  var back = document.createElement("button");
  back.type = "button";
  back.className = "walk-btn";
  back.setAttribute("aria-label", "Back");
  back.innerHTML = '<span aria-hidden="true">←</span><span class="walk-btn-text"> Back</span>';

  var next = document.createElement("button");
  next.type = "button";
  next.className = "walk-btn walk-next";

  var progress = document.createElement("div");
  progress.className = "walk-progress";
  var dotBtns = [], part = null, partName = null;
  items.forEach(function (li, i) {
    var name = li.getAttribute("data-part");
    if (name !== partName) {
      partName = name;
      part = document.createElement("div");
      part.className = "walk-part";
      part.setAttribute("role", "group");
      part.setAttribute("aria-label", name);
      var lab = document.createElement("span");
      lab.className = "walk-part-label";
      lab.setAttribute("aria-hidden", "true");
      lab.textContent = name;
      part.appendChild(lab);
      var row = document.createElement("div");
      row.className = "walk-dots";
      part.appendChild(row);
      progress.appendChild(part);
    }
    var b = document.createElement("button");
    b.type = "button";
    b.className = "walk-dot";
    var h = li.querySelector("h3");
    b.setAttribute("aria-label", "Step " + (i + 1) + ": " + (h ? h.textContent.replace(/^\s*\d+\s*/, "") : ""));
    b.addEventListener("click", function () { go(i + 1); });
    part.lastChild.appendChild(b);
    dotBtns.push(b);
  });

  nav.appendChild(back);
  nav.appendChild(progress);
  nav.appendChild(next);

  back.addEventListener("click", function () { go(state.step - 1); });
  next.addEventListener("click", function () {
    if (state.step < N) { go(state.step + 1); return; }
    var target = document.getElementById("shift");
    if (target) target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });

  root.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowRight") { go(state.step + 1); e.preventDefault(); }
    if (e.key === "ArrowLeft") { go(state.step - 1); e.preventDefault(); }
  });

  var sx = null, sy = null;
  stage.addEventListener("pointerdown", function (e) { sx = e.clientX; sy = e.clientY; });
  stage.addEventListener("pointerup", function (e) {
    if (sx === null) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(state.step + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener("pointercancel", function () { sx = null; });

  function apply(animate) {
    var n = state.step;
    items.forEach(function (li, i) { li.hidden = i + 1 !== n; });
    dotBtns.forEach(function (d, i) {
      d.classList.toggle("done", i + 1 < n);
      if (i + 1 === n) d.setAttribute("aria-current", "step");
      else d.removeAttribute("aria-current");
    });
    back.disabled = n === 1;
    next.innerHTML = n < N ? 'Next <span aria-hidden="true">→</span>'
                           : 'Findings <span aria-hidden="true">↓</span>';
    if (svgRoot) {
      Array.prototype.forEach.call(svgRoot.querySelectorAll("[data-steps]"), function (node) {
        node.classList.toggle("on", node.getAttribute("data-steps").indexOf(" " + n + " ") >= 0);
      });
    }
    stopAll();
    if (animate && state.seen && hooks[n]) hooks[n]();
  }

  function go(n) {
    n = Math.max(1, Math.min(N, n));
    if (n === state.step) return;
    state.step = n;
    apply(true);
  }

  root.classList.add("js");
  build();

  var pending = false;
  window.addEventListener("resize", function () {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function () { pending = false; build(); });
  });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      state.seen = true;
      if (hooks[state.step]) hooks[state.step]();
    }, { threshold: 0.5 });
    io.observe(stage);
  } else {
    state.seen = true;
  }
})();

/* Step-by-step walkthrough of a membership inference attack and of how its
   success is measured, for the "Disparate privacy risks" companion page.
   All numbers drawn here are illustrative. */
(function () {
  "use strict";

  var root = document.getElementById("mia-walk");
  if (!root || !document.createElementNS) return;

  var NS = "http://www.w3.org/2000/svg";
  var stage = root.querySelector(".walk-stage");
  var nav = root.querySelector(".walk-nav");
  var items = Array.prototype.slice.call(root.querySelectorAll(".walk-steps > li"));
  var N = items.length;
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var state = { step: 1, record: 6, shuffles: 0, narrow: null, seen: false };
  var svgRoot = null, hooks = {}, selectRecord = null, running = [], tweenId = 0;

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
  // Confidence scores and AUCs are shown as whole percentages: 0.934 → "93%".
  function pct(v) { return Math.round(v * 100) + "%"; }
  // Record-level AUC when both score distributions are Gaussian.
  function gaussAuc(p) { return Phi((p.inMu - p.outMu) / Math.sqrt(p.inSd * p.inSd + p.outSd * p.outSd)); }

  /* ------------------------------------------------ illustrative numbers */
  var REF = { inMu: 0.93, inSd: 0.005, outMu: 0.92, outSd: 0.005 }; // reference models, step 4–5
  var OBS = 0.93;                                                   // deployed model's output
  // The aggregate ROC curve is computed over 1,000 members and 1,000
  // non-members, so it is smooth; the strip shows an evenly spaced sample.
  // 125 members are highly exposed and score far above every non-member.
  var EXPOSED_N = 125;
  // Scores are real numbers (log-likelihood ratios): around 0 the attack
  // cannot tell members from non-members, higher means "more likely member".
  var MEMBER_POP = quantiles(1000 - EXPOSED_N, 0.07, 1);
  for (var ei = 0; ei < EXPOSED_N; ei++) MEMBER_POP.push(4.5 + 3.5 * ei / (EXPOSED_N - 1));
  var NONMEMBER_POP = quantiles(1000, 0, 1);
  // Evenly spaced sample of a sorted population, for the score strip.
  function sample(pop, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(pop[Math.floor((i + 0.5) / n * pop.length)]);
    return out;
  }
  var MEMBERS = sample(MEMBER_POP, 24);
  var NONMEMBERS = sample(NONMEMBER_POP, 24);
  var PATIENT = [0.55, 0.62, 0.97];

  // Both populations are sorted ascending, so the AUC is a single merge.
  var AGG_AUC = (function () {
    var s = 0, j = 0, k = 0;
    MEMBER_POP.forEach(function (a) {
      while (j < NONMEMBER_POP.length && NONMEMBER_POP[j] < a) j++;
      k = j;
      while (k < NONMEMBER_POP.length && NONMEMBER_POP[k] === a) k++;
      s += j + 0.5 * (k - j);
    });
    return s / (MEMBER_POP.length * NONMEMBER_POP.length);
  })();
  var LR = pdf(OBS, REF.inMu, REF.inSd) / pdf(OBS, REF.outMu, REF.outSd);

  Array.prototype.forEach.call(root.querySelectorAll("[data-walk]"), function (node) {
    var k = node.getAttribute("data-walk");
    if (k === "agg") node.textContent = pct(AGG_AUC);
    if (k === "lr") node.textContent = String(Math.round(LR));
    if (k === "patient") node.textContent = pct(Math.max.apply(null, PATIENT));
  });

  /* ------------------------------------------------------------ drawing */
  function el(tag, attrs, parent, text) {
    var node = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  // Mark a node as visible only on the listed steps.
  function on(node, list) { node.setAttribute("data-steps", " " + list.join(" ") + " "); return node; }
  function text(parent, x, y, str, cls, anchor) {
    return el("text", { x: x, y: y, "class": cls || null, "text-anchor": anchor || null }, parent, str);
  }
  function block(parent, pos) { return el("g", { transform: "translate(" + pos[0] + " " + pos[1] + ")" }, parent); }

  function arrow(parent, x1, y1, x2, y2, cls) {
    var g = el("g", {}, parent);
    var a = Math.atan2(y2 - y1, x2 - x1), h = 7, w = 4.5;
    var bx = x2 - h * Math.cos(a), by = y2 - h * Math.sin(a);
    el("line", { x1: x1, y1: y1, x2: bx, y2: by, "class": cls || "w-line" }, g);
    el("path", {
      d: "M" + x2 + " " + y2 +
         "L" + (bx - w * Math.sin(a)) + " " + (by + w * Math.cos(a)) +
         "L" + (bx + w * Math.sin(a)) + " " + (by - w * Math.cos(a)) + "Z",
      "class": "w-head"
    }, g);
    return g;
  }

  function record(parent, cx, cy, size) {
    size = size || 14;
    return el("rect", { x: cx - size / 2, y: cy - size / 2, width: size, height: size, rx: 2, "class": "w-rec" }, parent);
  }

  // A model: a tile with a small network glyph. A red square in the corner
  // means the model was trained with the target record.
  function model(parent, cx, cy, size, withRecord) {
    var g = el("g", {}, parent), h = size / 2, s = size / 48;
    el("rect", { x: cx - h, y: cy - h, width: size, height: size, rx: size * 0.16, "class": "w-tile" }, g);
    var L = [[-11, -10], [-11, 0], [-11, 10]], R = [[9, -5], [9, 5]], d = "";
    L.forEach(function (a) { R.forEach(function (b) { d += "M" + (cx + a[0] * s) + " " + (cy + a[1] * s) + "L" + (cx + b[0] * s) + " " + (cy + b[1] * s); }); });
    el("path", { d: d, "class": "w-glyph" }, g);
    L.concat(R).forEach(function (p) { el("circle", { cx: cx + p[0] * s, cy: cy + p[1] * s, r: 2.8 * s, "class": "w-node" }, g); });
    if (withRecord) record(g, cx + h - size * 0.17, cy - h + size * 0.17, size * 0.2);
    return g;
  }

  var JITTER = [[-2, 1], [1, -2], [3, 2], [0, 3], [-3, -1], [2, 0], [1, 2], [-1, -3], [3, 1]];
  function dataset(parent, cx, cy, withRecord) {
    var g = el("g", {}, parent), k = 0;
    for (var r = -1; r <= 1; r++) {
      for (var c = -1; c <= 1; c++, k++) {
        var x = cx + c * 17 + JITTER[k][0], y = cy + r * 17 + JITTER[k][1];
        if (withRecord && k === 2) record(g, x, y, 11);
        else if (k % 2) el("circle", { cx: x, cy: y, r: 5.5, "class": "w-data" }, g);
        else el("rect", { x: x - 5, y: y - 5, width: 10, height: 10, rx: 1.5, "class": "w-data" }, g);
      }
    }
    return g;
  }

  function person(parent, cx, cy) {
    var g = el("g", {}, parent);
    el("circle", { cx: cx, cy: cy - 18, r: 13, "class": "w-person" }, g);
    el("path", { d: "M" + (cx - 24) + " " + (cy + 22) + "Q" + (cx - 24) + " " + (cy - 1) + " " + cx + " " + (cy - 1) +
      "Q" + (cx + 24) + " " + (cy - 1) + " " + (cx + 24) + " " + (cy + 22) + "Z", "class": "w-person" }, g);
    return g;
  }

  // The prediction interface, drawn as a cloud filling the box x, y, w, h.
  function iface(parent, x, y, w, h) {
    return el("path", {
      d: "M26 72H96A22 22 0 0 0 100 30A26 26 0 0 0 54 18A20 20 0 0 0 22 36A19 19 0 0 0 26 72Z",
      transform: "translate(" + x + " " + y + ") scale(" + (w / 120) + " " + (h / 76) + ")",
      "vector-effect": "non-scaling-stroke",
      "class": "w-iface"
    }, parent);
  }

  /* ------------------------------------------------------ density chart
     Scores from models trained with the record are red, scores from models
     trained without it are grey. By default the two are mirrored about the
     axis; with o.overlay they share one baseline. */
  var X0 = 40, X1 = 424, TOP = 42, BASE = 134, BOT = 226, HH = 88;
  var OBASE = 204;   // baseline in overlay mode

  function densityChart(parent, o) {
    var dom = o.domain, overlay = !!o.overlay;
    var base = overlay ? OBASE : BASE;
    var hMax = overlay ? OBASE - TOP : HH;
    var x = function (v) { return X0 + (v - dom[0]) / (dom[1] - dom[0]) * (X1 - X0); };
    var k = (overlay ? 0.78 * hMax : HH - 2) / o.peak;
    var dirOut = overlay ? -1 : 1;
    // Vertical position of a density value, for the in (-1) or out curve.
    var y = function (dens, isIn) { return base + (isIn ? -1 : dirOut) * Math.min(hMax, dens * k); };

    var grid = el("g", {}, parent);
    o.ticks.forEach(function (t) {
      el("line", { x1: x(t), x2: x(t), y1: TOP, y2: overlay ? base : BOT, "class": "w-grid" }, grid);
      text(grid, x(t), 244, pct(t), "t-tick", "middle");
    });
    text(parent, (X0 + X1) / 2, 264, o.axis, "t-axis", "middle");
    text(parent, X0, 16, o.top, "t-in");
    if (overlay) text(parent, X0, 33, o.bottom, "t-out");
    else text(parent, X0 + 4, BOT - 6, o.bottom, "t-out");

    var areas = el("g", {}, parent);
    var outArea = el("path", { "class": "w-out-area" }, areas);
    var outLine = el("path", { "class": "w-out-line" }, areas);
    var inArea = el("path", { "class": "w-in-area" }, areas);
    var inLine = el("path", { "class": "w-in-line" }, areas);
    el("line", { x1: X0, x2: X1, y1: base, y2: base, "class": "w-axis" }, parent);
    var rugs = el("g", {}, parent);
    var inDots = [], outDots = [];
    var rugIn = overlay ? base + 9 : base - 5, rugOut = overlay ? base + 19 : base + 5;
    for (var i = 0; i < o.n; i++) {
      inDots.push(el("circle", { r: 3.2, cy: rugIn, "class": "w-dot-in" }, rugs));
      outDots.push(el("circle", { r: 3.2, cy: rugOut, "class": "w-dot-out" }, rugs));
    }

    function curve(mu, sd, isIn) {
      var pts = [];
      for (var j = 0; j <= 160; j++) {
        var v = dom[0] + (dom[1] - dom[0]) * j / 160;
        pts.push(x(v).toFixed(1) + " " + y(pdf(v, mu, sd), isIn).toFixed(1));
      }
      return pts;
    }
    function set(p) {
      var a = curve(p.inMu, p.inSd, true), b = curve(p.outMu, p.outSd, false);
      inLine.setAttribute("d", "M" + a.join("L"));
      outLine.setAttribute("d", "M" + b.join("L"));
      inArea.setAttribute("d", "M" + X0 + " " + base + "L" + a.join("L") + "L" + X1 + " " + base + "Z");
      outArea.setAttribute("d", "M" + X0 + " " + base + "L" + b.join("L") + "L" + X1 + " " + base + "Z");
      var qi = quantiles(o.n, p.inMu, p.inSd), qo = quantiles(o.n, p.outMu, p.outSd);
      var clamp = function (v) { return Math.max(dom[0], Math.min(Math.min(dom[1], 0.998), v)); };
      inDots.forEach(function (d, j) { d.setAttribute("cx", x(clamp(qi[j])).toFixed(1)); });
      outDots.forEach(function (d, j) { d.setAttribute("cx", x(clamp(qo[j])).toFixed(1)); });
    }
    return { x: x, y: y, set: set, areas: areas, dots: inDots.concat(outDots) };
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
  function fly(node, dx, dy, delay) {
    play(node, [
      { transform: "translate(" + dx + "px," + dy + "px)", opacity: 0 },
      { transform: "translate(" + dx + "px," + dy + "px)", opacity: 1, offset: 0.12 },
      { transform: "translate(0px,0px)", opacity: 1 }
    ], { duration: 1100, delay: delay || 250, easing: "cubic-bezier(.45,0,.25,1)", fill: "backwards" });
  }
  function stopAll() {
    running.forEach(function (a) { a.cancel(); });
    running = [];
  }

  /* --------------------------------------------- scene 1: steps 1 – 3 */
  function sceneQuery(svg, narrow) {
    var L = narrow ? {
      user: [70, 160], rec: [100, 160], ifc: [300, 122, 110, 76],
      req: [118, 292, 148], resp: [292, 118, 174], mid: 205, pkt: [274, 148], reply: [150, 174],
      box: [16, 236, 408, 290], boxLab: [30, 258, "start"], ifcLab: -10,
      single: "M355 198V310", t1: [355, 336], d1: [355, 440],
      trunk: "M355 198V280", pA: "M355 280H150V310", pB: "M355 280V310", q: [355, 280],
      A: [150, 336], B: [355, 336], dA: [150, 440], dB: [355, 440],
      bubble: [16, 14, 280, 62], tail: [[86, 90, 5], [80, 106, 3.5]]
    } : {
      user: [80, 150], rec: [112, 150], ifc: [290, 112, 120, 76],
      req: [132, 282, 138], resp: [282, 132, 164], mid: 207, pkt: [264, 138], reply: [166, 164],
      box: [432, 22, 316, 272], boxLab: [740, 40, "end"], ifcLab: 20,
      single: "M410 150H504", t1: [530, 150], d1: [662, 150],
      trunk: "M410 150H460", pA: "M460 150V86H504", pB: "M460 150V214H504", q: [460, 150],
      A: [530, 86], B: [530, 214], dA: [662, 86], dB: [662, 214],
      bubble: [16, 12, 236, 60], tail: [[96, 84, 5], [90, 100, 3.5]]
    };
    var s = on(el("g", {}, svg), [1, 2, 3]);
    var ix = L.ifc[0] + L.ifc[2] / 2, iyb = L.ifc[1] + L.ifc[3];

    // Everything behind the interface is hidden from the user.
    el("rect", { x: L.box[0], y: L.box[1], width: L.box[2], height: L.box[3], rx: 12, "class": "w-box" }, s);
    text(s, L.boxLab[0], L.boxLab[1], "Hidden behind the interface", "t-faint", L.boxLab[2]);

    person(s, L.user[0], L.user[1]);
    on(text(s, L.user[0], L.user[1] + 50, "User", "t-strong", "middle"), [1, 2]);
    on(text(s, L.user[0], L.user[1] + 50, "Untrusted user", "t-strong", "middle"), [3]);
    record(s, L.rec[0], L.rec[1]);

    iface(s, L.ifc[0], L.ifc[1], L.ifc[2], L.ifc[3]);
    text(s, ix, L.ifcLab < 0 ? L.ifc[1] + L.ifcLab : iyb + L.ifcLab, "Prediction interface", "t-strong", "middle");

    arrow(s, L.req[0], L.req[2], L.req[1], L.req[2]);
    text(s, L.mid, L.req[2] - 10, "Target record", null, "middle");
    on(arrow(s, L.resp[0], L.resp[2], L.resp[1], L.resp[2]), [2, 3]);
    on(text(s, L.mid, L.resp[2] + 28, "p(pneumonia)", "t-strong", "middle"), [2, 3]);

    var pkt = on(el("g", {}, s), [1]);
    record(pkt, L.pkt[0], L.pkt[1]);
    var reply = on(el("g", {}, s), [2, 3]);
    el("rect", { x: L.reply[0] - 21, y: L.reply[1] - 10, width: 42, height: 20, rx: 10, "class": "w-chip" }, reply);
    text(reply, L.reply[0], L.reply[1] + 4, pct(OBS), "t-chip", "middle");

    // Steps 1–2: a single, unknown model.
    var one = on(el("g", {}, s), [1, 2]);
    el("path", { d: L.single, "class": "w-wire" }, one);
    model(one, L.t1[0], L.t1[1], 52, false);
    text(one, L.t1[0], L.t1[1] + 44, "Target model", "t-strong", "middle");
    dataset(one, L.d1[0], L.d1[1], false);
    text(one, L.d1[0], L.d1[1] + 44, "Training data", null, "middle");

    // Step 3: two possible worlds.
    var two = on(el("g", {}, s), [3]);
    el("path", { d: L.trunk, "class": "w-wire" }, two);
    el("path", { d: L.pA, "class": "w-wire dashed" }, two);
    el("path", { d: L.pB, "class": "w-wire dashed" }, two);
    el("circle", { cx: L.q[0], cy: L.q[1], r: 10, "class": "w-q" }, two);
    text(two, L.q[0], L.q[1] + 4, "?", "t-strong", "middle");
    model(two, L.A[0], L.A[1], 52, true);
    model(two, L.B[0], L.B[1], 52, false);
    text(two, L.A[0], L.A[1] + 44, "Model A", "t-strong", "middle");
    text(two, L.B[0], L.B[1] + 44, "Model B", "t-strong", "middle");
    dataset(two, L.dA[0], L.dA[1], true);
    dataset(two, L.dB[0], L.dB[1], false);
    text(two, L.dA[0], L.dA[1] + 44, "With the target record", "t-in", "middle");
    text(two, L.dB[0], L.dB[1] + 44, "Without it", null, "middle");

    var bub = on(el("g", {}, s), [3]);
    var b = L.bubble;
    el("ellipse", { cx: b[0] + b[2] / 2, cy: b[1] + b[3] / 2, rx: b[2] / 2, ry: b[3] / 2, "class": "w-bubble" }, bub);
    L.tail.forEach(function (t) { el("circle", { cx: t[0], cy: t[1], r: t[2], "class": "w-bubble" }, bub); });
    // "Was ■ used for training?", with the red record square inline.
    var by = b[1] + b[3] / 2 + 5;
    var t1 = text(bub, 0, by, "Was", "t-strong");
    var t2 = text(bub, 0, by, "used for training?", "t-strong");
    var w1 = t1.getComputedTextLength ? t1.getComputedTextLength() : 0;
    var w2 = t2.getComputedTextLength ? t2.getComputedTextLength() : 0;
    if (!w1 || !w2) { w1 = 26; w2 = 112; }
    var x0 = b[0] + (b[2] - (w1 + w2 + 32)) / 2;
    t1.setAttribute("x", x0);
    record(bub, x0 + w1 + 16, by - 4.5, 14);
    t2.setAttribute("x", x0 + w1 + 32);

    hooks[1] = function () { fly(pkt, L.rec[0] - L.pkt[0], L.rec[1] - L.pkt[1]); };
    hooks[2] = function () { fly(reply, L.pkt[0] - L.reply[0], 0, 150); };
    hooks[3] = function () { stagger([two, bub], 250, 100); };
  }

  /* --------------------------------------------- scene 2: steps 4 – 5 */
  var CHECKER = [1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1];

  function sceneReference(svg, P) {
    var s = on(el("g", {}, svg), [4, 5]);
    var l = block(s, P.left), r = block(s, P.right);

    text(l, 130, 12, "Reference models", "t-title", "middle");
    text(l, 130, 30, "trained by the attacker", null, "middle");
    // Each model is drawn in its group (with / without the target record);
    // step 4 animates it there from a mixed grid.
    var tiles = [], nWith = 0, nWithout = 0;
    CHECKER.forEach(function (w, i) {
      var k = w ? nWith++ : nWithout++;
      var gx = (w ? 50 : 168) + (k % 2) * 42, gy = 70 + Math.floor(k / 2) * 40;
      var mx = 64 + (i % 4) * 44, my = 70 + Math.floor(i / 4) * 40;
      tiles.push({ node: model(l, gx, gy, 32, !!w), dx: mx - gx, dy: my - gy });
    });
    var groupLabels = el("g", {}, l);
    el("line", { x1: 130, x2: 130, y1: 56, y2: 212, "class": "w-leader" }, groupLabels);
    text(groupLabels, 71, 236, "With target record", "t-in", "middle");
    text(groupLabels, 189, 236, "Without it", "t-out", "middle");

    var ch = densityChart(r, {
      domain: [0.9, 0.95], ticks: [0.9, 0.91, 0.92, 0.93, 0.94, 0.95],
      peak: pdf(0, 0, REF.inSd), n: 8, overlay: true,
      top: "Trained with the target record", bottom: "Trained without it",
      axis: "Confidence score for the target record"
    });
    ch.set(REF);

    // Step 4: the two distributions sit only one percentage point apart.
    var gap = on(el("g", {}, r), [4]);
    var gx0 = ch.x(REF.outMu), gx1 = ch.x(REF.inMu), gy = ch.y(pdf(0, 0, REF.inSd), true) - 14;
    el("path", { d: "M" + gx0 + " " + (gy + 5) + "V" + gy + "H" + gx1 + "V" + (gy + 5), "class": "w-leader" }, gap);
    text(gap, (gx0 + gx1) / 2, gy - 6, "1 point apart", null, "middle");

    var obs = on(el("g", {}, r), [5]);
    var ox = ch.x(OBS);
    el("line", { x1: ox, x2: ox, y1: TOP, y2: OBASE, "class": "w-obs" }, obs);
    el("circle", { cx: ox, cy: ch.y(pdf(OBS, REF.outMu, REF.outSd), false), r: 4.5, "class": "w-mark-out" }, obs);
    el("circle", { cx: ox, cy: ch.y(pdf(OBS, REF.inMu, REF.inSd), true), r: 4.5, "class": "w-mark-in" }, obs);
    text(obs, ox + 8, TOP + 10, "Target model: " + pct(OBS), "t-strong");
    text(obs, X1, 16, "Guess: member", "t-big-in", "end");
    text(obs, X1, 33, "about " + Math.round(LR) + "× more likely", null, "end");

    hooks[4] = function () {
      // Models appear mixed, then split into the two groups.
      tiles.forEach(function (t, i) {
        var from = "translate(" + t.dx + "px," + t.dy + "px)";
        play(t.node, [
          { transform: from, opacity: 0 },
          { transform: from, opacity: 1, offset: 0.25 },
          { transform: from, opacity: 1, offset: 0.45 },
          { transform: "translate(0px,0px)", opacity: 1 }
        ], { duration: 1900, delay: i * 30, easing: "ease-in-out", fill: "backwards" });
      });
      play(groupLabels, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 1900, fill: "backwards" });
      stagger(ch.dots, 30, 2100);
      play(ch.areas, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 2600, fill: "backwards" });
      play(gap, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 3000, fill: "backwards" });
    };
    hooks[5] = function () {
      play(obs, [{ opacity: 0, transform: "translate(0px,-8px)" }, { opacity: 1, transform: "translate(0px,0px)" }],
        { duration: 450, delay: 150, easing: "ease-out", fill: "backwards" });
    };
  }

  /* ------------------------------------------------------ scene 3: step 6 */
  var HALF = [1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0];
  // The threshold sweeps once from above every score (nothing flagged) to
  // below every score (everything flagged), and rests at the end.
  // Beyond the highest or lowest score a threshold acts like +∞ or −∞, so
  // the sweep starts just above the highest and ends just below the lowest.
  var SCORE_MAX = Math.max(MEMBER_POP[MEMBER_POP.length - 1], NONMEMBER_POP[NONMEMBER_POP.length - 1]);
  var SCORE_MIN = Math.min(MEMBER_POP[0], NONMEMBER_POP[0]);
  var THR_START = SCORE_MAX + 0.4, THR_END = SCORE_MIN - 0.2;
  // Attack scores and thresholds are shown as signed decimals: -1.5 → "−1.5".
  function dec(v) {
    var t = Math.abs(v).toFixed(1);
    return (v < 0 && t !== "0.0" ? "\u2212" : "") + t;
  }

  // Share of members and non-members flagged at a threshold on the attack score.
  function atOrAbove(sorted, thr) {
    var lo = 0, hi = sorted.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (sorted[mid] < thr) lo = mid + 1; else hi = mid; }
    return sorted.length - lo;
  }
  function flagged(thr) {
    return { tpr: atOrAbove(MEMBER_POP, thr) / MEMBER_POP.length,
             fpr: atOrAbove(NONMEMBER_POP, thr) / NONMEMBER_POP.length };
  }

  function sceneAggregate(svg, P) {
    var s = on(el("g", {}, svg), [6]);
    var l = block(s, P.left), r = block(s, P.right);

    /* Left: one target model scores every record. */
    text(l, 130, 12, "One target model", "t-title", "middle");
    text(l, 130, 28, "trained on random 50% subset", null, "middle");
    HALF.forEach(function (m, i) {
      var x = 74 + (i % 8) * 16, y = 44 + Math.floor(i / 8) * 16;
      if (m) record(l, x, y, 9);
      else if (i % 2) el("circle", { cx: x, cy: y, r: 4.5, "class": "w-data" }, l);
      else el("rect", { x: x - 4, y: y - 4, width: 8, height: 8, rx: 1.5, "class": "w-data" }, l);
    });
    arrow(l, 130, 84, 130, 100);
    model(l, 130, 118, 32, true);
    text(l, 154, 115, "compute attack score");
    text(l, 154, 130, "for every record");
    arrow(l, 130, 138, 130, 152);

    var S0 = 30, S1 = 230, SB = 204;
    var SLO = THR_END, SHI = THR_START;
    var sx = function (v) { return S0 + (v - SLO) / (SHI - SLO) * (S1 - S0); };
    el("line", { x1: S0, x2: S1, y1: SB, y2: SB, "class": "w-axis" }, l);
    [-2, 0, 2, 4, 6, 8].forEach(function (v) {
      el("line", { x1: sx(v), x2: sx(v), y1: SB, y2: SB + 3, "class": "w-axis" }, l);
      text(l, sx(v), 246, dec(v), "t-tick", "middle");
    });
    text(l, (S0 + S1) / 2, 262, "attack score", "t-axis", "middle");
    text(l, S1, 186, "members", "t-in", "end");
    text(l, S1, 230, "non-members", "t-out", "end");

    var BIN = 6, dots = [];
    function stack(values, dir, cls) {
      var counts = {};
      values.slice().sort(function (a, b) { return a - b; }).forEach(function (v) {
        var b = Math.min(Math.floor((sx(v) - S0) / BIN), Math.floor((S1 - S0) / BIN) - 1);
        var c = counts[b] = (counts[b] || 0) + 1;
        var node = el("circle", { cx: S0 + (b + 0.5) * BIN, cy: SB + dir * (5 + (c - 1) * 6), r: 2.7, "class": cls }, l);
        dots.push({ node: node, v: v });
      });
    }
    stack(MEMBERS, -1, "w-dot-in");
    stack(NONMEMBERS, 1, "w-dot-out");

    var thrG = el("g", {}, l);
    var thrLine = el("line", { y1: 168, y2: 238, "class": "w-thr" }, thrG);
    var thrLab = text(thrG, 0, 164, "threshold", "t-strong", "middle");

    /* Right: the aggregate ROC curve. */
    var R0 = 58, RS = 180, RT = 26;
    var rx = function (f) { return R0 + f * RS; };
    var ry = function (t) { return RT + (1 - t) * RS; };
    [[0, "0%"], [0.5, "50%"], [1, "100%"]].forEach(function (t) {
      el("line", { x1: rx(t[0]), x2: rx(t[0]), y1: RT, y2: RT + RS, "class": "w-grid" }, r);
      el("line", { x1: R0, x2: R0 + RS, y1: ry(t[0]), y2: ry(t[0]), "class": "w-grid" }, r);
      text(r, rx(t[0]), RT + RS + 16, t[1], "t-tick", "middle");
      if (t[0]) text(r, R0 - 8, ry(t[0]) + 4, t[1], "t-tick", "end");
    });
    el("rect", { x: R0, y: RT, width: RS, height: RS, "class": "w-frame" }, r);
    text(r, R0 + RS / 2, RT + RS + 36, "False positive rate", "t-axis", "middle");
    el("text", { x: 0, y: 0, transform: "translate(14 " + (RT + RS / 2) + ") rotate(-90)", "text-anchor": "middle", "class": "t-axis" }, r,
      "True positive rate");
    el("line", { x1: rx(0), y1: ry(0), x2: rx(1), y2: ry(1), "class": "w-diag" }, r);
    el("text", { x: 0, y: 0, transform: "translate(" + (rx(0.62) + 11) + " " + (ry(0.62) + 11) + ") rotate(-45)", "text-anchor": "middle", "class": "t-faint" }, r,
      "random guessing");

    // ROC points, one per distinct score, from the strictest threshold down.
    var ROC = MEMBER_POP.concat(NONMEMBER_POP).sort(function (a, b) { return b - a; })
      .filter(function (v, i, a) { return i === 0 || v !== a[i - 1]; })
      .map(function (c) { var f = flagged(c); f.c = c; return f; });
    var area = el("path", { "class": "w-roc-area" }, r);
    var curve = el("path", { "class": "w-roc" }, r);
    var pt = el("circle", { r: 5, "class": "w-roc-pt" }, r);
    function drawRoc(drawnTo, f) {
      var d = "M" + rx(0) + " " + ry(0), last = { fpr: 0 };
      for (var i = 0; i < ROC.length && ROC[i].c >= drawnTo; i++) {
        d += "L" + rx(ROC[i].fpr).toFixed(1) + " " + ry(ROC[i].tpr).toFixed(1);
        last = ROC[i];
      }
      curve.setAttribute("d", d);
      area.setAttribute("d", d + "L" + rx(last.fpr).toFixed(1) + " " + ry(0) + "Z");
      pt.setAttribute("cx", rx(f.fpr).toFixed(1));
      pt.setAttribute("cy", ry(f.tpr).toFixed(1));
    }

    var CX = 262;
    text(r, CX, 40, "Aggregate AUC", "t-title");
    text(r, CX, 72, pct(AGG_AUC), "t-huge");
    text(r, CX, 92, "area under the curve");
    var tHead = text(r, CX, 140, "", "t-strong");
    var tIn = text(r, CX, 160, "", "t-in");
    var tOut = text(r, CX, 180, "", "t-out");

    function paint(thr, drawnTo) {
      var tx = sx(thr);
      thrLine.setAttribute("x1", tx); thrLine.setAttribute("x2", tx);
      thrLab.setAttribute("x", Math.max(S0 + 26, Math.min(S1 - 26, tx)));
      dots.forEach(function (d) { d.node.classList.toggle("dim", d.v < thr); });
      var f = flagged(thr);
      drawRoc(drawnTo, f);
      tHead.textContent = "Threshold: " + (thr > SCORE_MAX ? "+\u221e" : thr < SCORE_MIN ? "\u2212\u221e" : dec(thr));
      tIn.textContent = "TPR " + pct(f.tpr) + (state.narrow ? "" : " of members");
      tOut.textContent = "FPR " + pct(f.fpr) + (state.narrow ? "" : " of non-members");
    }
    paint(THR_END, THR_END);

    hooks[6] = function () {
      if (reduce || !window.requestAnimationFrame) return;
      var id = ++tweenId, t0 = null;
      var ease = function (u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };
      paint(THR_START, THR_START);
      function frame(ts) {
        if (id !== tweenId || state.step !== 6) return;
        if (t0 === null) t0 = ts;
        var u = Math.min(1, (ts - t0) / 3600);
        var thr = THR_START + (THR_END - THR_START) * ease(u);
        paint(thr, thr);
        if (u < 1) window.requestAnimationFrame(frame);
      }
      window.requestAnimationFrame(frame);
    };
  }

  /* ------------------------------------------------------ scene 4: step 7 */
  // Illustrative target records, sorted from least to most exposed. For each
  // one, the target models' confidence scores are Gaussian: one distribution
  // for models trained with the record, one for models trained without it.
  // Exposure t runs from 0 (typical) to 1 (most exposed), with most records
  // near 0. The gap between the two means grows from 0.2 to 1.5 points while
  // both spreads stay around 0.45–0.6 points; the AUC follows from both.
  var RECORDS = [];
  for (var ri = 0; ri < 24; ri++) {
    var t = Math.pow(ri / 23, 3);
    var gap = 0.002 + 0.013 * t;
    var outSd = 0.0055 - 0.001 * t;
    var inSd = outSd * (0.92 + 0.16 * ((ri * 3) % 5) / 4);
    var rec = { gap: gap, inMu: gap / 2, inSd: inSd, outMu: -gap / 2, outSd: outSd };
    rec.auc = gaussAuc(rec);
    RECORDS.push(rec);
  }
  RECORDS.sort(function (a, b) { return a.auc - b.auc; });
  // Records receive very different predictions (57–97%), and how confident a
  // prediction is says little about exposure: highly exposed records can get
  // high confidence (the most exposed sits near 94%) or low confidence.
  // Each record's two distributions sit around its centre.
  var CENTRES = [88, 95, 72, 91, 84, 61, 93, 79, 97, 86, 68, 90, 94, 57, 83, 89, 76, 92, 65, 87, 96, 81, 58, 94];
  RECORDS.forEach(function (rec, i) {
    rec.centre = CENTRES[i] / 100;
    rec.inMu = rec.centre + rec.gap / 2;
    rec.outMu = rec.centre - rec.gap / 2;
  });

  // A fresh mix of 8 models trained with and 8 without the target record.
  function shuffledPattern(seed) {
    var a = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], x = seed * 7919 + 17;
    for (var i = a.length - 1; i > 0; i--) {
      x = (x * 9301 + 49297) % 233280;
      var j = Math.floor(x / 233280 * (i + 1)), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function erfc01(z) { return 1 - Phi(z); }   // share of a Gaussian above z standard deviations

  function sceneRecords(svg, P) {
    var s = on(el("g", {}, svg), [7]);
    var l = block(s, P.left), r = block(s, P.right);

    /* Left: target models, split by whether they were trained on the target record. */
    text(l, 130, 12, "Target models", "t-title", "middle");
    text(l, 130, 28, "the study trained 200 per dataset", null, "middle");
    var slot = function (w, k) { return [(w ? 50 : 168) + (k % 2) * 42, 70 + Math.floor(k / 2) * 40]; };
    var groups = [[], []];
    for (var k = 0; k < 8; k++) {
      groups[1].push(model(l, slot(1, k)[0], slot(1, k)[1], 32, true));
      groups[0].push(model(l, slot(0, k)[0], slot(0, k)[1], 32, false));
    }
    var groupLabels = el("g", {}, l);
    el("line", { x1: 130, x2: 130, y1: 56, y2: 212, "class": "w-leader" }, groupLabels);
    text(groupLabels, 71, 236, "With target record", "t-in", "middle");
    text(groupLabels, 189, 236, "Without it", "t-out", "middle");

    function split(pattern, fadeIn) {
      var n = [0, 0];
      pattern.forEach(function (w, i) {
        var k = n[w]++, g = slot(w, k);
        var from = "translate(" + (64 + (i % 4) * 44 - g[0]) + "px," + (70 + Math.floor(i / 4) * 40 - g[1]) + "px)";
        play(groups[w][k], [
          { transform: from, opacity: fadeIn ? 0 : 1 },
          { transform: from, opacity: 1, offset: 0.25 },
          { transform: from, opacity: 1, offset: 0.45 },
          { transform: "translate(0px,0px)", opacity: 1 }
        ], { duration: 1600, delay: i * 25, easing: "ease-in-out", fill: "backwards" });
      });
      play(groupLabels, [{ opacity: 0 }, { opacity: 0, offset: 0.8 }, { opacity: 1 }], { duration: 2000, fill: "backwards" });
    }

    /* Right: one ROC curve per target record. */
    var R0 = 52, RS = 182, RT = 22;
    var rx = function (f) { return R0 + f * RS; };
    var ry = function (t) { return RT + (1 - t) * RS; };
    [[0, "0%"], [0.5, "50%"], [1, "100%"]].forEach(function (t) {
      el("line", { x1: rx(t[0]), x2: rx(t[0]), y1: RT, y2: RT + RS, "class": "w-grid" }, r);
      el("line", { x1: R0, x2: R0 + RS, y1: ry(t[0]), y2: ry(t[0]), "class": "w-grid" }, r);
      text(r, rx(t[0]), RT + RS + 16, t[1], "t-tick", "middle");
      if (t[0]) text(r, R0 - 8, ry(t[0]) + 4, t[1], "t-tick", "end");
    });
    el("rect", { x: R0, y: RT, width: RS, height: RS, "class": "w-frame" }, r);
    text(r, R0 + RS / 2, RT + RS + 36, "False positive rate", "t-axis", "middle");
    el("text", { x: 0, y: 0, transform: "translate(8 " + (RT + RS / 2) + ") rotate(-90)", "text-anchor": "middle", "class": "t-axis" }, r,
      "True positive rate");
    el("line", { x1: rx(0), y1: ry(0), x2: rx(1), y2: ry(1), "class": "w-diag" }, r);

    var curvesG = el("g", {}, r);
    var curves = RECORDS.map(function (p) {
      var lo = Math.min(p.inMu - 5 * p.inSd, p.outMu - 5 * p.outSd);
      var hi = Math.max(p.inMu + 5 * p.inSd, p.outMu + 5 * p.outSd);
      var pts = [[rx(0), ry(0)]];
      for (var j = 0; j <= 90; j++) {
        var t = hi - (hi - lo) * j / 90;
        pts.push([rx(erfc01((t - p.outMu) / p.outSd)), ry(erfc01((t - p.inMu) / p.inSd))]);
      }
      pts.push([rx(1), ry(1)]);
      var d = "M" + pts.map(function (q) { return q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("L");
      return { node: el("path", { d: d, "class": "w-pcurve" }, curvesG), pts: pts };
    });
    var hit = el("rect", { x: R0 - 6, y: RT - 6, width: RS + 12, height: RS + 12, "class": "w-hit" }, r);

    /* Right column: the selected record's AUC and score distributions. */
    var CX = 258, CW = 176;
    var title = text(r, CX, 14, "", "t-title");
    var aucG = el("g", {}, r);
    var aucT = text(aucG, CX, 46, "", "t-huge");
    text(aucG, CX, 64, "record-level AUC", "t-faint");

    // The axis zooms to 3 points either side of the selected record's centre.
    var distG = el("g", {}, r);
    var DB = 180, DH = 88, D0 = 0, D1 = 1;
    var dx = function (v) { return CX + (v - D0) / (D1 - D0) * CW; };
    var ticksG = el("g", {}, distG);
    el("line", { x1: CX, x2: CX + CW, y1: DB, y2: DB, "class": "w-axis" }, r);
    text(r, CX + CW / 2, DB + 32, "Confidence score", "t-axis", "middle");
    text(r, CX, DB + 54, "With target record", "t-in");
    text(r, CX, DB + 70, "Without it", "t-out");
    var outArea = el("path", { "class": "w-out-area" }, distG);
    var outLine = el("path", { "class": "w-out-line" }, distG);
    var inArea = el("path", { "class": "w-in-area" }, distG);
    var inLine = el("path", { "class": "w-in-line" }, distG);
    // Each record's pair of curves is scaled to fill the chart height.
    var kD = 1;
    function dist(mu, sd, line, area) {
      var pts = [];
      for (var j = 0; j <= 200; j++) {
        var v = D0 + (D1 - D0) * j / 200;
        pts.push(dx(v).toFixed(1) + " " + (DB - Math.min(DH, pdf(v, mu, sd) * kD)).toFixed(1));
      }
      line.setAttribute("d", "M" + pts.join("L"));
      area.setAttribute("d", "M" + CX + " " + DB + "L" + pts.join("L") + "L" + (CX + CW) + " " + DB + "Z");
    }

    var status = root.querySelector('[data-walk="record-status"]');
    function show(i) {
      var p = RECORDS[i];
      curves.forEach(function (c, j) { c.node.classList.toggle("sel", j === i); });
      curvesG.appendChild(curves[i].node);
      title.textContent = "Record " + (i + 1) + " of " + RECORDS.length;
      aucT.textContent = pct(p.auc);
      D0 = p.centre - 0.03; D1 = p.centre + 0.03;
      ticksG.textContent = "";
      [-0.02, 0, 0.02].forEach(function (o) {
        var v = p.centre + o;
        el("line", { x1: dx(v), x2: dx(v), y1: DB - DH, y2: DB, "class": "w-grid" }, ticksG);
        text(ticksG, dx(v), DB + 15, pct(v), "t-tick", "middle");
      });
      kD = (DH - 2) / pdf(0, 0, Math.min(p.inSd, p.outSd));
      dist(p.outMu, p.outSd, outLine, outArea);
      dist(p.inMu, p.inSd, inLine, inArea);
      if (status) status.textContent = "Selected: record " + (i + 1) + " of " + RECORDS.length +
        ", with confidence scores around " + pct(p.centre) + " and a record-level AUC of " + pct(p.auc) + ".";
    }
    function reveal() {
      [distG, aucG].forEach(function (g) {
        play(g, [{ opacity: 0 }, { opacity: 0, offset: 0.75 }, { opacity: 1 }], { duration: 2200, fill: "backwards" });
      });
    }
    show(state.record);

    selectRecord = function (i) {
      i = Math.max(0, Math.min(RECORDS.length - 1, i));
      state.record = i;
      stopAll();
      show(i);
      split(shuffledPattern(++state.shuffles), false);
      reveal();
    };

    // Hovering highlights the nearest curve; clicking selects it.
    function nearest(evt) {
      var m = r.getScreenCTM();
      if (!m) return -1;
      var q = svgRoot.createSVGPoint();
      q.x = evt.clientX; q.y = evt.clientY;
      q = q.matrixTransform(m.inverse());
      var best = -1, bd = 14 * 14;
      curves.forEach(function (c, j) {
        c.pts.forEach(function (p) {
          var d = (p[0] - q.x) * (p[0] - q.x) + (p[1] - q.y) * (p[1] - q.y);
          if (d < bd) { bd = d; best = j; }
        });
      });
      return best;
    }
    hit.addEventListener("pointermove", function (evt) {
      var j = nearest(evt);
      curves.forEach(function (c, k) { c.node.classList.toggle("hot", k === j && k !== state.record); });
    });
    hit.addEventListener("pointerleave", function () {
      curves.forEach(function (c) { c.node.classList.remove("hot"); });
    });
    hit.addEventListener("click", function (evt) {
      var j = nearest(evt);
      if (j >= 0 && j !== state.record) selectRecord(j);
    });

    hooks[7] = function () {
      split(shuffledPattern(state.shuffles), true);
      play(curvesG, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 200, fill: "backwards" });
      reveal();
    };
  }

  /* ------------------------------------------------------ scene 5: step 8 */
  function scenePatient(svg, P) {
    var s = on(el("g", {}, svg), [8]);
    var l = block(s, P.left), r = block(s, P.right);

    text(l, 130, 12, "One patient", "t-title", "middle");
    text(l, 130, 30, "several records", null, "middle");
    person(l, 130, 78);
    [60, 130, 200].forEach(function (cx, i) {
      el("path", { d: "M130 104V124H" + cx + "V140", "class": "w-wire" }, l);
      el("rect", { x: cx - 22, y: 140, width: 44, height: 52, rx: 5, "class": "w-tile" }, l);
      record(l, cx, 166, 14);
      text(l, cx, 212, "Visit " + (i + 1), null, "middle");
    });

    var A = 160, x = function (v) { return A + (v - 0.5) / 0.5 * (X1 - A); };
    [0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach(function (t) {
      el("line", { x1: x(t), x2: x(t), y1: 26, y2: 226, "class": "w-grid" }, r);
      text(r, x(t), 244, pct(t), "t-tick", "middle");
    });
    text(r, (A + X1) / 2, 264, "Attack AUC (50% is a coin toss)", "t-axis", "middle");

    var best = Math.max.apply(null, PATIENT);
    var rows = PATIENT.map(function (v, i) { return { label: "Visit " + (i + 1) + " record", v: v, y: 44 + i * 34, cls: "w-bar" }; });
    rows.push({ label: "Patient", v: best, y: 162, cls: "w-bar patient", strong: true });
    rows.push({ label: "Whole dataset", v: AGG_AUC, y: 206, cls: "w-bar agg" });
    el("line", { x1: 0, x2: X1, y1: 136, y2: 136, "class": "w-axis" }, r);

    var bars = [];
    rows.forEach(function (row) {
      text(r, A - 12, row.y + 4, row.label, row.strong ? "t-strong" : null, "end");
      bars.push(el("rect", { x: A, y: row.y - 6, width: x(row.v) - A, height: 12, rx: 2, "class": row.cls + " grow" }, r));
      text(r, x(row.v) + 6, row.y + 4, pct(row.v), row.strong || row.v === best ? "t-strong" : null);
    });
    text(r, A - 12, 162 + 18, "highest record", "t-faint", "end");

    hooks[8] = function () {
      bars.forEach(function (b, i) {
        play(b, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
          { duration: 600, delay: 150 + i * 160, easing: "cubic-bezier(.3,0,.2,1)", fill: "backwards" });
      });
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
    sceneQuery(svgRoot, narrow);
    sceneReference(svgRoot, P);
    sceneAggregate(svgRoot, P);
    sceneRecords(svgRoot, P);
    scenePatient(svgRoot, P);
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
  var dots = [], part = null, partName = null;
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
    dots.push(b);
  });
  Array.prototype.forEach.call(progress.children, function (p) {
    p.style.flexGrow = p.lastChild.children.length;
  });

  nav.appendChild(back);
  nav.appendChild(progress);
  nav.appendChild(next);

  back.addEventListener("click", function () { go(state.step - 1); });
  next.addEventListener("click", function () {
    if (state.step < N) { go(state.step + 1); return; }
    var target = document.getElementById("patients");
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

  Array.prototype.forEach.call(root.querySelectorAll("[data-pick]"), function (b) {
    b.addEventListener("click", function () {
      if (!selectRecord) return;
      var how = b.getAttribute("data-pick");
      selectRecord(how === "max" ? Infinity : state.record + (how === "next" ? 1 : -1));
    });
  });

  function apply(animate) {
    var n = state.step;
    items.forEach(function (li, i) { li.hidden = i + 1 !== n; });
    dots.forEach(function (d, i) {
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
  // Text in the diagram is measured, so redraw once the web fonts have loaded.
  // Rebuilding cancels running animations, so replay the current step's.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
    build(true);
    if (state.seen && hooks[state.step]) hooks[state.step]();
  });

  var pending = false;
  window.addEventListener("resize", function () {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function () { pending = false; build(); });
  });

  // Play the first step's animation once the walkthrough scrolls into view.
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

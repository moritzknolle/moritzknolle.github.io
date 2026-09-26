(function () {
  "use strict";

  var DATA = window.PRIVACY_RISK;
  if (!DATA) return;

  var SVG_NS = "http://www.w3.org/2000/svg";
  var T = DATA.thresholds;           // 0.5 … 1.0 in steps of 0.0025
  var STEP = 0.0025;
  var DATASETS = DATA.datasets;
  var PANELS = DATA.panels;
  var MINUS = "−";

  var state = { dataset: "embed", threshold: 0.9 };
  var tip = document.getElementById("tooltip");

  /* --------------------------------------------------------------- helpers */
  function svg(tag, attrs, parent, text) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  function html(tag, cls, parent, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  function byId(id) {
    for (var i = 0; i < DATASETS.length; i++) if (DATASETS[i].id === id) return DATASETS[i];
  }
  function tIndex(t) {
    return Math.max(0, Math.min(T.length - 1, Math.round((t - 0.5) / STEP)));
  }
  function int(n) { return Math.round(n).toLocaleString("en-US"); }
  // 0.9 → "0.90", 0.9025 → "0.9025"
  function fmtT(t) {
    var s = t.toFixed(4).replace(/0+$/, "");
    return s.length < 4 ? t.toFixed(2) : s;
  }

  // 0.4 → "40%", 0.0185 → "1.9%", 0.00185 → "0.19%", 0.0000577 → "0.0058%"
  function pct(v) {
    var p = v * 100;
    if (p === 0) return "0%";
    if (p >= 10) return p.toFixed(0) + "%";
    if (p >= 1) return p.toFixed(1) + "%";
    return Number(p.toPrecision(2)).toString() + "%";
  }
  function signedPct(rel) {
    var p = Math.round(rel * 100);
    return (p > 0 ? "+" : p < 0 ? MINUS : "") + Math.abs(p).toLocaleString("en-US") + "%";
  }
  var SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  function sup(s) { return String(s).split("").map(function (c) { return SUP[c] || c; }).join(""); }
  function pValue(str) {
    var v = Number(str);
    if (v === 0) return "p < 10" + sup(-100);
    if (v < 0.001) {
      var e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e);
      return "p = " + m.toFixed(1) + " × 10" + sup(e);
    }
    return "p = " + (v < 0.01 ? v.toFixed(3) : v.toFixed(2));
  }

  /* --------------------------------------------------------------- tooltip */
  function showTip(build, x, y) {
    tip.textContent = "";
    build(tip);
    tip.hidden = false;
    var r = tip.getBoundingClientRect();
    var left = x + 16, top = y + 16;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 16;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 16;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }
  function hideTip() { tip.hidden = true; }

  /* ------------------------------------------------------ dataset controls */
  var chipGroups = Array.prototype.slice.call(document.querySelectorAll("[data-dataset-chips]"));
  chipGroups.forEach(function (group) {
    DATASETS.forEach(function (d) {
      var b = html("button", "chip", group);
      b.type = "button";
      b.dataset.id = d.id;
      b.appendChild(document.createTextNode(d.name));
      html("small", null, b, d.modality.split(" ")[0]);
      b.addEventListener("click", function () { setDataset(d.id); });
    });
  });

  function setDataset(id) {
    state.dataset = id;
    chipGroups.forEach(function (group) {
      Array.prototype.forEach.call(group.children, function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.id === id));
      });
    });
    updateStats();
    drawEsf();
    drawScatter();
    drawPanels();
  }

  /* ------------------------------------------- finding 1: individual level */
  var slider = document.getElementById("threshold");
  var sliderOut = document.getElementById("threshold-out");
  slider.min = "0.55";
  slider.addEventListener("input", function () { setThreshold(Number(slider.value)); });

  function setThreshold(t) {
    t = Math.max(Number(slider.min), Math.min(1, Math.round(t / STEP) * STEP));
    state.threshold = t;
    slider.value = String(t);
    sliderOut.textContent = fmtT(t);
    updateStats();
    drawEsf();
  }

  function updateStats() {
    var d = byId(state.dataset);
    var i = tIndex(state.threshold);
    var n = d.counts[i];
    var unaffected = (d.patients - d.counts[tIndex(0.6)]) / d.patients;
    var label = d.patientIds ? "patients" : "images";

    document.getElementById("s-agg").textContent = d.aggregateAuc.toFixed(2);
    document.getElementById("s-low").textContent = pct(unaffected);
    document.getElementById("s-high-label").textContent =
      "Attack AUC ≥ " + sliderOut.textContent;
    document.getElementById("s-high").textContent = n ? pct(n / d.patients) : "None";
    document.getElementById("s-high-note").textContent = n
      ? int(n) + " of " + int(d.patients) + " " + label + ", about 1 in " + int(d.patients / n)
      : "of " + int(d.patients) + " " + label + "; the most exposed reaches " + d.maxAuc.toFixed(2);
  }

  var esfBox = document.getElementById("esf");

  function drawEsf() {
    var W = esfBox.clientWidth || 640;
    var narrow = W < 560;
    var H = narrow ? 300 : 370;
    var m = { l: 56, r: narrow ? 12 : 104, t: 14, b: 48 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var LOG_MIN = -6;
    var x = function (v) { return m.l + (v - 0.5) / 0.5 * pw; };
    var y = function (s) { return m.t + (-Math.log10(s)) / -LOG_MIN * ph; };

    esfBox.textContent = "";
    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H }, esfBox);

    // grid + y ticks (powers of ten)
    var grid = svg("g", { "class": "grid" }, root);
    var ticks = svg("g", { "class": "tick" }, root);
    for (var e = 0; e >= LOG_MIN; e--) {
      var yy = y(Math.pow(10, e));
      svg("line", { x1: m.l, x2: m.l + pw, y1: yy, y2: yy }, grid);
      svg("text", { x: m.l - 8, y: yy + 3.5, "text-anchor": "end" }, ticks, pct(Math.pow(10, e)));
    }
    // x axis
    var axis = svg("g", { "class": "axis" }, root);
    svg("line", { x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph }, axis);
    for (var v = 0.5; v <= 1.0001; v += 0.1) {
      svg("line", { x1: x(v), x2: x(v), y1: m.t + ph, y2: m.t + ph + 4 }, axis);
      svg("text", { x: x(v), y: m.t + ph + 17, "text-anchor": "middle" }, axis, v.toFixed(1));
    }
    svg("text", { "class": "axis-title", x: m.l + pw / 2, y: H - 6, "text-anchor": "middle" }, root,
      "Patient-level attack AUC (0.5 = guessing, 1.0 = certain)");
    svg("text", { "class": "axis-title", transform: "rotate(-90)", x: -(m.t + ph / 2), y: 12, "text-anchor": "middle" }, root,
      "Share of patients at or above");

    // series: context first, selected last so it sits on top
    var order = DATASETS.filter(function (d) { return d.id !== state.dataset; }).concat([byId(state.dataset)]);
    order.forEach(function (d) {
      var on = d.id === state.dataset;
      var pts = [];
      for (var i = 0; i < T.length && d.counts[i] > 0; i++) pts.push(x(T[i]).toFixed(1) + "," + y(d.counts[i] / d.patients).toFixed(1));
      svg("polyline", { "class": "series" + (on ? " on" : ""), points: pts.join(" ") }, root);
      if (on && pts.length) {
        var last = pts[pts.length - 1].split(",");
        var lx = Number(last[0]), ly = Number(last[1]);
        svg("circle", { cx: lx, cy: ly, r: 4, "class": "threshold-dot" }, root);
        var right = !narrow || lx < m.l + pw - 90;
        svg("text", { "class": "series-label on", x: right ? lx + 8 : lx - 8, y: ly - 6, "text-anchor": right ? "start" : "end" }, root,
          "max " + d.maxAuc.toFixed(2));
      }
    });

    // whole-dataset score marker on the x axis
    var d = byId(state.dataset);
    var ax = x(d.aggregateAuc), ay = m.t + ph;
    svg("path", { "class": "agg-marker", d: "M" + ax + "," + (ay - 1) + " l-5,-8 h10 z" }, root);
    svg("text", { "class": "annot", x: ax + 8, y: ay - 6 }, root, "whole dataset " + d.aggregateAuc.toFixed(2));

    // threshold
    var t = state.threshold, ti = tIndex(t), tx = x(t);
    svg("line", { "class": "threshold-line", x1: tx, x2: tx, y1: m.t, y2: m.t + ph }, root);
    var share = d.counts[ti] / d.patients;
    if (share > 0) svg("circle", { "class": "threshold-dot", cx: tx, cy: y(share), r: 4.5 }, root);

    // hover + click layer
    var cross = svg("line", { "class": "crosshair", y1: m.t, y2: m.t + ph, visibility: "hidden" }, root);
    var hit = svg("rect", { x: m.l, y: m.t, width: pw, height: ph, fill: "transparent", style: "cursor:crosshair" }, root);
    function at(evt) {
      var r = root.getBoundingClientRect();
      var px = (evt.clientX - r.left) * (W / r.width);
      return 0.5 + Math.max(0, Math.min(1, (px - m.l) / pw)) * 0.5;
    }
    hit.addEventListener("pointermove", function (evt) {
      var i = tIndex(at(evt));
      cross.setAttribute("x1", x(T[i])); cross.setAttribute("x2", x(T[i]));
      cross.setAttribute("visibility", "visible");
      showTip(function (box) {
        html("div", "tt-title", box, "Attack AUC ≥ " + fmtT(T[i]));
        DATASETS.forEach(function (ds) {
          var row = html("div", "tt-row" + (ds.id === state.dataset ? " on" : ""), box);
          html("i", "lk", row);
          html("b", null, row, ds.counts[i] ? pct(ds.counts[i] / ds.patients) : "none");
          html("span", null, row, ds.name);
        });
      }, evt.clientX, evt.clientY);
    });
    hit.addEventListener("pointerleave", function () { cross.setAttribute("visibility", "hidden"); hideTip(); });
    hit.addEventListener("click", function (evt) { setThreshold(at(evt)); });
  }

  function buildEsfTable() {
    var table = document.getElementById("esf-table");
    var head = html("tr", null, html("thead", null, table));
    ["Dataset", "Data", "Patients", "Whole-dataset AUC", "AUC < 0.6", "≥ 0.8", "≥ 0.9", "≥ 0.95", "Highest"].forEach(function (h) { html("th", null, head, h); });
    var body = html("tbody", null, table);
    DATASETS.forEach(function (d) {
      var tr = html("tr", null, body);
      [d.name, d.modality, int(d.patients), d.aggregateAuc.toFixed(2),
        pct((d.patients - d.counts[tIndex(0.6)]) / d.patients),
        pct(d.counts[tIndex(0.8)] / d.patients), pct(d.counts[tIndex(0.9)] / d.patients),
        pct(d.counts[tIndex(0.95)] / d.patients), d.maxAuc.toFixed(2)
      ].forEach(function (v) { html("td", null, tr, v); });
    });
  }

  /* ------------------------------------------------ finding 2: group level */
  function datasetName(id) { return byId(id).name; }

  var POINTS = [];
  PANELS.forEach(function (p) {
    p.groups.forEach(function (g) {
      if (g.tailCount > 0 && g.trainShare > 0) {
        POINTS.push({ panel: p, group: g, ratio: g.tailShare / g.trainShare });
      }
    });
  });

  function groupTip(p, g) {
    return function (box) {
      html("div", "tt-title", box, g.label);
      html("div", "tt-sub", box, datasetName(p.dataset) + " · " + p.attribute);
      var r1 = html("div", "tt-row", box); html("b", null, r1, pct(g.trainShare)); html("span", null, r1, "of training data");
      var r2 = html("div", "tt-row", box); html("b", null, r2, pct(g.tailShare)); html("span", null, r2, "of the 1% most vulnerable (" + int(g.tailCount) + " records)");
      var r3 = html("div", "tt-row", box); html("b", null, r3, signedPct(g.relChange));
      html("span", null, r3, p.significant ? "vs. expected" : "vs. expected, not significant");
    };
  }

  var scatterBox = document.getElementById("scatter");

  function drawScatter() {
    var W = scatterBox.clientWidth || 640;
    var narrow = W < 560;
    var H = narrow ? 320 : 390;
    var m = { l: 50, r: 14, t: 14, b: 48 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var X0 = -4, X1 = 0, Y0 = Math.log10(0.05), Y1 = Math.log10(20);
    var x = function (v) { return m.l + (Math.log10(v) - X0) / (X1 - X0) * pw; };
    var y = function (v) { return m.t + (Y1 - Math.log10(v)) / (Y1 - Y0) * ph; };

    scatterBox.textContent = "";
    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H }, scatterBox);
    var grid = svg("g", { "class": "grid" }, root);
    var ticks = svg("g", { "class": "tick" }, root);

    [0.1, 0.2, 0.5, 1, 2, 5, 10].forEach(function (v) {
      if (v !== 1) svg("line", { x1: m.l, x2: m.l + pw, y1: y(v), y2: y(v) }, grid);
      svg("text", { x: m.l - 8, y: y(v) + 3.5, "text-anchor": "end" }, ticks, v + "×");
    });
    for (var e = X0; e <= X1; e++) {
      svg("line", { x1: x(Math.pow(10, e)), x2: x(Math.pow(10, e)), y1: m.t, y2: m.t + ph }, grid);
      svg("text", { x: x(Math.pow(10, e)), y: m.t + ph + 17, "text-anchor": "middle" }, ticks, pct(Math.pow(10, e)));
    }
    svg("line", { "class": "ref-line", x1: m.l, x2: m.l + pw, y1: y(1), y2: y(1) }, root);
    svg("text", { "class": "region", x: m.l + pw - 4, y: m.t + 12, "text-anchor": "end" }, root, "OVERREPRESENTED ↑");
    svg("text", { "class": "region", x: m.l + pw - 4, y: m.t + ph - 8, "text-anchor": "end" }, root, "UNDERREPRESENTED ↓");
    svg("text", { "class": "annot", x: m.l + 6, y: y(1) - 6 }, root, "as expected from group size");

    svg("text", { "class": "axis-title", x: m.l + pw / 2, y: H - 6, "text-anchor": "middle" }, root,
      "Group’s share of the training data");
    svg("text", { "class": "axis-title", transform: "rotate(-90)", x: -(m.t + ph / 2), y: 12, "text-anchor": "middle" }, root,
      narrow ? "Share among most vulnerable ÷ expected" : "Share among the 1% most vulnerable ÷ expected share");

    var sorted = POINTS.slice().sort(function (a, b) {
      return (a.panel.dataset === state.dataset) - (b.panel.dataset === state.dataset);
    });
    var nodes = sorted.map(function (pt) {
      var on = pt.panel.dataset === state.dataset;
      var cls = "pt " + (pt.ratio >= 1 ? "over" : "under") + (pt.panel.significant ? "" : " ns") + (on ? "" : " dim");
      var c = svg("circle", { "class": cls, cx: x(pt.group.trainShare), cy: y(pt.ratio), r: on ? 5.5 : 4.5 }, root);
      return { pt: pt, node: c, cx: x(pt.group.trainShare), cy: y(pt.ratio) };
    });

    var hot = null;
    function nearest(evt) {
      var r = root.getBoundingClientRect(), k = W / r.width;
      var px = (evt.clientX - r.left) * k, py = (evt.clientY - r.top) * k;
      var best = null, bestD = 24 * 24;
      nodes.forEach(function (n) {
        var dd = (n.cx - px) * (n.cx - px) + (n.cy - py) * (n.cy - py);
        // prefer the highlighted dataset when points overlap
        if (n.pt.panel.dataset !== state.dataset) dd += 30;
        if (dd < bestD) { bestD = dd; best = n; }
      });
      return best;
    }
    root.addEventListener("pointermove", function (evt) {
      var n = nearest(evt);
      if (hot && hot !== n) hot.node.classList.remove("hot");
      hot = n;
      if (!n) { hideTip(); root.style.cursor = ""; return; }
      n.node.classList.add("hot");
      root.style.cursor = "pointer";
      showTip(groupTip(n.pt.panel, n.pt.group), evt.clientX, evt.clientY);
    });
    root.addEventListener("pointerleave", function () { if (hot) hot.node.classList.remove("hot"); hot = null; hideTip(); });
    root.addEventListener("click", function (evt) {
      var n = nearest(evt);
      if (n && n.pt.panel.dataset !== state.dataset) setDataset(n.pt.panel.dataset);
    });
  }

  var panelsBox = document.getElementById("panels");

  function drawPanels() {
    panelsBox.textContent = "";
    PANELS.filter(function (p) { return p.dataset === state.dataset; }).forEach(function (p) {
      var card = html("div", "panel" + (p.significant ? "" : " ns"), panelsBox);
      html("h3", null, card, p.attribute);
      html("p", "sig", card, (p.significant ? p.stars + " " : "Not significant · ") +
        "χ² = " + p.chi2.toLocaleString("en-US") + ", " + pValue(p.p));
      var rows = html("div", "rows", card);
      p.groups.forEach(function (g) {
        var rel = g.relChange;
        var dir = g.tailShare >= g.trainShare ? "over" : "under";
        var row = html("div", "row", rows);
        row.tabIndex = 0;
        row.setAttribute("aria-label", g.label + ": " + pct(g.trainShare) + " of training data, " +
          pct(g.tailShare) + " of the most vulnerable 1%, " + signedPct(rel) + (p.significant ? "" : ", not significant"));
        html("span", "row-label", row, g.label);
        var track = html("span", "track", row);
        var a = g.trainShare * 100, b = g.tailShare * 100;
        var bar = html("i", "bar " + dir, track);
        bar.style.left = Math.min(a, b) + "%";
        bar.style.width = Math.abs(b - a) + "%";
        html("i", "m train", track).style.left = a + "%";
        html("i", "m tail " + dir, track).style.left = b + "%";
        html("span", "row-delta" + (p.significant ? "" : " ns"), row, signedPct(rel));

        var show = groupTip(p, g);
        row.addEventListener("pointermove", function (evt) { showTip(show, evt.clientX, evt.clientY); });
        row.addEventListener("pointerleave", hideTip);
        row.addEventListener("focus", function () {
          var r = row.getBoundingClientRect();
          showTip(show, r.left + r.width / 2, r.bottom - 8);
        });
        row.addEventListener("blur", hideTip);
      });
      var scale = html("div", "row scale-row", card);
      scale.setAttribute("aria-hidden", "true");
      html("span", null, scale);
      var s = html("span", "scale", scale);
      ["0%", "50%", "100%"].forEach(function (t) { html("span", null, s, t); });
      html("span", null, scale);
    });
  }

  function buildGroupsTable() {
    var table = document.getElementById("groups-table");
    var head = html("tr", null, html("thead", null, table));
    ["Dataset", "Group", "Training share", "Share of top 1%", "Top-1% records", "Relative change", "Test"].forEach(function (h) { html("th", null, head, h); });
    var body = html("tbody", null, table);
    PANELS.forEach(function (p) {
      p.groups.forEach(function (g) {
        var tr = html("tr", null, body);
        [datasetName(p.dataset), p.attribute + ": " + g.label, pct(g.trainShare), pct(g.tailShare), int(g.tailCount),
          signedPct(g.relChange), p.significant ? p.stars : "n.s."
        ].forEach(function (v) { html("td", null, tr, v); });
      });
    });
  }

  /* ------------------------------------------------------------------ init */
  buildEsfTable();
  buildGroupsTable();
  setThreshold(state.threshold);
  setDataset(state.dataset);

  var pending = false;
  function redraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; drawEsf(); drawScatter(); });
  }
  if ("ResizeObserver" in window) {
    var lastW = [0, 0];
    new ResizeObserver(function () {
      var w = [esfBox.clientWidth, scatterBox.clientWidth];
      if (w[0] !== lastW[0] || w[1] !== lastW[1]) { lastW = w; redraw(); }
    }).observe(document.getElementById("main"));
  } else {
    window.addEventListener("resize", redraw);
  }
})();

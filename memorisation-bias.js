(function () {
  "use strict";

  var DATA = window.MEMORISATION;
  if (!DATA) return;

  var SVG_NS = "http://www.w3.org/2000/svg";
  var MINUS = "−";
  var ES = DATA.esGrid;               // 0, 0.01, …, 1
  var DATASETS = DATA.datasets;

  var state = { dataset: "mimic-cxr", es: 0.2, scenario: "denovo", condition: null, dpDataset: "mimic-ecg", dpSet: "future" };
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
  function int(n) { return Math.round(n).toLocaleString("en-US"); }
  function pct(v) {
    var p = v * 100;
    if (p === 0) return "0%";
    if (p >= 10) return p.toFixed(0) + "%";
    if (p >= 1) return p.toFixed(1) + "%";
    return Number(p.toPrecision(2)).toString() + "%";
  }
  function pp(v, digits) { return (v * 100).toFixed(digits == null ? 1 : digits); }
  function signedPp(v) {
    var s = (v * 100).toFixed(1);
    if (s === "0.0" || s === "-0.0") return "0.0";
    return (v > 0 ? "+" : MINUS) + Math.abs(v * 100).toFixed(1);
  }
  function duration(months) {
    if (months < 1) return "same month";
    var y = Math.floor(months / 12), m = months % 12;
    var parts = [];
    if (y) parts.push(y + (y === 1 ? " year" : " years"));
    if (m) parts.push(m + (m === 1 ? " month" : " months"));
    return parts.join(" ");
  }
  var SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  function pValue(v) {
    if (v < 0.001) {
      var e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e);
      return "p = " + m.toFixed(1) + " × 10" + String(e).split("").map(function (c) { return SUP[c] || c; }).join("");
    }
    return "p = " + (v < 0.01 ? v.toFixed(3) : v.toFixed(2));
  }
  function esIndex(v) { return Math.max(0, Math.min(ES.length - 1, Math.round(v * 100))); }

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
  function tipRow(box, value, label, cls) {
    var row = html("div", "tt-row" + (cls ? " " + cls : ""), box);
    html("b", null, row, value);
    html("span", null, row, label);
    return row;
  }

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
    state.condition = null;
    chipGroups.forEach(function (group) {
      Array.prototype.forEach.call(group.children, function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.id === id));
      });
    });
    updateShiftStats();
    drawShift();
    drawExamples();
    drawBins();
    drawDiag();
  }

  /* --------------------------------------------------------- dataset table */
  (function buildDatasets() {
    var table = document.getElementById("datasets-table");
    var head = html("tr", null, html("thead", null, table));
    ["Dataset", "Data", "Model", "Patients", "Historical records", "Future records"].forEach(function (h) { html("th", null, head, h); });
    var body = html("tbody", null, table);
    DATASETS.forEach(function (d) {
      var tr = html("tr", null, body);
      [d.name, d.modality, d.model.replace(/ \(.*\)/, ""), int(d.patients), int(d.histRecords), int(d.futRecords)].forEach(function (v) { html("td", null, tr, v); });
    });
  })();

  /* ----------------------------------------------- finding 1: prediction shift */
  var esSlider = document.getElementById("es-threshold");
  var esOut = document.getElementById("es-threshold-out");
  var esReadout = html("p", "es-readout");
  esReadout.setAttribute("aria-live", "polite");
  esSlider.parentNode.parentNode.insertBefore(esReadout, esSlider.parentNode.nextSibling);
  esSlider.addEventListener("input", function () { setEs(Number(esSlider.value) / 100); });

  function setEs(v) {
    v = Math.max(0.01, Math.min(0.8, Math.round(v * 100) / 100));
    state.es = v;
    esSlider.value = String(Math.round(v * 100));
    esOut.textContent = String(Math.round(v * 100));
    updateEsReadout();
    drawShift();
  }

  function updateShiftStats() {
    var d = byId(state.dataset);
    document.getElementById("s-future").textContent = pct(d.future.sig / d.future.n);
    document.getElementById("s-future-note").textContent = int(d.future.sig) + " of " + int(d.future.n) + " future " + d.unit;
    document.getElementById("s-hist").textContent = pct(d.historical.sig / d.historical.n);
    document.getElementById("s-hist-note").textContent = int(d.historical.sig) + " of " + int(d.historical.n) + " historical " + d.unit;
    document.getElementById("s-random").textContent = int(d.random.sig);
    updateEsReadout();
  }

  function updateEsReadout() {
    var d = byId(state.dataset), i = esIndex(state.es);
    var n = d.future.ccdf[i], ns = d.future.ccdfSig[i], nr = d.random.ccdf[i];
    esReadout.textContent = n
      ? int(n) + " future " + d.unit + " (" + pct(n / d.future.n) + ") shifted by at least " + Math.round(state.es * 100) +
        " percentage points; " + int(ns) + " of them significant. Randomly split models: " + int(nr) + "."
      : "No future " + d.unit + " in " + d.name + " shifted by " + Math.round(state.es * 100) +
        " percentage points or more. The largest shift was " + pp(d.future.maxEffect) + " points.";
  }

  var shiftBox = document.getElementById("shift-chart");

  function drawShift() {
    var d = byId(state.dataset);
    var W = shiftBox.clientWidth || 640, narrow = W < 560;
    var H = narrow ? 290 : 350;
    var m = { l: 78, r: narrow ? 12 : 20, t: 12, b: 46 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var LOG_MIN = -7;
    var x = function (v) { return m.l + v * pw; };
    var y = function (s) { return m.t + (-Math.log10(s)) / -LOG_MIN * ph; };

    shiftBox.textContent = "";
    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H }, shiftBox);
    var grid = svg("g", { "class": "grid" }, root), ticks = svg("g", { "class": "tick" }, root);
    for (var e = 0; e >= LOG_MIN; e--) {
      svg("line", { x1: m.l, x2: m.l + pw, y1: y(Math.pow(10, e)), y2: y(Math.pow(10, e)) }, grid);
      svg("text", { x: m.l - 8, y: y(Math.pow(10, e)) + 3.5, "text-anchor": "end" }, ticks, pct(Math.pow(10, e)));
    }
    var axis = svg("g", { "class": "axis" }, root);
    svg("line", { x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph }, axis);
    for (var v = 0; v <= 100; v += narrow ? 25 : 10) {
      svg("line", { x1: x(v / 100), x2: x(v / 100), y1: m.t + ph, y2: m.t + ph + 4 }, axis);
      svg("text", { x: x(v / 100), y: m.t + ph + 17, "text-anchor": "middle" }, axis, String(v));
    }
    svg("text", { "class": "axis-title", x: m.l + pw / 2, y: H - 6, "text-anchor": "middle" }, root,
      "Shift in average predicted probability (percentage points)");
    svg("text", { "class": "axis-title", transform: "rotate(-90)", x: -(m.t + ph / 2), y: 12, "text-anchor": "middle" }, root,
      "Share of records at or above");

    function line(set, cls) {
      var pts = [];
      for (var i = 0; i < ES.length && set.ccdf[i] > 0; i++) pts.push(x(ES[i]).toFixed(1) + "," + y(set.ccdf[i] / set.n).toFixed(1));
      svg("polyline", { "class": "series " + cls, points: pts.join(" ") }, root);
    }
    line(d.random, "random");
    line(d.historical, "hist");
    line(d.future, "on");

    // threshold
    var ti = esIndex(state.es), tx = x(ES[ti]);
    svg("line", { "class": "threshold-line", x1: tx, x2: tx, y1: m.t, y2: m.t + ph }, root);
    if (d.future.ccdf[ti] > 0) svg("circle", { "class": "threshold-dot", cx: tx, cy: y(d.future.ccdf[ti] / d.future.n), r: 4.5 }, root);

    var cross = svg("line", { "class": "crosshair", y1: m.t, y2: m.t + ph, visibility: "hidden" }, root);
    var hit = svg("rect", { x: m.l, y: m.t, width: pw, height: ph, fill: "transparent", style: "cursor:crosshair" }, root);
    function at(evt) {
      var r = root.getBoundingClientRect();
      return Math.max(0, Math.min(1, ((evt.clientX - r.left) * (W / r.width) - m.l) / pw));
    }
    hit.addEventListener("pointermove", function (evt) {
      var i = esIndex(at(evt));
      cross.setAttribute("x1", x(ES[i])); cross.setAttribute("x2", x(ES[i])); cross.setAttribute("visibility", "visible");
      showTip(function (box) {
        html("div", "tt-title", box, "Shift ≥ " + Math.round(ES[i] * 100) + " points · " + d.name);
        tipRow(box, d.future.ccdf[i] ? pct(d.future.ccdf[i] / d.future.n) : "none", "future records (" + int(d.future.ccdf[i]) + ")", "on");
        tipRow(box, d.historical.ccdf[i] ? pct(d.historical.ccdf[i] / d.historical.n) : "none", "historical training records");
        tipRow(box, d.random.ccdf[i] ? pct(d.random.ccdf[i] / d.random.n) : "none", "randomly split models");
      }, evt.clientX, evt.clientY);
    });
    hit.addEventListener("pointerleave", function () { cross.setAttribute("visibility", "hidden"); hideTip(); });
    hit.addEventListener("click", function (evt) { setEs(at(evt)); });
  }

  var KIND = {
    largest: { title: "Largest shift", text: function (d, e) { return "A future " + d.unit.replace(/s$/, "") + " recorded " + (e.months ? duration(e.months) + " after" : "in the same month as") + " the patient’s most recent training record."; } },
    yearLater: { title: "Largest shift after a year or more", text: function (d, e) { return "A future " + d.unit.replace(/s$/, "") + " recorded " + duration(e.months) + " after the patient’s most recent training record."; } },
    longest: { title: "Longest-lasting shift", text: function (d, e) { return "The longest gap with a significant shift in " + d.name + ": " + duration(e.months) + " after the patient’s most recent training record."; } }
  };

  function drawExamples() {
    var d = byId(state.dataset), box = document.getElementById("examples");
    box.textContent = "";
    d.examples.forEach(function (e) {
      var k = KIND[e.kind];
      var card = html("article", "example", box);
      html("p", "ex-kind", card, k.title);
      var v = html("p", "ex-value", card, pp(e.effect));
      html("small", null, v, "percentage points");
      html("p", "ex-text", card, k.text(d, e) + " IN and OUT models’ average predicted probability for one condition differed by this much (" + pValue(e.p) + ").");
      var wrap = html("div", null, card);
      html("i", null, html("div", "ex-track", wrap)).style.width = (e.effect * 100) + "%";
      var sc = html("div", "ex-scale", wrap);
      html("span", null, sc, "0"); html("span", null, sc, "50"); html("span", null, sc, "100 points");
    });
  }

  (function drawArch() {
    var box = document.getElementById("arch-bars");
    var max = Math.max.apply(null, DATA.architectures.map(function (a) { return a.futureSig / a.futureN; }));
    DATA.architectures.forEach(function (a) {
      var r = a.futureSig / a.futureN;
      var row = html("div", "hbar", box);
      html("span", null, row, a.model);
      html("i", null, html("span", "hb-track", row)).style.width = (r / max * 100) + "%";
      var val = html("span", "hb-value", row, pct(r) + " ");
      html("small", null, val, "(" + int(a.futureSig) + ")");
    });
  })();

  /* ------------------------------------------------- finding 2: persistence */
  var binsBox = document.getElementById("bins-chart");

  function binLabel(b) { return b.lo + "–" + b.hi; }

  function drawBins() {
    var d = byId(state.dataset);
    document.getElementById("s-longest").textContent = duration(d.maxMonthsSig);
    document.getElementById("s-longest-note").textContent = d.name + ", " + d.maxMonthsSig + " months";
    document.getElementById("s-followup").textContent = duration(d.maxMonths);

    var W = binsBox.clientWidth || 640, narrow = W < 560;
    var H = narrow ? 260 : 300;
    var m = { l: 48, r: 8, t: 22, b: 46 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var rates = d.bins.map(function (b) { return b.n ? b.sig / b.n : 0; });
    var top = Math.max(0.01, Math.ceil(Math.max.apply(null, rates) * 100 + 0.5) / 100);
    var y = function (v) { return m.t + ph - v / top * ph; };
    var band = pw / d.bins.length, bw = Math.min(24, band * 0.5);

    binsBox.textContent = "";
    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H }, binsBox);
    var grid = svg("g", { "class": "grid" }, root), ticks = svg("g", { "class": "tick" }, root);
    var step = top > 0.04 ? 0.01 : top > 0.02 ? 0.005 : 0.0025;
    for (var t = 0; t <= top + 1e-9; t += step) {
      svg("line", { x1: m.l, x2: m.l + pw, y1: y(t), y2: y(t) }, grid);
      svg("text", { x: m.l - 8, y: y(t) + 3.5, "text-anchor": "end" }, ticks, (t * 100).toFixed(step < 0.01 ? 1 : 0) + "%");
    }
    var axis = svg("g", { "class": "axis" }, root);
    svg("line", { x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph }, axis);
    svg("text", { "class": "axis-title", x: m.l + pw / 2, y: H - 6, "text-anchor": "middle" }, root,
      "Time since the patient’s most recent training record (months)");

    d.bins.forEach(function (b, i) {
      var cx = m.l + band * i + band / 2, r = rates[i];
      svg("text", { x: cx, y: m.t + ph + 17, "text-anchor": "middle" }, axis, binLabel(b));
      var h = Math.max(1, ph - (y(r) - m.t));
      var yy = m.t + ph - h;
      svg("path", { "class": "col", d: "M" + (cx - bw / 2) + "," + (m.t + ph) + " V" + (yy + 4) + " q0,-4 4,-4 H" + (cx + bw / 2 - 4) + " q4,0 4,4 V" + (m.t + ph) + " Z" }, root);
      svg("text", { "class": "col-label", x: cx, y: yy - 6, "text-anchor": "middle" }, root, int(b.sig));
      var hit = svg("rect", { x: cx - band / 2, y: m.t, width: band, height: ph, fill: "transparent" }, root);
      hit.addEventListener("pointermove", function (evt) {
        showTip(function (box) {
          html("div", "tt-title", box, binLabel(b) + " months later · " + d.name);
          tipRow(box, pct(r), int(b.sig) + " of " + int(b.n) + " future " + d.unit, "on");
        }, evt.clientX, evt.clientY);
      });
      hit.addEventListener("pointerleave", hideTip);
    });

    var table = document.getElementById("bins-table");
    table.textContent = "";
    var head = html("tr", null, html("thead", null, table));
    ["Dataset", "Months since last training record", "Future records", "With significant shift", "Share"].forEach(function (h) { html("th", null, head, h); });
    var body = html("tbody", null, table);
    DATASETS.forEach(function (ds) {
      ds.bins.forEach(function (b) {
        var tr = html("tr", null, body);
        [ds.name, binLabel(b), int(b.n), int(b.sig), pct(b.n ? b.sig / b.n : 0)].forEach(function (v) { html("td", null, tr, v); });
      });
    });
  }

  /* ------------------------------------------ finding 3: diagnostic accuracy */
  var scenarioButtons = Array.prototype.slice.call(document.querySelectorAll("[data-scenario]"));
  scenarioButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      state.scenario = b.dataset.scenario;
      scenarioButtons.forEach(function (o) { o.setAttribute("aria-checked", String(o === b)); });
      drawDiag();
    });
  });

  function diagRows() { return DATA.diagnostic[state.dataset]; }

  function drawDiag() {
    var box = document.getElementById("diag"), rows = diagRows(), sc = state.scenario;
    var max = 0;
    rows.forEach(function (r) { ["sensitivity", "specificity"].forEach(function (k) { max = Math.max(max, Math.abs(r[sc][k].diff)); }); });
    max = Math.max(0.02, Math.ceil(max * 135 + 0.5) / 100);   // headroom for value labels
    var pos = function (v) { return (v + max) / (2 * max) * 100; };

    box.textContent = "";
    var head = html("div", "diag-head", box);
    html("span", null, head, sc === "denovo" ? "New condition (cases)" : "Condition (records)");
    html("span", null, head, "Sensitivity, IN − OUT");
    html("span", null, head, "Specificity, IN − OUT");

    if (!state.condition || !rows.some(function (r) { return r.condition === state.condition; })) {
      var best = rows.slice().sort(function (a, b) { return a[sc].sensitivity.diff - b[sc].sensitivity.diff; });
      state.condition = (sc === "denovo" ? best[0] : best[best.length - 1]).condition;
    }

    rows.forEach(function (r) {
      var row = html("div", "diag-row", box);
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-pressed", String(r.condition === state.condition));
      var name = html("span", "diag-name", row, r.condition);
      html("small", null, name, int(sc === "denovo" ? r[sc].sensitivity.nPos : r[sc].sensitivity.nPos + r[sc].specificity.nNeg));
      ["sensitivity", "specificity"].forEach(function (k) {
        var c = r[sc][k], cell = html("span", "diag-cell", row);
        cell.style.setProperty("--zero", "50%");
        var b = html("i", "b " + (c.diff < 0 ? "neg" : "pos") + (c.p > 0.05 ? " ns" : ""), cell);
        var a = pos(Math.min(0, c.diff)), z = pos(Math.max(0, c.diff));
        b.style.left = a + "%"; b.style.width = Math.max(0.6, z - a) + "%";
        var v = html("span", "v", cell, signedPp(c.diff) + (c.p <= 0.01 ? " **" : c.p <= 0.05 ? " *" : ""));
        if (c.diff < 0) { v.style.right = (100 - a + 1.5) + "%"; } else { v.style.left = (z + 1.5) + "%"; }
        cell.addEventListener("pointermove", function (evt) {
          showTip(function (tb) {
            html("div", "tt-title", tb, r.condition + " · " + k);
            tipRow(tb, pct(c.rateIn), "IN models (trained on the patient’s history)");
            tipRow(tb, pct(c.rateOut), "OUT models");
            tipRow(tb, signedPp(c.diff) + " pts", c.p > 0.05 ? "difference, not significant" : "difference, " + pValue(c.p));
            html("div", "tt-sub", tb, (k === "sensitivity" ? int(c.nPos) + " positive cases" : int(c.nNeg) + " negative cases"));
          }, evt.clientX, evt.clientY);
        });
        cell.addEventListener("pointerleave", hideTip);
      });
      function pick() { state.condition = r.condition; drawDiag(); }
      row.addEventListener("click", pick);
      row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });

    var axis = html("div", "diag-axis", box);
    html("span", null, axis);
    for (var i = 0; i < 2; i++) {
      var ax = html("span", "ax", axis);
      [-max, 0, max].forEach(function (t) {
        var lab = html("span", null, ax, (t > 0 ? "+" : t < 0 ? MINUS : "") + Math.abs(t * 100).toFixed(0));
        lab.style.left = pos(t) + "%";
        lab.style.transform = t < 0 ? "none" : t > 0 ? "translateX(-100%)" : "translateX(-50%)";
      });
    }

    document.getElementById("diag-caption").textContent = sc === "denovo"
      ? "Patients returning with a condition that is absent from all their historical training records, each matched to an age- and sex-matched control. Bars show the difference in percentage points between IN and OUT models. * p ≤ 0.05, ** p ≤ 0.01 (Bonferroni-corrected). Select a condition to see what the difference means for 100 patients."
      : "Patients returning with the same health state as in their historical training records. Bars show the difference in percentage points between IN and OUT models. * p ≤ 0.05, ** p ≤ 0.01 (Bonferroni-corrected). Select a condition to see what the difference means for 100 patients.";

    drawIcons();
    buildDiagTable();
  }

  function drawIcons() {
    var r = diagRows().filter(function (x) { return x.condition === state.condition; })[0];
    var box = document.getElementById("icon-compare");
    box.textContent = "";
    if (!r) return;
    var c = r[state.scenario].sensitivity;
    var outN = Math.round(c.rateOut * 100), inN = Math.round(c.rateIn * 100);
    html("h3", null, box, r.condition + ": out of 100 patients " + (state.scenario === "denovo"
      ? "whose new record shows it for the first time"
      : "whose earlier training records showed it and whose new record still does"));
    var pair = html("div", "ic-pair", box);
    [["OUT models", outN, "flagged by models not trained on their historical records"],
     ["IN models", inN, "flagged by models trained on their historical records"]].forEach(function (g, gi) {
      var col = html("div", "ic-group", pair);
      var p = html("p", null, col);
      html("b", null, p, String(g[1]));
      p.appendChild(document.createTextNode(g[2]));
      var grid = html("div", "ic-grid", col);
      grid.setAttribute("aria-hidden", "true");
      for (var i = 0; i < 100; i++) {
        var cls = i < g[1] ? "on" : (gi === 1 && i < outN ? "diff" : "");
        html("i", cls, grid);
      }
    });
    var diff = outN - inN;
    html("p", "ic-note", box, (diff > 0
      ? diff + (diff === 1 ? " patient" : " patients") + " in every 100 would be missed only because the model was trained on their earlier records (red outlines)."
      : diff < 0 ? (-diff) + (diff === -1 ? " more patient" : " more patients") + " in every 100 are flagged by models trained on their earlier records."
      : "No difference at this resolution.") +
      " Average detection rates over 100 IN and 100 OUT models" + (c.p > 0.05 ? "; this difference is not statistically significant." : ", " + pValue(c.p) + "."));
  }

  function buildDiagTable() {
    var table = document.getElementById("diag-table");
    table.textContent = "";
    var head = html("tr", null, html("thead", null, table));
    ["Dataset", "Condition", "Scenario", "Sensitivity IN", "OUT", "Difference", "Specificity IN", "OUT", "Difference"].forEach(function (h) { html("th", null, head, h); });
    var body = html("tbody", null, table);
    DATASETS.forEach(function (d) {
      DATA.diagnostic[d.id].forEach(function (r) {
        ["denovo", "unchanged"].forEach(function (sc) {
          var s = r[sc].sensitivity, sp = r[sc].specificity;
          var tr = html("tr", null, body);
          [d.name, r.condition, sc === "denovo" ? "New condition" : "Unchanged", pct(s.rateIn), pct(s.rateOut), signedPp(s.diff) + (s.p > 0.05 ? " n.s." : ""),
            pct(sp.rateIn), pct(sp.rateOut), signedPp(sp.diff) + (sp.p > 0.05 ? " n.s." : "")].forEach(function (v) { html("td", null, tr, v); });
        });
      });
    });
  }

  /* ----------------------------------------------- finding 4: differential privacy */
  var dpChips = document.getElementById("dp-chips");
  ["mimic-ecg", "heedb"].forEach(function (id) {
    var d = byId(id), b = html("button", "chip", dpChips);
    b.type = "button"; b.dataset.id = id;
    b.appendChild(document.createTextNode(d.name));
    html("small", null, b, d.modality.split(" ")[0]);
    b.addEventListener("click", function () { state.dpDataset = id; drawDp(); });
  });
  var dpSetButtons = Array.prototype.slice.call(document.querySelectorAll("[data-dp-set]"));
  dpSetButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      state.dpSet = b.dataset.dpSet;
      dpSetButtons.forEach(function (o) { o.setAttribute("aria-checked", String(o === b)); });
      drawDp();
    });
  });

  var EPS = [1, 10, 100, 1000, null];
  function epsLabel(e) { return e == null ? "none" : e === 1 ? "1" : "10" + SUP[String(Math.log10(e))]; }
  function dpRow(level, eps) {
    var rows = DATA.dp[state.dpDataset];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.level === level && r.epsilon === eps && (eps != null || r.future != null)) return r;
    }
  }
  function dpPerf(level, eps) {
    var rows = DATA.dp[state.dpDataset];
    for (var i = 0; i < rows.length; i++) if (rows[i].level === level && rows[i].epsilon === eps) return rows[i];
  }

  function dpFrame(box, H, m) {
    var W = box.clientWidth || 320;
    box.textContent = "";
    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H }, box);
    var pw = W - m.l - m.r, band = pw / EPS.length;
    var x = function (i) { return m.l + band * i + band / 2; };
    var axis = svg("g", { "class": "axis" }, root);
    svg("line", { x1: m.l, x2: m.l + pw, y1: H - m.b, y2: H - m.b }, axis);
    EPS.forEach(function (e, i) { svg("text", { x: x(i), y: H - m.b + 17, "text-anchor": "middle" }, axis, epsLabel(e)); });
    svg("text", { "class": "axis-title", x: m.l + pw / 2, y: H - 6, "text-anchor": "middle" }, root, "Privacy budget ε");
    return { root: root, x: x, W: W, band: band };
  }

  function drawDp() {
    Array.prototype.forEach.call(dpChips.children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.id === state.dpDataset)); });
    var set = state.dpSet, levels = ["record", "patient"];
    var d = byId(state.dpDataset);

    // counts (log scale, zero on the bottom line)
    var box = document.getElementById("dp-count"), H = 280, m = { l: 52, r: 10, t: 12, b: 44 };
    var f = dpFrame(box, H, m), root = f.root, ph = H - m.t - m.b;
    var LOG_MAX = 6, zeroY = m.t + ph;
    var y = function (c) { return c <= 0 ? zeroY : m.t + (LOG_MAX - Math.log10(c)) / LOG_MAX * (ph - 14); };
    var grid = svg("g", { "class": "grid" }, root), ticks = svg("g", { "class": "tick" }, root);
    for (var e = 0; e <= LOG_MAX; e++) {
      svg("line", { x1: m.l, x2: f.W - m.r, y1: y(Math.pow(10, e)), y2: y(Math.pow(10, e)) }, grid);
      svg("text", { x: m.l - 8, y: y(Math.pow(10, e)) + 3.5, "text-anchor": "end" }, ticks, e === 0 ? "1" : "10" + SUP[String(e)]);
    }
    svg("text", { x: m.l - 8, y: zeroY + 3.5, "text-anchor": "end" }, ticks, "0");
    levels.forEach(function (lvl) {
      var pts = EPS.map(function (eps, i) { var r = dpRow(lvl, eps); return r ? [f.x(i), y(r[set]), r] : null; }).filter(Boolean);
      svg("polyline", { "class": "series " + lvl, points: pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") }, root);
      pts.forEach(function (p, i) {
        svg("circle", { "class": "dot-" + lvl, cx: p[0], cy: p[1], r: 5 }, root);
        var hit = svg("circle", { cx: p[0], cy: p[1], r: 13, fill: "transparent" }, root);
        hit.addEventListener("pointermove", function (evt) {
          showTip(function (tb) {
            html("div", "tt-title", tb, (lvl === "record" ? "Record" : "Patient") + "-level DP · ε = " + (EPS[i] == null ? "none" : int(EPS[i])));
            tipRow(tb, int(p[2][set]), "of " + int(p[2][set + "N"]) + " " + (set === "future" ? "future" : "historical") + " " + d.unit + " with a significant shift");
          }, evt.clientX, evt.clientY);
        });
        hit.addEventListener("pointerleave", hideTip);
      });
    });

    // performance
    var box2 = document.getElementById("dp-auroc");
    var f2 = dpFrame(box2, H, m), root2 = f2.root;
    var vals = [];
    levels.forEach(function (lvl) { EPS.forEach(function (eps) { var r = dpPerf(lvl, eps); if (r) { vals.push(r.auroc - r.aurocSd, r.auroc + r.aurocSd); } }); });
    var lo = Math.floor(Math.min.apply(null, vals) * 100 - 0.5) / 100, hi = Math.ceil(Math.max.apply(null, vals) * 100 + 0.5) / 100;
    var y2 = function (v) { return m.t + (hi - v) / (hi - lo) * ph; };
    var g2 = svg("g", { "class": "grid" }, root2), t2 = svg("g", { "class": "tick" }, root2);
    var stp = (hi - lo) > 0.06 ? 0.02 : 0.01;
    for (var t = Math.ceil(lo / stp) * stp; t <= hi + 1e-9; t += stp) {
      svg("line", { x1: m.l, x2: f2.W - m.r, y1: y2(t), y2: y2(t) }, g2);
      svg("text", { x: m.l - 8, y: y2(t) + 3.5, "text-anchor": "end" }, t2, (t * 100).toFixed(0) + "%");
    }
    levels.forEach(function (lvl, li) {
      var off = (li ? 1 : -1) * Math.min(7, f2.band * 0.12);
      var pts = [];
      EPS.forEach(function (eps, i) {
        var r = dpPerf(lvl, eps); if (!r) return;
        var cx = f2.x(i) + off;
        pts.push(cx.toFixed(1) + "," + y2(r.auroc).toFixed(1));
        svg("line", { "class": "err " + lvl, x1: cx, x2: cx, y1: y2(r.auroc - r.aurocSd), y2: y2(r.auroc + r.aurocSd) }, root2);
      });
      svg("polyline", { "class": "series " + lvl, points: pts.join(" ") }, root2);
      EPS.forEach(function (eps, i) {
        var r = dpPerf(lvl, eps); if (!r) return;
        var cx = f2.x(i) + off;
        svg("circle", { "class": "dot-" + lvl, cx: cx, cy: y2(r.auroc), r: 4.5 }, root2);
        var hit = svg("circle", { cx: cx, cy: y2(r.auroc), r: 12, fill: "transparent" }, root2);
        hit.addEventListener("pointermove", function (evt) {
          showTip(function (tb) {
            html("div", "tt-title", tb, (lvl === "record" ? "Record" : "Patient") + "-level DP · ε = " + (eps == null ? "none" : int(eps)));
            tipRow(tb, (r.auroc * 100).toFixed(1) + "%", "mean test AUROC ± " + (r.aurocSd * 100).toFixed(1) + " (" + r.nModels + " models)");
          }, evt.clientX, evt.clientY);
        });
        hit.addEventListener("pointerleave", hideTip);
      });
    });

    // table (both datasets)
    var table = document.getElementById("dp-table");
    table.textContent = "";
    var head = html("tr", null, html("thead", null, table));
    ["Dataset", "DP level", "ε", "Future records with shift", "Historical records with shift", "Test AUROC"].forEach(function (h) { html("th", null, head, h); });
    var body = html("tbody", null, table);
    ["mimic-ecg", "heedb"].forEach(function (id) {
      var keep = state.dpDataset; state.dpDataset = id;
      levels.forEach(function (lvl) {
        EPS.forEach(function (eps) {
          var r = dpRow(lvl, eps), p = dpPerf(lvl, eps);
          if (!r) return;
          var tr = html("tr", null, body);
          [byId(id).name, lvl === "record" ? "Record" : "Patient", eps == null ? "none" : int(eps), int(r.future), int(r.historical),
            p ? (p.auroc * 100).toFixed(1) + "% ± " + (p.aurocSd * 100).toFixed(1) : "–"].forEach(function (v) { html("td", null, tr, v); });
        });
      });
      state.dpDataset = keep;
    });
  }

  /* ------------------------------------------------------------------ init */
  setEs(state.es);
  setDataset(state.dataset);
  drawDp();

  var pending = false;
  function redraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; drawShift(); drawBins(); drawDp(); });
  }
  if ("ResizeObserver" in window) {
    var lastW = 0;
    new ResizeObserver(function () {
      var w = document.getElementById("main").clientWidth;
      if (w !== lastW) { lastW = w; redraw(); }
    }).observe(document.getElementById("main"));
  } else {
    window.addEventListener("resize", redraw);
  }
})();

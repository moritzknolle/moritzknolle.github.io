(function () {
  "use strict";

  /* ---------------------------------------------------------- theme toggle */
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem("theme"); } catch (e) { /* private mode */ }
  if (stored === "light" || stored === "dark") root.setAttribute("data-theme", stored);

  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  document.getElementById("theme-toggle").addEventListener("click", function () {
    var current = root.getAttribute("data-theme") || (prefersDark.matches ? "dark" : "light");
    var next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
  });

  /* ----------------------------------------------------------- publications */
  var pubs = window.PUBLICATIONS || [];
  var list = document.getElementById("pub-list");

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // Highlight the site owner in the author string.
  function authors(str) {
    return esc(str).replace(/(M\.(?:\s?A\.)?\s?Knolle\*?)/g, '<span class="me">$1</span>');
  }

  function render(filter) {
    var items = pubs.filter(function (p) { return filter === "all" || p.selected; });
    var years = [];
    items.forEach(function (p) { if (years.indexOf(p.year) === -1) years.push(p.year); });
    years.sort(function (a, b) { return b - a; });

    list.innerHTML = years.map(function (year) {
      var group = items.filter(function (p) { return p.year === year; }).map(function (p) {
        var links = (p.links || []).map(function (l) {
          return '<a href="' + esc(l.url) + '" rel="noopener">' + esc(l.label) + "</a>";
        }).join('<span class="sep">&middot;</span>');

        return '<article class="pub">' +
          '<h3 class="pub-title">' + esc(p.title) + "</h3>" +
          '<p class="pub-authors">' + authors(p.authors) + "</p>" +
          '<p class="pub-meta"><em>' + esc(p.venue) + "</em>" +
          (links ? '<span class="sep">&middot;</span>' + links : "") +
          "</p></article>";
      }).join("");

      return '<div class="year-group"><p class="year-label">' + year + "</p>" + group + "</div>";
    }).join("");
  }

  var buttons = Array.prototype.slice.call(document.querySelectorAll(".filters button"));
  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      buttons.forEach(function (b) { b.classList.toggle("active", b === btn); });
      render(btn.dataset.filter);
    });
  });

  render("selected");

  document.getElementById("year").textContent = new Date().getFullYear();
})();

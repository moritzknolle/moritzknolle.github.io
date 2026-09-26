# moritzknolle.github.io

Live at https://moritzknolle.com (custom domain set by the `CNAME` file; DNS at Namecheap points to GitHub Pages).

Personal academic website. Static HTML/CSS/JS, no build step, no dependencies.

```
index.html        page structure and all prose (bio, research, contact)
styles.css        design tokens + layout; light/dark themes live at the top
publications.js   publication list — the only file you normally need to touch
main.js           theme toggle + publication rendering
assets/           put portrait.jpg here (square crop); it is hidden if missing
```

## Preview locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Add a publication

Prepend an entry to `window.PUBLICATIONS` in `publications.js`:

```js
{
  year: 2026,
  title: "…",
  authors: "M. A. Knolle, …",   // "M. Knolle" is bolded automatically
  venue: "Nature",
  links: [{ label: "arXiv", url: "https://arxiv.org/abs/…" }],
  selected: true                 // show under the "Selected" filter
}
```

## Deploy (GitHub Pages)

Create a repo named `<username>.github.io`, push this directory to `main`, and
enable Pages → Deploy from branch → `main` / root. No workflow needed.

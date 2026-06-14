# Verge-il — Static Site

A static, multi-page marketing/community site for **Verge-il**, a high-stakes
FiveM roleplay community. Built from design mockups as plain HTML + Tailwind
(Play CDN), with full English (LTR) and Hebrew (RTL) versions.

## Pages

| Page  | English          | Hebrew (RTL)        |
| ----- | ---------------- | ------------------- |
| Home  | `index.html`     | `he/index.html`     |
| Rules | `rules.html`     | `he/rules.html`     |
| Store | `store.html`     | `he/store.html`     |
| Forum | `forum.html`     | `he/forum.html`     |

The top nav links the four pages together, and a language toggle in the nav
switches between the English and Hebrew versions of the current page.

## Structure

```
index.html, rules.html, store.html, forum.html   # English (LTR) pages
he/                                               # Hebrew (RTL) pages
assets/
  logo.svg              # shared SVG logo mark
  style.css             # shared component styles (glass, neon, accordion, cart…)
  tailwind.config.js    # shared Tailwind Play CDN theme (colors, spacing, fonts)
  cursor-glow.js        # Home: cursor glow + button press micro-interactions
  rules.js              # Rules: accordion + sidebar scroll navigation
  store.js              # Store: cart drawer add/remove (i18n via window.STORE_I18N)
  forum.js              # Forum: category row hover micro-interaction
```

Everything is shared across pages via `assets/` so there's a single source of
truth for the theme, styles, and interactive behavior.

## Run locally

No build step — it's static files. Serve the folder with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly via `file://` also works, though a local server
is recommended so relative paths and the Tailwind CDN behave consistently.

## Notes

- Styling uses the **Tailwind Play CDN** (`cdn.tailwindcss.com`) with a shared
  theme config in `assets/tailwind.config.js`. For production you'd typically
  compile Tailwind to a static stylesheet instead of using the CDN.
- Fonts (Sora, Inter, JetBrains Mono, Assistant for Hebrew) and Material Symbols
  load from Google Fonts.
- Hero/card/avatar imagery is referenced from remote URLs; swap these for local
  assets when finalizing.

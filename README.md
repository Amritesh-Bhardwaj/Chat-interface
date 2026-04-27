# Kimi Chat Interface

A **production-ready** replica of the Kimi AI chat interface built with semantic HTML5, modern CSS custom properties, and a clean ES-module JavaScript architecture. Auto-deploys to GitHub Pages on every push to `main`.

## Live Demo

> Deploy to GitHub Pages (see [Setup](#setup)) and visit `https://<your-username>.github.io/Chat-interface/`

---

## Repository Structure

```
kimi-chat-app/
├── index.html                   # Semantic, accessible HTML5
├── css/
│   └── styles.css               # CSS custom properties, responsive, a11y
├── js/
│   └── app.js                   # ES module — clean modular architecture
├── .github/
│   └── workflows/
│       └── deploy.yml           # Auto-deploy to GitHub Pages
├── .gitignore
├── LICENSE                      # MIT
└── README.md
```

---

## Features

### HTML
- **Semantic elements** — `<aside>`, `<main>`, `<header>`, `<footer>`, `<nav>`, `<section>`
- **Accessibility** — `aria-label`, `aria-live="polite"`, `aria-expanded`, `aria-hidden`, `role` attributes, `.visually-hidden` labels for screen readers, skip-to-content link
- **Preconnect hints** — `<link rel="preconnect">` to CDNs for faster resource loading

### CSS
- **CSS custom properties** — all colors, spacing, radii, and fonts are tokenised; dark/light switch via one `data-theme` attribute change
- **No hardcoded values** — every value uses `var()` tokens
- **Accessibility-first** — `prefers-reduced-motion` media query, `:focus-visible` (not `:focus`), minimum 36 px touch targets
- **Mobile responsive** — sidebar becomes a slide-out drawer below 768 px; inputs and messages adapt to smaller viewports

### JavaScript (ES Modules)
- **Zero globals** — everything scoped inside the module; nothing leaks to `window`
- **Single `state` object** — all reactive data in one place; easy to debug and persist
- **Modular architecture** — `utils`, `errorHandler`, `chatManager`, `ui`, `fileHandler`, `messageSender`
- **localStorage persistence** — chat history and theme preference survive page reloads
- **Delegated events** — single listener on `messagesContainer` for dynamic error-box action clicks
- **Error handling** — every API call is wrapped; errors are caught, classified, and rendered as human-readable explanations

### DevOps
- **GitHub Actions workflow** — pushes to `main` auto-deploy to GitHub Pages via `actions/deploy-pages`
- **MIT License** — permissive, standard open-source licence

### Security
- **DOMPurify** — all Markdown-rendered AI output is sanitised before `innerHTML` insertion
- **HTML escaping** — user message text uses `.textContent`, never raw HTML
- **Error detail sanitisation** — `utils.formatErrorDetail()` limits raw error exposure to 200 characters

---

## Setup

### 1. Fork / clone the repo

```bash
git clone https://github.com/<your-username>/Chat-interface.git
cd Chat-interface
```

### 2. Add your Kimi (Moonshot AI) API key

Open `js/app.js` and set your key on the `API_KEY` line inside `messageSender.callApi()`:

```js
const API_KEY = "sk-xxxxxxxxxxxxxxxxxxxxxxxx";
```

> **Never commit real API keys.** Use a server-side proxy in production.

### 3. Enable GitHub Pages

1. Go to **Settings → Pages** in your repository.
2. Set **Source** to **GitHub Actions**.
3. Push any commit to `main` — the workflow will deploy automatically.

---

## Error Handling Reference

| Scenario | User-facing message |
|----------|---------------------|
| HTTP 401 | Authentication failed — check API key |
| HTTP 429 | Rate limit reached — wait and retry |
| HTTP 502/503 | Service unavailable — try again soon |
| Network/fetch error | Network error — check internet connection |
| Malformed response | Invalid response — unexpected API data |
| Unknown | Something went wrong |

---

## Browser Support

| Browser | Minimum version |
|---------|----------------|
| Chrome / Edge | 80+ |
| Firefox | 75+ |
| Safari | 14+ |
| Mobile Chrome/Safari | Modern (ES modules + CSS custom properties required) |

---

## Licence

[MIT](LICENSE) © Amritesh Bhardwaj
# Blue Shelf Microbakery

A single-page bakery ordering app built with vanilla HTML, CSS, and JavaScript. No frameworks, no bundlers — just clean, fast, GitHub Pages-compatible code.

## Live Demo

Deploy to any static host (GitHub Pages, Netlify, Vercel) and open `index.html`.

## File Structure

```
blue_shelf/
├── index.html              # Shell — loads CSS, JS, and HTML partials
├── README.md
├── css/
│   ├── base.css            # Variables, reset, typography, shared components
│   ├── nav.css             # Navbar, tabs, cart button
│   ├── menu.css            # Menu grid, cards, filters, sold-out overlay
│   ├── order.css           # Order wizard, steps, date cards, subtotal bar
│   └── admin.css           # Admin lock, dashboard, tabs, calendar UI
├── js/
│   ├── data.js             # Global state (menuItems, orders, bakingDays, cart)
│   ├── router.js           # Page navigation, admin tab switching
│   ├── toast.js            # Toast notifications, cart badge
│   ├── menu.js             # Menu rendering, filtering, cart, sold-out logic
│   ├── order.js            # 4-step order wizard
│   └── admin.js            # Admin tabs: orders, day summary, products, baking days
└── pages/
    ├── menu.html           # Menu page markup
    ├── order.html          # Order wizard markup
    └── admin.html          # Admin dashboard markup
```

## Features

- **Menu** — Filterable product grid with stock tracking and baking-day-aware availability
- **Order Wizard** — 4-step flow: Date → Pickup/Delivery → Products → Checkout
- **Admin Dashboard** — Password-protected with 4 tabs:
  - **Orders** — Paid/Received toggle pills per order
  - **Day Summary** — Orders grouped by date with filter buttons
  - **Products** — Stock editing, visibility toggle, customizations, delete with confirmation
  - **Baking Days** — Calendar UI with monthly navigation, per-day item planning

## Design

- **Fonts**: Playfair Display (headings) + DM Sans (body)
- **Palette**: Navy, cream, blue, blush accents
- **Grain overlay** via inline SVG filter for texture
- **Responsive**: Adapts to mobile at 800px and 540px breakpoints

## Development

The app loads HTML partials via XHR, so it **must** be served over HTTP — opening `index.html` directly via `file://` will not work (browsers block cross-origin local file requests).

Serve locally with any static HTTP server:

```bash
npx serve .
# or
python3 -m http.server
```

GitHub Pages serves the files directly — just push and it works.

## Password

Admin dashboard password: `blueshelf`

# Smart Mindmap Code Chart

**English** | [简体中文](./README.zh-CN.md)

A zero-dependency, web-based mind map editor designed for **explaining code and architecture visually**. Built with plain Node.js (no framework) — the only runtime dependency is `ws` for real-time collaboration.

<p align="center">
  <img src="./assets/code_chart_mindmap.png" alt="screenshot" width="420" />
</p>

## Features

- **Drag & drop editing** — create, move, and connect nodes on an infinite canvas
- **Rich node types** — text, code blocks, images, and URL cards with auto-fetched page metadata
- **Multi-color theming** — categorize nodes by color to express semantics
- **File & namespace management** — organize multiple mind maps into namespaces
- **Auto-save** — changes are persisted to disk via a sharded JSON storage backend
- **Export to PNG** — share your diagrams as images
- **LAN access out of the box** — the server binds to `0.0.0.0`, so other devices on the same network can open the editor directly
- **Proxy-aware URL fetcher** — automatically detects `HTTPS_PROXY` / `HTTP_PROXY` env vars when resolving external link previews
- **Keyboard shortcuts** — `Cmd/Ctrl + S` to save, `Ctrl + Click` to add a node, `Shift + Click/Drag` to connect nodes, `Delete` to remove

## Requirements

- Node.js `>= 12.0.0`
- A modern browser (Chrome, Edge, Safari, Firefox)

## Installation

```shell
git clone https://github.com/StellarStar255/stellar_smart_mindmap_code_chart.git
cd stellar_smart_mindmap_code_chart
npm install
```

## Usage

Start the server:

```shell
npm start
```

Then open the editor in your browser:

- Local: <http://localhost:3000>
- LAN: `http://<your-machine-ip>:3000` (the server prints this on startup)

## Project Structure

```
.
├── server.js            # HTTP server, storage API, URL metadata fetcher
├── app.js               # Front-end editor logic
├── storage-adapter.js   # Client-side storage adapter
├── index.html           # Editor entry page
├── assets/              # Static assets (images, crypto-js)
└── data/                # Auto-created persistent storage (sharded JSON)
```

Persistent data is written to `./data/keys/` — one file per key — so the editor can scale to large maps without rewriting a monolithic `storage.json`.

## Troubleshooting

**Port 3000 already in use**

```shell
kill -9 $(lsof -t -i:3000)
```

**Cannot access from other devices on the LAN**

1. Make sure all devices are on the same Wi-Fi / router
2. Allow inbound connections on port `3000` in your firewall settings
3. On macOS: *System Settings → Network → Firewall*

## License

[MIT](./LICENSE) © 2026 StellarStar255

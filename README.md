# CabinFlow
Centralizing and simplifying kitchen operations

## Installation

```bash
git clone <repo-url>
cd CabinFlow
npm run setup
```

The setup wizard will ask for a **host** and **port**, install dependencies, and run database migrations.

| Host | Effect |
|---|---|
| `0.0.0.0` | Accessible on all interfaces (LAN, Tailscale, etc.) |
| `100.x.x.x` | Tailscale-only (use your machine's Tailscale IP) |
| `127.0.0.1` | Localhost only |

## Running

```bash
npm run build   # build for production
npm start       # start production server

npm run dev     # start dev server (hot reload)
```

Host and port are read from `.env.local` (written by the setup wizard). To change them, re-run `npm run setup` or edit `.env.local` directly:

```
HOST=0.0.0.0
PORT=3000
```

## Keep running persistently (optional)

```bash
npm install -g pm2
npm run build
pm2 start "npm start" --name cabinflow
pm2 save && pm2 startup
```

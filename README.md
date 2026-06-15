
# ArchiveX

A database-like view plugin for [Obsidian](https://obsidian.md) that reads YAML files and displays data as cards, supporting images, videos, and other file references. Also provides a standalone Web interface for browsing and managing your databases.

## Features

- 📇 **Card View** — Display YAML records as visual cards with adjustable sizes
- 🖼️ **Images View** — Flat image gallery with field filtering and lightbox navigation
- 📊 **Table View** — Spreadsheet-style data display
- 📋 **List View** — Compact list with thumbnails
- 📝 **CRUD** — Create, edit, and delete databases, fields, and records
- ✂️ **Image Crop** — Crop images before uploading
- 📦 **Backup & Restore** — Export/import full `.tar.gz` backups (with assets)
- 🌐 **Web Interface** — Standalone web server deployable via Docker (e.g. on a NAS)
- 🔒 **Privacy** — Asset files stored with hashed filenames (no extension)

## Project Structure (Monorepo)

```
ArchiveX/
├── packages/
│   ├── core/              # Shared types, parser, utils, DataProvider interface
│   │   └── src/
│   ├── ui/                # Shared Svelte 4 components
│   │   └── src/
│   │       ├── pages/     # HomePage, DatabaseDetail
│   │       ├── views/     # CardView, ImagesView, TableView, ListView
│   │       ├── modals/    # Create/Edit/AddRecord/Preview/BackupRestore
│   │       └── components/# Modal, Lightbox, ImageCropper
│   ├── web/               # Web entry + Express server
│   │   ├── src/           # main.ts, web-provider.ts, styles.css
│   │   ├── server.js      # Express REST API
│   │   └── vite.config.ts
│   └── obsidian/          # Obsidian plugin entry
│       ├── src/           # main.ts, vault-provider.ts
│       └── esbuild.config.mjs
├── pnpm-workspace.yaml
├── Dockerfile
└── docker-compose.yml
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 8

### Install Dependencies

```bash
pnpm install
```

### Build All Packages

```bash
pnpm build
```

### Obsidian Plugin

```bash
# Build only the Obsidian plugin
pnpm build:obsidian

# Output: packages/obsidian/release/
# Also auto-installs to ~/Documents/Obsidian Vault/.obsidian/plugins/archive-x/
```

Enable the plugin in Obsidian → Settings → Community Plugins → ArchiveX.

### Web Server (Local)

```bash
# Build and start
pnpm start

# Or step by step:
pnpm build:web
pnpm server
```

The server starts on `http://localhost:3000`. Set `DATA_DIR` to point to your data:

```bash
DATA_DIR=/path/to/your/data pnpm server
```

### Web Server (Development with HMR)

Development mode requires **two terminals** — one for the backend API server and one for the Vite dev server (with hot-reload):

```bash
# Terminal 1: Start the Express backend (port 3000)
pnpm server

# Terminal 2: Start the Vite dev server (port 5173, proxies /api to backend)
pnpm dev:web
```

Then open `http://localhost:5173` in your browser. The Vite dev server automatically proxies all `/api` requests to the Express backend on port 3000.

### Web Server (Docker)

```bash
docker compose up -d
```

Data is persisted via volume mount (`./data:/data`). Edit `docker-compose.yml` to adjust:

```yaml
services:
  archivex:
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
```

#### Deploy from Git

```bash
docker compose up -d --build
```

## Data Format

Each database is a YAML file with an accompanying assets directory:

```
data/
├── my_database.yaml
├── my_database_assets/
│   ├── 8f4a2b3c...    # SHA-256 hashed filename, no extension
│   └── a1b2c3d4...
└── another_db.yaml
```

- Directory/asset names use **pinyin** for Chinese characters (e.g. `xiuxianxie_assets`)
- Asset filenames are **SHA-256 hashes** without extensions for privacy

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build all packages (core → web → obsidian) |
| `pnpm build:core` | Build shared core package |
| `pnpm build:web` | Build web frontend (Vite) |
| `pnpm build:obsidian` | Build Obsidian plugin (esbuild) |
| `pnpm dev:web` | Start Vite dev server with HMR |
| `pnpm server` | Start production web server |
| `pnpm start` | Build web + start server |

## License

MIT © twelveOranges

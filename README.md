# 🎵 FlowState Music

A beautiful, fully-featured music player web app — dark theme, glassmorphism design, built with vanilla HTML/CSS/JavaScript.

---

## Features

| Feature | Description |
|---------|-------------|
| 🔐 Auth | Login with [accounts.xmenu.dev](https://accounts.xmenu.dev) |
| ▶️ Playback | Play, pause, next, previous, seek |
| 🔀 Shuffle | Shuffle queue with Fisher-Yates |
| 🔁 Loop | No loop → Loop all → Loop one |
| 📚 Library | Browse tracks from `manifest.json` |
| 🔍 Search | Live filter by title, artist, album |
| 📋 Queue | Add, remove, drag-to-reorder, clear |
| ⬆️ Upload | Drag & drop or browse local audio files |
| ▶️ YouTube | Step-by-step import guide |
| ⌨️ Shortcuts | Space, ←/→, ↑/↓ |
| 📱 Responsive | Mobile, tablet, desktop |
| 🎧 Media Session | OS/browser media controls & hardware keys |

---

## Getting Started

FlowState Music is a **static web app** — no build step required.

Serve it with any static file server. For example:

```bash
# Python 3
python -m http.server 8080

# Node.js (via npx)
npx serve .

# VS Code Live Server
# Right-click index.html → "Open with Live Server"
```

Then open `http://localhost:8080` in your browser.

---

## Adding Music

### 1. Drop MP3 files into `/music/`

```
music/
├── my-song.mp3
├── another-track.mp3
└── covers/
    ├── my-song.jpg
    └── another-track.jpg
```

### 2. Update `/music/manifest.json`

```json
[
  {
    "id": "1",
    "title": "My Song",
    "artist": "Artist Name",
    "album": "Album Name",
    "file": "/music/my-song.mp3",
    "cover": "/music/covers/my-song.jpg"
  },
  {
    "id": "2",
    "title": "Another Track",
    "artist": "Another Artist",
    "album": "Another Album",
    "file": "/music/another-track.mp3",
    "cover": "/music/covers/another-track.jpg"
  }
]
```

**Fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique string identifier |
| `title` | ✅ | Track title |
| `artist` | ✅ | Artist name |
| `album` | ❌ | Album name |
| `file` | ✅ | Path to MP3 relative to site root |
| `cover` | ❌ | Path to cover image (JPG/PNG) |

If no cover is provided, a colored placeholder with the track initial is shown automatically.

---

## Authentication

The app uses [accounts.xmenu.dev](https://accounts.xmenu.dev) for authentication.

- Sign in with your email and password
- Your session token is stored in `localStorage` and expires automatically
- All player features are gated behind authentication

**Auth API endpoints used:**
- `POST https://accounts.xmenu.dev/api/login` — login
- `GET https://accounts.xmenu.dev/api/me` — fetch user profile

---

## Uploading Your Own Music

Use the **Upload** panel in the sidebar to:
- Click "Choose Files" or drag & drop audio files
- Supports: MP3, FLAC, OGG, WAV, M4A
- Uploaded files play in the current session (not persisted to the server)

---

## YouTube Import

Use the **YouTube** panel in the sidebar:
1. Paste a YouTube URL
2. Click "Open Converter ↗" — opens a converter site in a new tab
3. Download the MP3
4. Upload it using the **Upload** panel

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` | Seek back 10s |
| `→` | Seek forward 10s |
| `↑` | Volume up |
| `↓` | Volume down |

---

## File Structure

```
index.html            # App shell (login + player)
style.css             # All styles (dark theme, glassmorphism)
app.js                # Main application logic
player.js             # Audio engine, queue, loop, shuffle
auth.js               # Auth integration (login/logout/token)
music/
├── manifest.json     # Track listing
├── .gitkeep
└── covers/
    └── .gitkeep
README.md
```

---

## Environment / Config

The `accounts.xmenu.dev` base URL is a configurable constant at the top of `auth.js`:

```js
const AUTH_BASE_URL = 'https://accounts.xmenu.dev';
```

No API keys or secrets are required in the frontend.

---

## Browser Support

Modern browsers (Chrome 90+, Firefox 88+, Safari 15+, Edge 90+). Requires ES modules support.

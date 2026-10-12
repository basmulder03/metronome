# Metronome

Turn a PDF score into a click track. Mark the measures on the page (or let barline detection do it), set meters, tempos,
accelerandi and ritardandi with a drawn curve, repeats and jumps, then play along with an animated measure highlight or
export the click as a WAV. Works on phones, tablets and desktops, installs as an app, and keeps working offline.

**Your scores never leave your device.** The server stores only markup (tempos, meters, repeats, where the measure boxes
are). Share links carry markup only; the person you share with attaches their own copy of the PDF.

## Run it

Needs Node 20+.

```bash
npm install
npm run server:setup     # downloads a pinned, checksum-verified PocketBase into server/bin
npm run server           # backend on http://127.0.0.1:8090 (own terminal)
npm run dev              # app with hot reload on http://localhost:5173 (own terminal)
```

Open the app, create an account, open a PDF. The OCR engine (about 14 MB) is copied into `public/ocr` by `npm run dev` / `npm run build`; it is loaded only when you ask for OCR and is not part of the offline precache.

### Production: one small process

```bash
npm run server:setup
npm start                # builds, then serves the app AND the API from one PocketBase on :8090
```

PocketBase is a single Go binary with SQLite: it runs comfortably on a Raspberry Pi or the smallest VPS. Put a reverse
proxy with HTTPS in front of it (the service worker and installability need HTTPS outside localhost). Data lives in
`server/pb_data`; back that folder up.

Hardening that ships with the migrations: owner-only access rules, login/registration rate limits, and a schema with
no file field at all, so a score cannot be uploaded even by a hand-made request.

### Behind a reverse proxy (read this before going live)

- **Tell PocketBase the real client address, or the login limit locks everyone out.** PocketBase limits logins per IP
  address (10 a minute). Behind a proxy every request comes from the proxy's address, so a few wrong passwords would block
  all users. In the dashboard (`/_/`) go to Settings, Application, and set the *User IP proxy headers* to
  `X-Forwarded-For`. Only do that when PocketBase is reachable *only* through your proxy, otherwise anyone can fake the header.
- **Add security headers at the proxy.** The app ships a Content-Security-Policy as a `<meta>` tag, which cannot carry
  `frame-ancestors`. Send `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`),
  `X-Content-Type-Options: nosniff` and `Strict-Transport-Security` from the proxy.
- **Registration is open and storage is not capped per user.** Each piece may hold up to 1 MB of markup (real ones are
  about 10 KB) and there is no limit on how many. On a public server, close registration (the `users` collection's create
  rule in the dashboard) or add a quota.

## Test it

```bash
npm test                 # unit tests (vitest)
npm run check            # svelte-check / types
npm run e2e              # Playwright: desktop + phone viewports, a production-build offline run, and a real backend
```

The browser tests start their own throw-away backend and register a fresh user per test. One fixture is a real
public-domain score (`e2e/fixtures`).

## How it is organised

Vertical slices under `src/features`, shared pieces under `src/shared`:

| Slice | What it owns |
| --- | --- |
| `score` | PDF page view, measure boxes (draw / split), barline auto-detection, reading marks from the PDF (text layer or OCR), measure grid |
| `tempo-map` | Timeline engine (meters, tempos, bezier ramps, pickups, fermatas, count-in), inspector, curve editor, tap tempo |
| `structure` | Repeats, endings, D.C./D.S. and how they unroll into a playing order |
| `playback` | Click scheduling on the audio clock, offline WAV rendering |
| `library` | Pieces and their PDFs, stored on the device (IndexedDB, one database per account) |
| `playlist` | Ordered pieces, sequential playback, one-file export |
| `share` | Link codec and validation (untrusted input), read-only guest view |
| `auth`, `sync` | Sign-in and last-write-wins sync of markup between devices |

Styling rules are in `src/shared/ui/STYLE.md` (tokens, light/dark via `light-dark()`, a test that rejects raw colours).

## Known limits

- **Reading the score is best effort.** "Read from PDF" uses the PDF's own text layer when there is one (exact: tempo marks,
  time signatures, rit./accel. words) and OCR for scans (tempo marks and rit./accel. words only; OCR cannot read music-font
  time signatures). Everything is a suggestion you review first, and the end tempo of a rit./accel. is always a guess.
  Barline detection is classical image processing and will miss on dense, skewed or handwritten scores.
- **Repeat signs, voltas and fermatas are not read from the page**; mark them in the editor.
- **Sync trusts device clocks** (last write wins per piece or playlist). A badly wrong clock can win unfairly.
- **Sync pulls everything each time**, which is fine for a personal library, not for thousands of pieces.
- **Count-in** uses the first measure's meter and tempo; fermatas apply on every pass of a repeat.
- **WAV export** renders in two-minute chunks but is assembled in memory at 2 bytes per sample (about 320 MB per hour of audio); the app asks before exports longer than 30 minutes.

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

### Editing the measure boxes

- **Auto-detect** finds the measures on *every* page in one go. Running it again never wipes your work: the n-th box on a page
  keeps its tempo, time signature and repeat marks and only gets a new shape. That is also how you reuse a click track for
  another part of the same score: in the Library, *Duplicate* the piece (it copies the tempos, meters and boxes, not the
  PDF), *Attach PDF* or *Replace PDF* with the other part, open it and run Auto-detect.
- **Drag** a box to move it; drag a handle on a selected box to resize an edge. A barline that two boxes share moves both, so
  dragging a bar resizes the two measures around it. **Split** (tap a barline) and **Merge** fix wrongly found or missed bars.
- Every edit can be undone with Ctrl+Z (a whole drag is one step).
- **Keyboard** (press `?` in the app for the list): ← → select a measure, Delete removes the box, Alt+arrows move it,
  Alt+Shift+arrows resize it, `,` and `.` move the barline after it (hold Shift for bigger steps), `M` merges with the next
  measure, `D`/`S`/`V` switch mode, Space plays or stops, Esc deselects, F2 renames. Shortcuts pause while you type in a field
  or have a dialog open.

### Accounts and administration

Nobody can create an account directly through the API. Accounts come from the register route, which follows the
registration mode, and there are two roles: *user* and *admin*.

**Create the first administrator** (once, on the server; the app cannot safely create its own first admin):

```bash
server/bin/pocketbase migrate up --dir=server/pb_data --migrationsDir=server/pb_migrations --hooksDir=server/pb_hooks
server/bin/pocketbase make-admin you@example.com 'a-long-password' --dir=server/pb_data --migrationsDir=server/pb_migrations --hooksDir=server/pb_hooks
```

(`make-admin EMAIL` without a password promotes an account that already exists.) Then sign in: an **Admin** button appears.

**Registration mode** (Admin, Settings): *Invitation only* is the default. *Anyone can register* lets people sign up
themselves. Invitations work in both modes.

**Invitations** (Admin, Invitations): give a name, optionally an email address to lock it to, and a lifetime. No email is
sent. Show the **QR code** or copy the link and hand it over yourself. The person opens it, picks a password and has an
account. An invitation works once, expires, and can be revoked while waiting. The link is signed (HMAC) with a secret that
never leaves the server, so it cannot be forged or altered, and the server records its single use inside a transaction,
so two people racing on one link cannot both get in. Treat a link like a key: whoever opens it first gets the account.
You can show the QR again for any invitation that is still waiting.

**Blocking** (Admin, Users): *Block* signs the person out of every device at once, stops new sign-ins ("This account
has been blocked") and denies their data, with an optional reason only admins see. *Unblock* restores access. You can
also promote or demote admins and delete a user with their data. Administrators cannot block, demote or delete
themselves, so you cannot lock yourself out. All of this is enforced on the server; hiding the panel from non-admins is only
a courtesy.

### Behind a reverse proxy (read this before going live)

- **Tell PocketBase the real client address, or the login limit locks everyone out.** PocketBase limits logins per IP
  address (10 a minute). Behind a proxy every request comes from the proxy's address, so a few wrong passwords would block
  all users. In the dashboard (`/_/`) go to Settings, Application, and set the *User IP proxy headers* to
  `X-Forwarded-For`. Only do that when PocketBase is reachable *only* through your proxy, otherwise anyone can fake the header.
- **Add security headers at the proxy.** The app ships a Content-Security-Policy as a `<meta>` tag, which cannot carry
  `frame-ancestors`. Send `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`),
  `X-Content-Type-Options: nosniff` and `Strict-Transport-Security` from the proxy.
- **Storage is not capped per user.** Each piece may hold up to 1 MB of markup (real ones are about 10 KB) and there is no
  limit on how many. Keep registration on *Invitation only* on a public server, and block anyone who abuses it.

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
| `score` | PDF page view, measure boxes (draw / split / merge / drag), keyboard shortcuts, barline auto-detection, reading marks from the PDF (text layer or OCR), measure grid |
| `tempo-map` | Timeline engine (meters, tempos, bezier ramps, pickups, fermatas, count-in), inspector, curve editor, tap tempo |
| `structure` | Repeats, endings, D.C./D.S. and how they unroll into a playing order |
| `playback` | Click scheduling on the audio clock, offline WAV rendering |
| `library` | Pieces and their PDFs, stored on the device (IndexedDB, one database per account) |
| `playlist` | Ordered pieces, sequential playback, one-file export |
| `share` | Link codec and validation (untrusted input), read-only guest view |
| `auth`, `admin`, `sync` | Sign-in and invitations, the admin panel (invitations with QR, users, registration mode), last-write-wins sync of markup between devices |

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

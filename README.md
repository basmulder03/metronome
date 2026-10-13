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

Hardening that ships with the migrations: owner-only access rules, login/registration/share rate limits, and a schema with
no file field at all, so a score cannot be uploaded even by a hand-made request.

### Deploying

How the live server is laid out (behind Cloudflare, next to other sites on the same machine):

- PocketBase runs as its own user from `/opt/metronome` (binary, `pb_public` = the built app, hooks, migrations), data in
  `/var/lib/metronome/pb_data`, under a hardened systemd unit (`metronome.service`) bound to `127.0.0.1:8090`.
- nginx has one extra file for the hostname: port 80 only answers Let's Encrypt and redirects, port 443 proxies to PocketBase. It
  trusts `CF-Connecting-IP` only from Cloudflare's published ranges and passes the visitor's address as `X-Forwarded-For`;
  PocketBase is set (Settings, User IP proxy headers) to read that header, so the login limit counts visitors, not Cloudflare.
- Cloudflare's SSL mode must be *Full* or *Full (strict)*: with *Flexible* the redirect on port 80 loops.
- Registration stays *Invitation only*. Back up `/var/lib/metronome/pb_data`.
- Ship a new build with `DEPLOY_HOST=root@host scripts/deploy.sh`.

### Editing the measure boxes

- **Auto-detect** finds the measures on *every* page in one go. Running it again never wipes your work: the n-th box on a page
  keeps its tempo, time signature and repeat marks and only gets a new shape. That is also how you reuse a click track for
  another part of the same score: in the Library, *Duplicate* the piece (it copies the tempos, meters and boxes, not the
  PDF), *Attach PDF* or *Replace PDF* with the other part, open it and run Auto-detect.
- **Drag** a box to move it; drag a handle on a selected box to resize an edge. A barline that two boxes share moves both, so
  dragging a bar resizes the two measures around it. **Split** (tap a barline) and **Merge** fix wrongly found or missed bars.
- **Outlining:** a box you draw takes the top and height of the other boxes in its row, and its left and right edges connect
  to the barline of a neighbour that is close. After a drag or resize, edges settle onto nearby neighbours. Hold **Alt** to skip
  this for one gesture, or switch it off in Options. **Tidy row** (`T`) evens out a whole row at once: same top and height,
  small gaps and overlaps between bars closed.
- Every edit can be undone with Ctrl+Z (a whole drag is one step).
- **Settings for a measure:** pick a box and its settings (time signature, tempo, accel./rall., parts, rests, repeats and
  endings) open in a card, in the corner on a desktop and as a bottom sheet on a phone. Each group can be folded away. The card
  hides while you draw or split, and closes with its ✕ or when you press Esc.
- **Keyboard** (press `?` in the app for the list): ← → select a measure, Delete removes the box, Alt+arrows move it,
  Alt+Shift+arrows resize it, `,` and `.` move the barline after it (hold Shift for bigger steps), `M` merges with the next
  measure, `D`/`S`/`V` switch mode, Space plays or stops, Esc deselects, F2 renames. Shortcuts pause while you type in a field
  or have a dialog open.

### Upbeats, rests and sheets with several parts

- **Upbeats (pickups):** select the bar and choose *Only the last beats* with how many are written. A piece that began with
  an upbeat usually ends with a bar that is *Only the first beats*, which completes it. The count-in leaves room for the upbeat
  (1-2-3, then the upbeat is "4"). Auto-detect suggests an upbeat when the first box is much narrower than the rest.
- **Multi-measure rests:** give the box the number of bars it stands for. The click runs for all of them, and boxes then show
  the printed bar numbers (a four-bar rest box reads *2–5*, the next one *6*).
- **Repeats with endings:** *Plays on pass* has a tick box for the 1st to 4th pass, so a bar can be "1st and 2nd". *Bars in this
  ending* applies the choice to that many bars from the selected one, which is how a bracket over several bars is written.
- **Several parts on one sheet** (movements, sections): mark where each part starts and name it. A part can *start the bar
  numbers again at 1*. A piece (or a restarting part) that opens with an upbeat prints that bar as **0**, so the first full bar is 1. In Options choose what happens
  at the end of a part: *Keep playing* or *Stop and wait*. A part can also be flagged to always stop after it. When playback
  stops, the next part is selected, so Space continues with a fresh count-in. Use the part picker next to the title to jump to
  a part, and *Export this part* to get one part as its own audio file. Repeats inside a part do not end it.
- **Share view:** *See share view* in the title bar shows the piece the way a share link opens it, without your PDF. A
  multi-measure rest is then just one tile like any other bar (not spelled out or labelled), because another player's part has other rests.
  Each part starts on a new row with its name above it.
- **Repeats and jumps are drawn on the boxes and the plain tiles:** the repeat barline with its dots, one continuous line over a
  whole repeated section (with ×N for more than two plays) and a bracket over each ending ("1.", "2."), each block in its own
  colour and labelled once. Jumps are badges that say where they go: "D.S. ↩ Segno · bar 3", "To Coda → bar 12", "D.C. ↩ bar 1",
  "Fine ■"; a jump with no segno or coda to go to is shown in red.
- **Practice loop:** select a measure, open *Practice* in its settings, choose the last measure and a rest in seconds, and
  press *Practise*. The range repeats, with the rest in between, until you press Stop (or Space). Repeats inside the range are
  played as written.
- **Bulk editing:** Shift+click a second measure (or type *Edit several: through measure*, for touch screens) to select a run.
  The panel then sets the time signature or tempo for the whole run (the music after it keeps what it had), puts an ending
  over it, clears its repeats and jumps, deletes the boxes, or starts a practice loop on it. In the Library, tick several
  pieces to delete them or add them to a playlist.
- **The tab icon beats** in time with the click while playing, with a bigger swell on the first beat of each bar.
- **Moving a library:** in the Library, *Export all* saves the markup of every piece as one file (never a PDF) and *Import file*
  adds the pieces from such a file. That is how markup made on a test server is moved to the real one.
- **Saving:** everything is saved automatically as you work (the title bar shows the state). Ctrl+S saves right now and syncs
  to your account, instead of the browser's *Save page* dialog.

### Sharing

*Share* in the Library (one piece) or in Playlists (a playlist with the markup of all its pieces) gives a short link like
`https://host/#s=k3m9x2ab`. The markup is stored on the server under that code, so the link stays short however long the piece
is; sharing the same thing again gives the same link. Anyone with the link can read the markup (and nothing else: no PDF ever
reaches the server), so treat a code like a key. Opening a piece link signed out gives a read-only player (attach your own PDF);
signing in offers to import it, and a playlist link imports the playlist and its pieces. Creating a link needs an account.
Old long `#share=` links still open, and if the server cannot be reached, sharing falls back to such a link.

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
| `playback` | Click scheduling on the audio clock (loops with a rest, beat callback), offline WAV rendering, the beating tab icon |
| `library` | Pieces and their PDFs, stored on the device (IndexedDB, one database per account) |
| `playlist` | Ordered pieces, sequential playback, one-file export |
| `share` | Link codec (pieces and playlists) and validation (untrusted input), short-link client, read-only guest view |
| `auth`, `admin`, `sync` | Sign-in and invitations, the admin panel (invitations with QR, users, registration mode), last-write-wins sync of markup between devices |

Styling rules are in `src/shared/ui/STYLE.md` (tokens, light/dark via `light-dark()`, a test that rejects raw colours).

## Known limits

- **Bar numbers check the boxes.** Reading a scan with OCR also looks for thick multi-measure rest bars and for the boxed
  rehearsal numbers printed over the systems. Between two such numbers the bars must add up: that gives the length of a rest,
  and flags boxes that are probably false splits (a stem taken for a barline, offered as *merge*), a barline that was missed
  (*split*) or a stretch that cannot be explained (a note, never changed). Tempo words with no mark (Allegro, Andante...) are
  suggested with their usual speed. Everything is a suggestion you tick first.
- **Reading the score is best effort.** "Read from PDF" uses the PDF's own text layer when there is one (exact: tempo marks,
  time signatures, rit./accel. words) and OCR for scans (tempo marks, rit./accel. words, rests and bar numbers; OCR cannot read the note glyph in a tempo mark, so the beat unit is a
  guess, and it cannot read music-font time signatures). Everything is a suggestion you review first, and the end tempo of a rit./accel. is always a guess.
  Barline detection is classical image processing and will miss on dense, skewed or handwritten scores.
- **Repeat signs, voltas and fermatas are not read from the page**; mark them in the editor.
- **Share links cannot be withdrawn yet.** A code stays valid (it is deleted with its owner's account), at most 200 per account.
  A practice loop is not saved with the piece.
- **Sync trusts device clocks** (last write wins per piece or playlist). A badly wrong clock can win unfairly.
- **Sync pulls everything each time**, which is fine for a personal library, not for thousands of pieces.
- **Count-in** uses the first measure's meter and tempo; fermatas apply on every pass of a repeat.
- **WAV export** renders in two-minute chunks but is assembled in memory at 2 bytes per sample (about 320 MB per hour of audio); the app asks before exports longer than 30 minutes.

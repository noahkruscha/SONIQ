# SONIQ

A Spotify-inspired, offline-first music app for the **Amazfit Active** (Zepp OS 3.x, 390 × 450).
SONIQ plays MP3 files stored on the watch, searches downloadable Creative Commons music, and
controls a Spotify account through the official Web API.

> SONIQ never downloads, rips or stores Spotify audio. Spotify streaming is DRM-protected and the
> Web API exposes no audio files; SONIQ only controls playback on a Spotify Connect device.

---

## What the app does

**Home — player first.** The app opens directly on the player: artwork, title, artist, seek-style
progress display, elapsed/total time, previous, play/pause, next, like and download. Scrolling down
reveals Search, Audio output, the local *Downloaded* library, Spotify playlists and Storage.

**Search.** In-app QWERTY keyboard with shift, symbols layer, backspace and space, modelled on the
reference keyboard app. Typing debounces for 700 ms and prefetches results; at least two characters
are required. Providers: Internet Archive (no key), Jamendo (optional Client ID) and Spotify
(requires sign-in). Empty, loading and error states are shown instead of blank lists.

**Track screen.** Artwork, title, artist, duration, estimated size, licence line, storage warning,
download progress (download → BLE transfer → local save), cancel, retry, auto-play when finished,
two-tap delete and a shortcut to the Downloaded playlist.

**Downloaded playlist.** A local-only list persisted as JSON on the watch. It is never synced to
Spotify. Tracks play offline with no phone nearby.

**Spotify.** OAuth from the Zepp app settings page, playlists, playlist tracks, search, likes (saved
tracks), now-playing, transport controls and Spotify Connect device list/transfer. Token refresh
happens on the phone; expired sessions and Premium-only actions produce clear messages.

Spotify now requires PKCE with `S256`, while Zepp's OAuth component sends `plain` and has no option
to change it. SONIQ therefore uses Spotify's standard authorization-code flow with the user's own
Client Secret, entered in settings and stored only in the phone's Zepp settings storage. No secret
is bundled in the source or the install package.

**Audio output.** Shows the real state of the watch output (system-managed speaker/Bluetooth),
watch volume, a background-playback toggle that requests the `device:os.bg_service` permission, and
the real Spotify Connect device list. No audio-routing option is invented.

**Storage.** Reads `getDiskInfo` and shows free/total space, used percentage and a breakdown
(downloaded music, mini programs, watch faces, system, other music). Downloads are checked against
free space plus an 8 MB reserve before they start; failures are surfaced in the UI and with a toast.
Cleanup removes orphaned audio files and interrupted transfer leftovers.

**Background playback.** When the app is left while music is playing, playback is handed to a Zepp
OS App Service (`app-service/playback`). Reopening SONIQ stops the service and resumes control.

---

## Requirements

- Amazfit Active (or Active 2 Square) paired with the Zepp app.
- A computer with **Node.js 18–22** for building. (Node 26 works through the bundled wrapper.)
- The Zepp app's developer mode enabled, and the Zeus CLI (installed as a dev dependency here).
- Optional: a Spotify account and a Spotify Developer app for the Spotify features.
- Optional: a Jamendo developer Client ID for Jamendo search.

## Install and build

```bash
npm install
npm test          # 15 unit tests, no device needed
npm run build     # produces dist/<appId>-SONIQ-<version>-<timestamp>.zab
```

`npm run build` calls `tools/zeus.mjs`, which runs the official Zeus CLI with its bundled private
modules on `NODE_PATH` (newer Node versions otherwise fail to resolve `zeppos-app-utils`).

To preview on a connected watch with developer mode:

```bash
npm run dev       # Zeus dev server; scan the QR code with the Zepp app
```

Or install the built `.zab` through the Zeus CLI / Zepp developer tools. Assets are regenerated with
`npm run assets` (requires Python 3 and Pillow); the generated PNGs are already committed.

## Spotify setup

1. Open <https://developer.spotify.com/dashboard>, create an app.
2. Copy its **Client ID** and **Client Secret** (Dashboard → your app → Settings).
3. In the Zepp app: Profile → SONIQ → Settings, paste both values. They are stored only in the
   phone-side settings storage; the secret is never written into the app package or this repo.
4. Add Zepp's redirect URI to the Spotify app under **Redirect URIs** — Spotify sends you back to
   Zepp's settings page, so the value is fixed by Zepp, not by SONIQ:
   `https://zepp-os.zepp.com/app-settings/redirect.html`
   (Zepp's settings runtime builds it from the page origin and `/app-settings/redirect.html`; there
   is no `appId` in it, despite older guides showing one. Older guides also use the staging host
   `zepp-os-staging.zepp.com`, which production installs never send.)
5. Tap **Connect Spotify**. If Spotify still reports a redirect-URI mismatch, note the URL of the
   sign-in error page and add that exact `redirect_uri` value.
6. Premium is required for transport controls and Connect transfers. Free accounts can still browse
   playlists, search and change saved tracks.

Requested scopes: `user-read-private`, `user-read-email`, `user-read-playback-state`,
`user-modify-playback-state`, `playlist-read-private`, `playlist-read-collaborative`,
`user-library-read`, `user-library-modify`.

## Jamendo setup (optional)

Create an app at <https://devportal.jamendo.com>, paste the **Client ID** in SONIQ settings. Jamendo
tracks are Creative Commons and expose 128 kbps MP3 downloads. Without a key, SONIQ uses the
Internet Archive only.

## How it works

```
page/*                 watch UI (one bundle per page)
  ↕ zml request/call over BLE
app-side/*             phone-side service: all HTTP + downloads (watch apps have no network)
  ↕ transferFile
app-service/playback   background audio service (no UI, no timers)
shared/*               pure logic shared by the watch, the phone and the tests
lib/*                  watch-side services: state, library, player, downloads, persistence
```

- **Device apps on Zepp OS 3.x have no network module.** Every request, download and OAuth token
  refresh runs in the app-side service; the watch only sends compact JSON over Bluetooth.
- **Audio is local only.** `@zos/media` plays files from `data://music`; there is no HTTP streaming
  API. A download therefore flows: phone HTTP download → size/format checks → BLE transfer → MP3
  header validation on the watch → `renameSync` into `data://music` → library JSON.
- **Search licensing.** Internet Archive items are fetched with `licenseurl` and only items with an
  explicit Creative Commons or public-domain licence are listed. Jamendo results are CC by default;
  the API is asked for 128 kbps MP3 (`audioformat=mp32`).
- **Progress below API 4.2.** `@zos/media` has no `getCurrentTime()`/`seek()` on API_LEVEL 3.6, so
  the progress bar is display-only and derived from play/pause events plus elapsed wall time.
- **State.** One state object lives in `globalData` because each page is a separate bundle; the media
  player and download manager therefore survive navigation.

### Files on the watch

| Path | Contents |
| --- | --- |
| `data://soniq/library.json` | downloaded tracks + local likes (atomic write via rename) |
| `data://soniq/settings.json` | provider, volume, last track, background flag |
| `data://music/soniq-<id>.mp3` | downloaded audio |
| `data://artwork/<id>.jpg` | cached artwork |

## Verification (what was actually run)

- `npm test` — **15 tests pass**: formatting, storage math, URL allow-list (Spotify CDN rejected),
  MP3/JPEG header validation, size/bitrate checks, track identity/dedupe, library add/remove/like/
  prune/orphan cleanup, download state machine, Archive and Jamendo parsers/licence gate, Spotify
  mappers (tracks, playlists, devices, playback, saved tracks), keyboard state machine.
- `npm run build` — Zeus CLI 1.9.3 builds a `.zab` for device sources 8323328 / 8323329 (Active) and
  the Active 2 Square sources; all 7 pages, the app service, app-side and settings bundles, and all
  24 assets are present in the package; no bundler warnings.
- **Not tested on physical hardware.** No watch or phone was available, so runtime behaviour (BLE
  transfer throughput, OAuth redirect handling on a real Zepp app, actual audio routing, notification
  and background-service behaviour) is unverified. Treat those as needing a device pass.

## Known limitations (by design, not placeholders)

1. **Spotify audio cannot be downloaded.** The UI says so and offers to search licensed copies
   instead. Spotify entries are catalogue/remote-control only.
2. **No seek slider.** API_LEVEL 3.6 has no seek; the progress bar is read-only. Reopening the app
   restarts the current file from the beginning, and background handover also restarts the file.
3. **Audio routing is system-managed.** Zepp OS does not let a mini program choose speaker vs
   Bluetooth headset; the Audio output screen states this and only offers watch volume + real Spotify
   Connect devices.
4. **Downloads need the phone and the Zepp app** for the BLE transfer; they cannot run on the watch
   alone.
5. **Download quality is whatever the source publishes** (128–160 kbps MP3 target). Files are
   validated by size, bitrate estimate and MP3 header; a mislabeled file is rejected with a message.
6. **No download resume after an app kill.** Partial phone-side files are cleaned up on the next
   "Clean up files"; the watch library is reconciled against existing files at startup.
7. **Spotify search shows tracks only in the watch result list** (artists/albums are parsed but not
   rendered as separate destinations).
8. **Jamendo requires your own Client ID**; without it the provider chip explains what to add.
9. **`icon.png` is generated art**, not an official Spotify asset. The app is Spotify-inspired and
   unaffiliated with Spotify.
10. **OAuth redirect URI belongs to Zepp, not SONIQ.** Production Zepp serves settings from
    `zepp-os.zepp.com`, so Zepp's runtime sends `https://zepp-os.zepp.com/app-settings/redirect.html`;
    whitelist that exact URI in Spotify. A mismatch is reported by Spotify as
    `redirect_uri: Not matching configuration`.
11. **Spotify sign-in uses the classic authorization-code flow, not PKCE.** Zepp's OAuth window
    sends `code_challenge_method=plain`, which Spotify now rejects (`Only code_challenge_method
    S256 is supported`). The app therefore asks for your own Client Secret and stores it in the
    phone's Zepp settings storage; no secret is included in the repository or install package.
    Rotate the secret in the Spotify dashboard if it is ever exposed.

## Project layout

```
app.js                     BaseApp: state, library, player, downloads, handoff
app.json                   v3 manifest: pages, app-side, settings, app service, permissions
app-side/index.js          request router (Spotify, catalogue, downloads, artwork)
app-side/spotify.js        token refresh + Web API client
app-side/catalog.js        Internet Archive / Jamendo search, resolve, cache
app-side/downloads.js      HTTP download + BLE transfer + cancel
app-service/playback.js    continuous playback service
page/home|search|results|track|playlist|output|storage
setting/index.js           Spotify Client ID/Secret Auth, Jamendo key, sign out
lib/*                      UI kit, page chrome, persistence, library, player, downloads
shared/*                   pure modules (also used by the Node tests)
tests/*.test.mjs           node:test suites
tools/make_assets.py       regenerates icons/artwork
tools/zeus.mjs             reproducible Zeus CLI wrapper
```

Change `app.appId` in `app.json` before publishing under your own developer account.

## Licence

Source: MIT. Downloaded music keeps its own licence (Creative Commons or public domain) and is
stored only on the user's watch. Spotify is a trademark of Spotify AB; SONIQ is not affiliated with
Spotify.

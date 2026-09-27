# ReadAloud

**Paste. Press Play. Listen.**

A privacy-first text-to-speech reader built on your browser's own speech
engine, for listening to chat and message text. No account, no cloud, no API
keys, no telemetry, no storage.

---

## What it does

- Paste a chat or message thread and listen to it read aloud.
- **Hindi and Marathi by default**, chosen automatically from the voices your
  device actually has.
- Picks the most natural-sounding voice it can, and tells you which voices sound
  robotic.
- Adjust speed and pitch.
- Play, pause, resume, stop, or clear at any point.
- A live wave and a live caption that highlight the word being spoken, both
  driven by the engine's real playback position.
- Reading progress and a "part 3 of 7" indicator.
- Long texts are split into chunks and queued automatically, so you can listen
  to a whole thread without a single dropped word.
- Works as an installable app ("Add to Home Screen") on mobile and desktop.

## Privacy

This is the whole point of the project:

- Text lives in React state **only while the tab is open**. It is never written
  to `localStorage`, `sessionStorage`, IndexedDB, cookies, the URL, or any
  backend.
- There is no analytics, no error reporting, and no network request of any kind.
  Once the page has loaded, the app is fully offline.
- Speech is produced on-device by the browser's own voices, so your text is
  never sent to a server.

The only test that would let this app break that promise is one that asserts it
directly. It exists, in `src/App.test.tsx`.

## Requirements

The Web Speech API is well supported, but a browser may still expose zero
voices (common on Linux without `speech-dispatcher`, in some headless setups, and
in some locked-down environments). ReadAloud detects this and says so plainly
instead of failing silently. If the device has no voices, install the system
voice pack - on Windows that is *Settings > Accessibility > Narrator voices*, on
Linux `speech-dispatcher` plus a voice package.

## Getting started

```bash
npm install
npm run dev
```

Then open the local URL Vite prints.

### Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Start the dev server with hot reload          |
| `npm test`          | Run the full Vitest suite once                |
| `npm run test:watch`| Run Vitest in watch mode                      |
| `npm run typecheck` | Type-check every project with `tsc -b`        |
| `npm run lint`      | Lint with ESLint                              |
| `npm run build`     | Type-check and build for production           |
| `npm run preview`   | Serve the production build locally            |

## How it is built

Vite + React 19 + TypeScript, tested with Vitest and Testing Library. No UI
framework, no state library, no CSS framework, no runtime dependency beyond
React itself.

```
src/
  App.tsx                     screen composition, runtime text and settings state
  components/                 editor, voice picker, speed/pitch, controls, status,
                              plus the live wave, caption and progress gauge
  hooks/
    useSpeechSynthesis.ts     React state for playback, voices, and validation
    useKeyboardShortcuts.ts   Space to play/pause, Escape to stop
  services/
    speechService.ts          the only module that touches speechSynthesis
  utils/
    textChunker.ts            splits long text into speakable pieces
    textStats.ts              characters, words, estimated time
    validation.ts             user-facing error messages
    voices.ts                 voice ranking, language names and grouping
    constants.ts              limits and presets
```

### Notes on the tricky parts

**Making it sound human.** The app cannot change the quality of a voice, only
choose between them, so it does three things. It ranks every device voice:
neural/online/Google voices are marked Natural, compact/eSpeak voices are marked
Robotic, and the best on-device Hindi or Marathi voice is selected for you
without being asked. It also states the voice's language on the utterance, which
without it makes an engine mispronounce Devanagari badly.

A `localService: false` voice is always ranked last, even if it sounds best.
Those are the network voices (Chrome's and Edge's "Google" voices) that
synthesise on a server, and using one would break the privacy promise above.

If every voice available is marked Robotic, no setting in the app can fix it,
because a compact voice is a formant synthesiser. The app says so and points at
the voice packs to install. The quickest wins are *Google Hindi* / *Google
Marathi* on Android, and the "(Natural)" or "Online" variants of Swara (Hindi)
and Heera (Marathi) on Windows.

**Chunking.** Browsers truncate or stall on long utterances, so text is split
into pieces of at most 200 characters. The splitter prefers paragraph, then
sentence, then word boundaries, and understands Devanagari danda (`।`) as a
sentence end. It never drops or reorders a character.

**Chrome's restart bug.** Chrome silently ignores a `speak()` issued in the same
task as a `cancel()`. Restarting a session therefore waits for a task boundary -
but only when something was already playing, because iOS Safari requires
`speak()` to run synchronously inside the original user gesture. Getting this
backwards makes the app mute on iPhone.

**Chrome's 15-second stall.** Long pauses in the queue cause Chrome to go
silent, so a keepalive resumes the engine while a session is active.

## Testing

203 tests cover chunking, the speech queue, error handling, the hook, every
component, keyboard shortcuts, voice ranking, accessibility (`axe-core`), and the
privacy guarantee.

```bash
npm test
```

`window.speechSynthesis` cannot speak in jsdom, so the service is tested against
a controllable fake that can be made to fail, stall, or report missing voices on
demand.

## Accessibility

Labelled controls, real semantic elements, visible focus rings, a live region
announcing status, keyboard-operable everything, AA contrast in both light and
dark themes, 44px minimum touch targets, and respect for
`prefers-reduced-motion` and `prefers-contrast`.

## PWA scope

The app ships a web manifest and icons, so it can be installed from the browser.
It intentionally ships **no service worker**: the app is a single static page
with no offline data worth caching, and adding a cache layer would only risk
serving a stale build. The speech engine is the device's, so there is nothing
for a service worker to proxy.

## License

MIT

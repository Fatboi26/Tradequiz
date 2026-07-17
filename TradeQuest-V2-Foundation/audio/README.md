# audio/

**This folder is intentionally empty, and the platform works fine that way.**

TradeQuest's sound effects are *synthesised* in the browser using the Web Audio
API — see `TONES` in `js/ui/effects.js`. There are no MP3 files to download, no
extra HTTP requests, and no licensing to worry about. Correct answers, wrong
answers, badge unlocks and level-ups each get a short generated tone.

Sound respects the student's setting in **Display & sound**, and can be turned
off for everyone in `config/branding.json` (`features.sound: false`).

## If you would rather use real audio files

1. Drop your files in here, e.g. `audio/correct.mp3`.
2. In `js/ui/effects.js`, replace the body of `play(name)` with something like:

   ```js
   export function play(name) {
     if (!soundOn()) return;
     const a = new Audio(`audio/${name}.mp3`);
     a.volume = 0.4;
     a.play().catch(() => {});   // browsers block audio before a user gesture
   }
   ```

3. Provide a file for each name used by the platform:
   `correct`, `wrong`, `tick`, `badge`, `levelup`, `start`, `timeout`.

Use short files (under ~1 second). Anything longer gets annoying by question
three, and overlaps itself in Time Attack.

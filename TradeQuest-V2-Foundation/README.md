# TradeQuest

A quiz and revision platform for trades, construction and vocational learners,
built for the **College of North West London**.

Static files only. No server, no build step, no frameworks — HTML5, CSS3 and
vanilla JavaScript modules. Upload the folder to Cloudflare Pages and it runs.

**What ships in the box:** 7 subjects · 15 quizzes · 72 questions · 24 avatars ·
16 badges · 7 game modes · 10 question types.

---

## Contents

1. [Deploy it](#1-deploy-it)
2. [Try it locally](#2-try-it-locally)
3. [Folder structure](#3-folder-structure)
4. [Re-brand it](#4-re-brand-it)
5. [Add a subject](#5-add-a-subject)
6. [Write questions](#6-write-questions)
7. [The teacher dashboard](#7-the-teacher-dashboard)
8. [Game modes](#8-game-modes)
9. [XP, levels, badges and avatars](#9-xp-levels-badges-and-avatars)
10. [Accessibility](#10-accessibility)
11. [Where the data lives](#11-where-the-data-lives)
12. [Adding features later](#12-adding-features-later)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Deploy it

### Option A — drag and drop (quickest)

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**.
2. **Create** → **Pages** → **Upload assets**.
3. Drag this whole folder in. Not a zip of the folder containing the folder —
   `index.html` must sit at the top level of what you upload.
4. Name the project (e.g. `tradequest`) → **Deploy site**.
5. It's live at `https://tradequest.pages.dev`.

### Option B — Git (better for the long run)

1. Push this folder to a GitHub or GitLab repository.
2. Cloudflare Pages → **Connect to Git** → pick the repo.
3. Build settings:
   - **Framework preset:** `None`
   - **Build command:** *leave empty*
   - **Build output directory:** `/`
4. **Save and Deploy.**

Every push to `main` now redeploys automatically. This is the option you want if
you'll be adding quizzes through the year: edit a JSON file, commit, done.

### Your own domain

Pages project → **Custom domains** → **Set up a domain**. If the domain is
already on Cloudflare, the DNS record is created for you.

### There is nothing else to configure

No environment variables, no `_redirects`, no `_headers`, no functions. Routing
is hash-based (`student.html#/quiz/plu-tools-01`) precisely so no rewrite rules
are needed.

---

## 2. Try it locally

You **cannot** just double-click `index.html`. The pages use JavaScript modules
and `fetch()`, which browsers block on `file://` URLs. You need any local
web server:

```bash
# Python (already on macOS and most Linux)
python3 -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000>.

**Teacher PIN:** `1234` — change it before you deploy (see below).

---

## 3. Folder structure

```
index.html              Landing page
student.html            The whole student experience (hash routing)
teacher.html            Teacher dashboard

config/
  branding.json         ← colours, logos, fonts, college name, PIN
  gamification.json     ← XP curve, levels, scoring, badges

questions/
  index.json            ← the subject registry. Add a subject = add a line here
  plumbing.json         One file per subject
  electrical.json
  carpentry.json
  construction.json
  health-safety.json
  maths.json
  english.json

avatars/
  index.json            Avatar roster + unlock rules
  *.svg                 24 original avatars

images/
  logo-cnwl.webp        College logo
  logo-ucg.webp         Group logo
  q/*.svg               Diagrams used by image and hotspot questions

css/
  tokens.css            Design tokens. Overwritten at runtime by branding.json
  base.css              Reset, layout primitives, site chrome
  components.css        Buttons, cards, tiles, XP bar, badges, leaderboard
  game.css              Question types, HUD, results
  pages.css             Whole-screen layout
  animations.css        Confetti, XP floats, loaders, celebrations

js/
  core/
    config.js           Loads branding + gamification, applies CSS variables
    storage.js          localStorage: profiles, scores, teacher edits
    bank.js             Loads and validates question files
    utils.js            DOM helper, shuffle, formatters, announce()
  game/
    engine.js           The quiz state machine. Knows nothing about the DOM
    modes.js            Game mode definitions (pure config)
    questionTypes.js    One renderer + one grader per question type
    scoring.js          Points and XP maths
    gamification.js     Levels, streaks, badge rules, avatar unlocks
    progress.js         Turns a finished run into profile changes
  ui/
    components.js       Reusable pieces (player strip, cards, leaderboard)
    effects.js          Confetti, toasts, XP floats, sound
    a11y.js             Contrast / motion / text size controls
  app/
    hub.js              index.html controller
    student.js          student.html controller
    teacher.js          teacher.html controller

audio/                  Empty on purpose — sounds are synthesised. See its README
assets/favicon.svg
```

**The shape of it:** `core` knows nothing about games. `game` knows nothing
about the DOM. `ui` knows nothing about quizzes. `app` wires them together.
That's why the engine could later drive a live multiplayer room without being
rewritten.

---

## 4. Re-brand it

Everything visual lives in **`config/branding.json`**. You should never need to
touch CSS or JS to re-brand.

```jsonc
{
  "collegeName": "College of North West London",
  "collegeShortName": "CNWL",
  "platformName": "TradeQuest",
  "tagline": "Level up your trade.",

  "logo": "images/logo-cnwl.webp",
  "logoSecondary": "images/logo-ucg.webp",
  "favicon": "assets/favicon.svg",

  "colors": {
    "primary": "#00857D",     // main brand colour
    "secondary": "#2C5FA8",
    "accent": "#B0208C",
    "bg": "#0E1826",          // page background
    "surface": "#1E2E49",     // cards
    "gold": "#F5C64C"         // XP, celebrations, primary actions
    // …plus text, success, warning, danger, info
  },

  "answerColors": ["#E04B5A", "#2C5FA8", "#E8A33D", "#22B573", "#B0208C", "#3FA9F5"],

  "fonts": {
    "heading": "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
    "body": "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    "googleFontsUrl": ""      // paste a Google Fonts URL and it loads itself
  },

  "icons": { "xp": "⭐", "streak": "🔥", "badge": "🏅", "…": "…" },

  "features": {
    "sound": true,
    "confetti": true,
    "showGroupLogo": true,
    "teacherPin": "1234"      // ← CHANGE THIS
  }
}
```

**How it works:** on every page load, `config.js` writes these colours into CSS
custom properties on `:root`, so the whole stylesheet re-colours itself. The
values in `css/tokens.css` are only fallbacks for the split second before the
JSON lands.

Two things to know:

- **The PIN is not security.** Anything in a static site is readable by anyone
  who opens DevTools. It stops students wandering into the dashboard. That's all
  it's for. Don't put anything confidential behind it.
- **Check contrast if you change colours.** The palette that ships passes
  WCAG AA on every screen (verified with axe-core). A lighter `danger` or
  `primary` can quietly break that.

---

## 5. Add a subject

Two steps. No code.

**Step 1** — create `questions/welding.json`:

```json
{
  "subject": {
    "id": "welding",
    "name": "Welding & Fabrication",
    "icon": "🔥",
    "color": "#E8A33D",
    "description": "MIG, TIG, MMA and the safety that goes with them."
  },
  "topics": [
    { "id": "processes", "name": "Welding processes" },
    { "id": "safety", "name": "Hot works safety" }
  ],
  "quizzes": [
    {
      "id": "wel-mig-01",
      "title": "MIG Welding Basics",
      "topic": "processes",
      "level": "Level 2",
      "description": "Wire, gas and what the settings actually do.",
      "tags": ["mig", "gas"],
      "schedule": { "publishAt": null, "expiresAt": null },
      "questions": [
        {
          "id": "q1",
          "type": "mcq",
          "text": "Which shielding gas is most common for MIG welding mild steel?",
          "options": ["Pure argon", "Argon/CO₂ mix", "Pure helium", "Nitrogen"],
          "answer": 1,
          "time": 20,
          "explain": "An argon/CO₂ mix gives a stable arc with good penetration on mild steel."
        }
      ]
    }
  ]
}
```

**Step 2** — add one line to `questions/index.json`:

```json
{ "id": "welding", "file": "questions/welding.json", "enabled": true }
```

Redeploy. The subject appears everywhere — hub, student picker, dashboard
filters, Random Mix, badge rules.

Set `"enabled": false` to hide a subject without deleting it.

> A broken subject file will **not** take the site down. It's skipped, logged to
> the console, and reported at the top of the teacher dashboard.

---

## 6. Write questions

Every question needs `id`, `type`, `text` and `time` (seconds). `explain` is
optional but you should always write one — it's shown after the answer and in
the results review, and it's where most of the actual teaching happens.

Optional on any question:
- `"bonus": true` — double points, gets a gold flash and confetti
- `"points": 800` — override the calculated points

### The ten types

**`mcq` — multiple choice.** Options are shuffled on display, so `answer` is the
index in the array you wrote, not the position on screen.

```json
{ "id": "q1", "type": "mcq", "text": "Which tool cuts copper tube squarely?",
  "options": ["Hacksaw", "Tube cutter", "Junior hacksaw", "Angle grinder"],
  "answer": 1, "time": 20, "explain": "A tube cutter leaves a square end…" }
```

**`truefalse`**

```json
{ "id": "q2", "type": "truefalse", "text": "A single check valve protects against fluid category 3.",
  "answer": false, "time": 15, "explain": "Category 3 needs a double check valve." }
```

**`multi` — pick every correct one.** All of them, none of the wrong ones, then
Submit.

```json
{ "id": "q3", "type": "multi", "text": "Which of these are PPE?",
  "options": ["Hard hat", "Scaffold", "Hi-vis vest", "Safety boots"],
  "answer": [0, 2, 3], "time": 30, "explain": "…" }
```

**`image` — same as mcq, with a picture.** `imageAlt` is **required** — a screen
reader user must be able to answer the question.

```json
{ "id": "q4", "type": "image", "text": "Which fitting is the reducer?",
  "image": "images/q/pipe-fittings.svg",
  "imageAlt": "Four copper fittings labelled A to D: an elbow, a tee, a coupler and a reducer.",
  "options": ["A", "B", "C", "D"], "answer": 3, "time": 20, "explain": "…" }
```

**`order` — sequencing.** Write `items` in the **correct** order; they're
shuffled for the student. Drag works, but Move up / Move down buttons are the
primary route so it works on a keyboard and with a screen reader.

```json
{ "id": "q5", "type": "order", "text": "Put the safe isolation steps in order.",
  "items": ["Identify the circuit", "Isolate", "Secure the isolation",
            "Prove the tester", "Test the circuit is dead", "Re-prove the tester"],
  "time": 45, "explain": "…" }
```

**`match` — pair them up.**

```json
{ "id": "q6", "type": "match", "text": "Match each joint to its use.",
  "pairs": [
    { "left": "Dovetail", "right": "Drawer sides" },
    { "left": "Mortise and tenon", "right": "Door frames" }
  ], "time": 45, "explain": "…" }
```

**`dragdrop` — assembly.** `accepts` lists the item ids a target will take.

```json
{ "id": "q7", "type": "dragdrop", "text": "Drag each fixing to the right substrate.",
  "targets": [
    { "id": "t1", "label": "Solid brick", "accepts": ["i1"] },
    { "id": "t2", "label": "Plasterboard", "accepts": ["i2"] }
  ],
  "items": [
    { "id": "i1", "label": "Frame fixing" },
    { "id": "i2", "label": "Spring toggle" }
  ], "time": 45, "explain": "…" }
```

**`hotspot` — tap the right part of a drawing.** `x`, `y`, `w`, `h` are
percentages of the image. Keyboard users aim with arrow keys and press Enter.

```json
{ "id": "q8", "type": "hotspot", "text": "Click the earth conductor.",
  "image": "images/q/plug-wiring.svg",
  "imageAlt": "A cutaway 13 A plug with five parts labelled A to E.",
  "areas": [{ "shape": "rect", "x": 44, "y": 18, "w": 14, "h": 16 }],
  "time": 25, "explain": "…" }
```

**`numeric` — calculations.** `tolerance` gives them the rounding slack.

```json
{ "id": "q9", "type": "numeric", "text": "A room is 4.2 m × 3.6 m. What is the floor area?",
  "answer": 15.12, "tolerance": 0.05, "unit": "m²", "time": 60,
  "explain": "4.2 × 3.6 = 15.12 m²." }
```

**`scenario` — practical judgement.** An mcq with a situation above it.

```json
{ "id": "q10", "type": "scenario",
  "scenario": "You arrive to change a radiator valve on a sealed system at 1.5 bar. You isolate the valve, undo the union, and water runs out steadily and doesn't stop.",
  "text": "What is the most likely cause?",
  "options": ["The lockshield on the other end isn't closed", "The radiator needs bleeding",
              "The pump is running", "The system is over-pressurised"],
  "answer": 0, "time": 40, "explain": "…" }
```

### Adding an eleventh type

1. Add `{ render, grade, reveal }` to `TYPES` in `js/game/questionTypes.js`.
2. Add its name to `QUESTION_TYPES` and a validation case in `js/core/bank.js`.
3. Add a label to `TYPE_LABELS` and a template to `SNIPPETS` in `js/app/teacher.js`.

Nothing else changes. The engine, scoring, modes and results all work off the
registry.

**The one rule:** every type must be completable with a keyboard alone. Drag is
always an enhancement over a click/keyboard path that works on its own.

### Question images

Put them in `images/q/`. SVG is ideal — sharp on a whiteboard, tiny to load, and
you can label parts for hotspot questions. The two that ship (`plug-wiring.svg`,
`pipe-fittings.svg`) are hand-built originals you can copy as a starting point.

---

## 7. The teacher dashboard

`teacher.html` → PIN → dashboard.

You can: **add · edit · delete · duplicate · import · export · schedule ·
organise by subject · create topics · search · preview**.

### The bit that matters

A static site **cannot write back to `/questions/`**. So:

- Quizzes you create or edit in the dashboard are saved **to that browser**.
- They work immediately — for testing, and on a single classroom machine.
- To make them permanent for everyone: **Export subject file** → drop the
  downloaded JSON into `/questions/` → redeploy.

That round trip is the whole model. Quizzes marked **"This device only"** haven't
been exported yet.

The editor is a guided header (title, subject, topic, level, tags, schedule) plus
a JSON textarea with live validation and one-click question templates. It's JSON
rather than a hundred bespoke form widgets because the schema keeps growing, you
copy question sets between quizzes, and JSON is what actually ships.

### Scheduling

`publishAt` and `expiresAt` are ISO timestamps. A quiz outside its window is
hidden from students but stays visible to you, marked *Scheduled* or *Expired*.
Leave both `null` to publish immediately and forever.

### Import

Accepts a whole subject file, or a bare array of quizzes. Matching IDs are
overwritten.

### Backups

**Data & backups** exports everything in the browser (profiles, scores, edits)
to one JSON file, and restores it. Worth doing before you clear a shared machine.

---

## 8. Game modes

Defined in `js/game/modes.js` — pure config, no per-mode branching in the engine.
Adding a mode is an entry in the list.

| Mode | What it does |
|---|---|
| 🏁 **Classic Race** | The full quiz against the clock. Speed is most of the score. |
| 🤝 **Team Battle** | Split the room, pass the device. Per-team scores. |
| 🛡️ **Survival** | Three lives, endless questions. How far can you get? |
| ⏱️ **Time Attack** | One clock for the whole run. Answer as many as you can. |
| 📖 **Practice** | No clock, no pressure, explanations on. No XP — so the badges still mean something. |
| 🎓 **Teacher Challenge** | Harder scoring, no explanations. For the board. |
| 🎲 **Random Mix** | 15 questions pulled from every published quiz across every subject. |

Random Mix credits XP to each question's own subject, so mixed play still moves
the trade badges along.

---

## 9. XP, levels, badges and avatars

All in **`config/gamification.json`**.

```jsonc
"xp": {
  "perCorrect": 10,             // base XP per correct answer
  "speedBonusMax": 10,          // extra for answering fast
  "streakStep": 2,              // extra per consecutive correct
  "streakCapBonus": 20,         // ceiling on the streak bonus
  "perfectRoundBonus": 50,
  "quizCompleteBonus": 25,
  "bonusQuestionMultiplier": 2
},
"levels": {
  "base": 120, "growth": 1.25, "maxLevel": 60,
  "titles": { "1": "Trainee", "5": "Apprentice", "12": "Improver", "…": "…" }
},
"streaks": { "dailyResetHours": 36 }
```

`dailyResetHours: 36` is deliberate — a student who plays Monday evening and
Tuesday morning keeps the streak, but skipping a full day loses it.

### Badges

Each badge is a `rule` object evaluated against the profile:

```json
{
  "id": "plumbing-apprentice",
  "name": "Plumbing Apprentice",
  "icon": "🪠",
  "description": "Earn 500 XP in Plumbing.",
  "rule": { "type": "subjectXp", "subject": "plumbing", "value": 500 }
}
```

Available rule types: `quizzesCompleted`, `fastCorrect`, `perfectQuiz`,
`bestStreak`, `dayStreak`, `subjectXp`, `survivalRun`, `timeAttackScore`,
`totalXp`, `badgeSet`.

The 16 that ship include the six you asked for: 🪠 Plumbing Apprentice,
⚡ Electrical Improver, 🪚 Carpentry Craftsperson, 🏗 Construction Operative,
🦺 Health & Safety Champion, and 🏆 Master Tradesperson — which uses
`badgeSet` to require the other five.

**A new rule type** = one `case` in `ruleMet()` in `js/game/gamification.js`.

### Avatars

24 original SVGs in `avatars/`, listed in `avatars/index.json`:

```json
{
  "id": "copper-comet",
  "name": "Copper Comet",
  "file": "avatars/copper-comet.svg",
  "tool": "Pipe bender",
  "unlock": { "type": "badge", "id": "plumbing-apprentice" }
}
```

`unlock.type` is `free`, `level`, `xp`, `streak` or `badge`. Twelve are free;
twelve unlock. Locked avatars show *what to do* to earn them, not just a padlock.

To add one: drop an SVG in `avatars/`, add an entry to `index.json`. 200×200
viewBox, circular crop. They're deliberately original artwork — copyrighted game
characters would be a legal problem on a college site.

Once a student earns an avatar it's recorded on their profile, so changing a rule
later never takes it back off them.

---

## 10. Accessibility

Verified with axe-core against WCAG 2.1 AA on every screen — hub, onboarding,
subject list, mode picker, live quiz, badges, dashboard — in both normal and
high-contrast modes. **Zero violations.**

- **Keyboard:** everything is reachable and operable. No drag-only interactions —
  ordering has Move up/down buttons, drag-and-drop has a click-to-place path,
  hotspot aims with arrow keys.
- **Screen readers:** questions are announced before focus moves, a shared live
  region (`#sr-live`) reports score, streak, lives and selections. Every image
  question requires `imageAlt`.
- **High contrast:** pure black/white with solid outlines.
- **Reduced motion:** honours the OS setting *and* an in-app override. Turns off
  confetti, transitions and celebrations.
- **Text size:** four steps up to 150%, no layout breakage.
- **Targets:** minimum 44×44px. No horizontal scroll at 320px.

Settings live behind the ⚙ button in the header, saved per device.

**If you extend it:** run `axe-core` before you ship, keep contrast above 4.5:1,
and make sure any new interaction works without a mouse.

---

## 11. Where the data lives

Everything is in the browser's `localStorage`, under the `tq.` prefix:

| Key | What |
|---|---|
| `tq.profile` | Nickname, avatar, XP, badges, history, stats, streak |
| `tq.scores` | Leaderboard rows |
| `tq.customQuizzes` | Teacher edits not yet exported |
| `tq.deletedQuizzes` | Tombstoned quiz IDs |
| `tq.a11y` | Display & sound preferences |
| `tq.teacherUnlocked` | Whether the PIN has been entered |

What this means in practice:

- **One profile per browser.** On a shared classroom machine everyone shares one
  — which is right for whiteboard use, and wrong for individual revision. That's
  what student login solves (below).
- **Leaderboards are per-device.** Perfect for a classroom, useless across a
  cohort. Same fix.
- **Clearing browsing data wipes it.** Back up from the dashboard first.
- **Private browsing** may block storage entirely. The hub warns the student and
  quizzes still play; nothing is saved.

---

## 12. Adding features later

The structure anticipates these. Rough shape of each:

**Student login / Google / Microsoft** — the profile is already a plain object
behind `getProfile()`/`saveProfile()` in `storage.js`. Swap those two for API
calls and everything downstream works unchanged. Cloudflare Access or a Worker
with D1 would do it.

**Cloud saves** — same two functions. Add a `syncedAt` field, push on change,
merge on load.

**Cross-class leaderboards** — `getScores()`/`addScore()`. A Worker with D1 or
KV behind them, and the board goes cohort-wide.

**Online multiplayer / live classroom** — this is why the engine emits events
instead of touching the DOM. A Durable Object holds the `Engine`, broadcasts
`question`/`tick`/`end` over WebSocket, and receives `answer()`. The renderers
don't change.

**QR joining** — a Pages Function generating a room code, `student.html#/join/ABC123`.

**Certificates** — the profile already has `history`, `stats` and badges.
Generate a PDF client-side from a template.

**Reports** — the same data, aggregated. Currently per-device; needs cloud saves
first to be worth much.

**AI-generated quizzes** — a Worker calling an LLM with the question schema from
this README, output straight into the dashboard's import.

The rule of thumb: **`core` and `game` shouldn't need to change** for any of
these. They're all storage and transport.

---

## 13. Troubleshooting

**Blank page, console says "Failed to load module script" or CORS errors**
You opened `index.html` from `file://`. Use a local server (section 2).

**"Could not load the quizzes"**
`questions/index.json` is missing or malformed, or a `file` path in it doesn't
match the actual filename. Case matters on Cloudflare, even though it may not
have on your Mac or Windows machine.

**A subject is missing**
Check `enabled: true` in `questions/index.json`, and check the dashboard — a file
that failed to parse is reported at the top with the JSON error.

**A quiz doesn't show for students but does in the dashboard**
Scheduling. Look at the status chip: *Scheduled* or *Expired*.

**Edits vanished**
They were in that browser's storage. Different browser, different machine,
cleared data, or private mode. Export the subject file to make them real.

**Colours didn't change**
Hard refresh (Ctrl/Cmd + Shift + R) — Cloudflare caches aggressively. Check
`branding.json` still parses; an invalid JSON file falls back to defaults and
logs a warning.

**Sound doesn't play**
Browsers block audio until the user interacts with the page. It starts working
after the first tap. Check the ⚙ settings and `features.sound`.

---

## Credits and licensing

- **Avatars** (`avatars/*.svg`) — original artwork made for this project.
- **Question diagrams** (`images/q/*.svg`) — original.
- **Favicon** — original.
- **Sound** — synthesised at runtime via the Web Audio API. No files, no licences.
- **Logos** (`images/logo-*.webp`) — CNWL / United Colleges Group property.
- **No third-party code.** No frameworks, no CDN dependencies, no trackers,
  nothing loaded from anywhere but your own domain.

Question content is written for UK vocational teaching and references current
British Standards, Building Regulations and BS 7671. **Check it against the
current editions before teaching from it** — regs change, and this was written
at a point in time.

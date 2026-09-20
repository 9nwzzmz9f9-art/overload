# Build Prompt — Overload (PWA)

This project was originally scoped as a native iOS app (see the sibling
project at `~/Overload`). That build hit a hard platform wall: Live
Activity lock-screen logging (§6.1 in the original spec) turned out to
depend on an obscure, poorly-documented ActivityKit behavior, and after
extensive debugging we deliberately dropped it rather than keep fighting
Xcode. This document adapts the same product spec to a installable
Progressive Web App. Domain logic (§3, §4, §5) is unchanged from the
original — only the platform sections differ.

## 0. Platform

- Plain HTML/CSS/JavaScript. **No frameworks, no build step, no
  third-party dependencies.** No npm, no bundler. Files are served as-is.
- Installable as a PWA (`manifest.json` + a service worker) so it can be
  added to the iOS home screen and run full-screen, offline.
- Storage: IndexedDB, hand-written (no wrapper library). This is the web
  equivalent of the SwiftData store in the original spec — same schema
  shape, same constraints philosophy (§2 below), just a different engine.
- Fully offline after first load. The service worker caches the app
  shell; IndexedDB holds all data. No network calls at runtime, ever.
- Dark theme first, high contrast, large tap targets — same reasoning as
  the original: used with chalky hands under gym lighting.
- Target: mobile Safari on iOS (primary), should not break on desktop
  Safari/Chrome incidentally.

**Dropped from the original spec:** §6.1 Lock-screen logging (Live
Activities, Dynamic Island). No web API exposes the iOS Lock Screen or
Dynamic Island to any browser — this is a permanent platform wall, not a
current gap. The workout screen (§6 Active Workout) is the fastest path
to logging a set instead; see §6.1 (renumbered) below for how the rest
timer degrades gracefully without it.

## 1. What we're building

A web-based strength training tracker for a single user (me). It is a
**logger with a deterministic progression engine** — not a coach, not an
AI app. The app tells me exactly what to lift next, I log reps, and it
decides on its own whether each set's weight goes up next session.

The design goal during a workout is **one thumb, three taps**. Everything
else is secondary.

**Non-goals — do not build these:**
- No social feed, sharing, leaderboards, or accounts
- No LLM/AI features, no network calls of any kind
- No cardio, mobility, or HIIT tracking
- No exercise video library or form instructions
- No Apple Watch app
- No HealthKit integration
- **No advisory or coaching behavior of any kind** — no stall detection,
  plateau warnings, fatigue scores, readiness estimates, volume
  recommendations, or suggestions about what I should do. The app
  reports what happened and applies the deterministic rules in §5.
  Nothing else. If a feature would tell me an opinion, it does not
  belong in this app.

## 2. Storage schema constraints

IndexedDB has no foreign keys or joins — model relationships as stored
IDs, resolved in application code (a small repository layer, §7.4). Keep
every object store's records self-describing (no reliance on cursor
order or implicit structure). This is looser than the original spec's
CloudKit-readiness constraints (§2 there), since there's no sync target
here — but keep the same discipline: don't let two stores implicitly
depend on each other's internal shape.

## 3. Domain concepts — read this section carefully

This program has four characteristics that off-the-shelf apps (Strong,
Hevy, StrengthLog) get wrong. They are the reason this app exists. Do
not simplify them.

### 3.1 Per-set independent weights

**An exercise does not have "a weight." Each working set has its own
weight and progresses independently.**

Incline DB Bench at home might be Set 1 @ 70lb, Set 2 @ 65lb, Set 3 @
60lb. If I hit 7 reps on Set 1 and 5 reps on Set 2, then next session Set
1 is 75lb and Set 2 stays at 65lb.

There is no `currentWeight` field on an exercise. Weight lives on a
per-set-slot record.

### 3.2 Location-aware programming

I train at three locations: `home`, `beach`, `florida`. The same routine
has **different exercises and different weights** at each location,
because equipment differs. A routine's exercise list is a function of
(routine, location). Weights are a function of (exercise, location, set
number).

I pick the location when I start a workout. History is location-tagged.

### 3.3 Alternating pairs (not true supersets)

Some exercises are paired and alternated to share equipment, **with a
full rest timer between every leg**:

```
Bench S1 → rest → Row S1 → rest → Bench S2 → rest → Row S2 → rest → Bench S3 → rest → Row S3
```

This is not a back-to-back superset. Rest behaves identically to a
straight set. The app must generate a flat, ordered session plan from
the pair definition and walk it — I should never have to think about the
interleaving.

### 3.4 Warmups are reminders, not data

Warmup sets are displayed as a prompt ("Warmup — tap when ready") and are
**never logged and never affect progression**. Do not create records for
them.

## 4. Data model

Build these as IndexedDB object stores, one per concept below. Each
record gets a string ID (generated client-side, e.g. `crypto.randomUUID()`).
Relationships are stored as ID references, resolved by a small repository
layer (§7.4) — never scatter raw IndexedDB queries through UI code.

**`exercises`** — `id`, `name`, `equipmentCategory` (barbell / dumbbell /
machine / cable / bodyweight / weightedBodyweight), `defaultIncrement`,
`notes`, `isArchived` (soft-delete flag). Global; not location-specific.

**`routines`** — `id`, `name` (Upper, Lower, Push, Pull), `rotationIndex`
(0–3). This is the global fallback rotation order, used when no program
(below) is active.

**`programs`** (user feedback, added post-launch) — `id`, `name`,
`routineIds` (ordered array). An overarching grouping of existing
routines, e.g. "Winter Bulk" containing Upper/Lower/Push/Pull — pure
membership + order, never ownership: deleting a program never deletes a
routine, and a routine may belong to more than one program. `appSettings`
tracks one `activeProgramId`; when set, the rotation (§5.1) walks that
program's `routineIds` order instead of the global `routines` list.

**`routineBlocks`** — `id`, `routineId`, scoped to a `location`. Has
`orderIndex`, `blockType` (`single` or `alternatingPair`), `exercise1Id`,
`exercise2Id` (nullable), `hasWarmup1`, `hasWarmup2`. This is what makes
routine composition vary by location.

**`setTargets`** — the core table. Logically unique on (`exerciseId`,
`location`, `setNumber`) — enforce this in the repository layer, not via
an IndexedDB unique index (compound uniqueness across three fields is
easiest to check in code). Fields: `currentWeight`, `repRangeLow`,
`repRangeHigh`, `progressionTriggerReps`, `increment`, `restSeconds`.
`setNumber` is the working-set index for that exercise (1, 2, 3…) — *not*
the position in the interleaved sequence.

`progressionTriggerReps` is an **absolute rep count**. **It always equals
`repRangeHigh`** (user feedback, changed post-launch: the two were
originally independent — a slot could be printed "4–6" but actually earn
its jump at, say, 7 reps — but `repRangeHigh` otherwise did nothing in
the trained experience, so the fields were collapsed). `repository.
createSetTarget`/`updateSetTarget` enforce this centrally: editing
`repRangeHigh` *is* editing the trigger, there's no separate field in the
editor. `progressionEngine.js` still reads `progressionTriggerReps` as
its own input — it doesn't know or care that it's now always derived —
so its interface and tests are unchanged.

`currentWeight` may be **negative** for `weightedBodyweight` exercises
(e.g. Weighted Pull-up at -25 means 25lb of assistance). Handle the sign
correctly in display, math, and progression, including crossing through
zero.

**`appSettings`** — single record: default increments by equipment
category, default rest seconds (default 180), `activeProgramId`
(nullable — see `programs` above). `defaultProgressionTriggerReps` is
dead now that the trigger always equals `repRangeHigh` — left in place
in existing records rather than migrated away, but nothing reads it.
Changing a default affects newly created slots only; it never
retroactively rewrites existing `setTargets` records (the trigger/
repRangeHigh collapse above is the one deliberate exception — see its
note on the one-time migration).

**`scheduledWorkouts`** — `id`, `date`, `routineId`, `location`, and an
optional `fulfilledByWorkoutId`. Represents intent only (see §5.1).

**`workouts`** — `id`, `date`, `routineId`, `location`, `status`
(`inProgress` / `awaitingProgression` / `complete` / `abandoned`),
`notes`.

**`loggedSets`** — `id`, `workoutId`, `exerciseId`, `setNumber`,
`weightUsed`, `reps`, `completedAt`, `wasSubstituted` (bool),
`substitutedExerciseName` (nullable), `notes`.

Store `weightUsed` on the logged set, not just a reference to the
target — if I deviate from the prescribed weight, history must record
what I actually lifted.

**`progressionEvents`** — append-only audit log: `id`, `exerciseId`,
`location`, `setNumber`, `oldWeight`, `newWeight`, `reason` (`progressed`
/ `held` / `deloaded` / `manualEdit`), `workoutId`, `timestamp`. This
drives the charts and gives me an undo path.

**`plateProfiles`** — one per `location`: `barWeight`, available plate
denominations with counts, and optional per-category weight ceilings
(`barbellCeiling`, `dumbbellCeiling`, `machineCeiling`, `cableCeiling`).
Only `dumbbell` is expected to be set in practice. A missing entry means
no ceiling.

## 5. The progression engine

Put **all** of this in a single `progressionEngine` module, exposing one
deterministic implementation behind a well-defined interface (a plain
object of functions is enough — this is JS, not Swift). No progression
logic anywhere else in the codebase.

Evaluated per logged working set at workout completion:

| Condition | Action |
|---|---|
| `reps ≥ progressionTriggerReps` | `currentWeight += increment` for **that set slot only** |
| `repRangeLow ≤ reps < progressionTriggerReps` | Hold |
| `reps < repRangeLow` | Do not change automatically — flag for my decision |

The trigger is an absolute rep count read from the slot. The engine
itself is agnostic about where it comes from — it just compares `reps`
to whatever `progressionTriggerReps` value the slot carries — but in
this app that value is always `repRangeHigh` (§4), enforced by the
repository, not by the engine.

**Default increments** (overridable per `setTarget`):
- Barbell compounds and leg press: +10 lb
- Dumbbell and machine: +5 lb
- Cable/isolation: +5 lb (my dumbbells only go in 5lb jumps)

**Below-range flow:** at workout end, show a summary screen listing every
progression, and for below-range sets present an inline choice —
*Deload (−increment)* / *Hold* / *Custom*. Include "apply to all
flagged" shortcuts. Workout status stays `awaitingProgression` until I
resolve these, then flips to `complete` and writes the
`progressionEvents` records.

**Manual early progression:** on the completion screen, every logged
slot — not just flagged ones — must offer a one-tap override, collapsed
behind an "Override" toggle by default (user feedback — most rows don't
need attention). For a slot the engine already decided to hold, the
override is *Progress anyway* (applies the increment even though the
trigger wasn't reached — I regularly choose to move up early). For a
slot the engine is *already* progressing, offering "Progress anyway"
again reads as broken (user feedback) — the override there is the
opposite instead: *Hold anyway*, reverting to the current weight. Either
writes a `progressionEvent` with reason `manualEdit`/`held` and must be
as fast as accepting the automatic result.

**Note on rep ranges:** `repRangeLow` is the floor I use to *pick* the
starting weight — dip below it and the below-range flow kicks in.
`repRangeHigh` is both the top of that starting picture *and* the
trigger (see §4) — reaching it is what earns the next jump. So the
expected life of a slot is: start near `repRangeLow`, climb over several
sessions, progress on hitting `repRangeHigh`, drop back down at the new
weight.

**Weight overrides:** `weightUsed` may differ from the slot's
`currentWeight` if I change the weight mid-workout. Progression keys off
the weight actually lifted:

- **Lifted below target** → hold, regardless of reps. Do not progress.
  Hitting the trigger at a lighter weight is not evidence the heavier
  weight is ready. Show it on the completion screen as held with the
  reason, so it doesn't read as a bug.
- **Lifted above target** → do not progress automatically. Flag it at
  completion with *Adopt <weight> as the new target* / *Keep
  <currentWeight>*.
- Overrides are **one-off by default**. `currentWeight` is unchanged
  unless I explicitly adopt it. A bad day should never silently rewrite
  the program.

**Equipment ceilings:** each location may define a maximum available
weight per equipment category — in practice only `dumbbell` needs one,
since dumbbell racks top out. When progression would push a slot past
the ceiling, do not apply it. Flag at completion with *Hold at
<ceiling>* / *Raise the rep target instead* (raises `repRangeHigh`,
which is the trigger) / *Swap exercise*. Silently
prescribing a weight that doesn't physically exist is the failure this
prevents.

**Substitutions:** if I swap an exercise mid-workout, log it against the
original slot with `wasSubstituted = true` and **skip progression** for
that slot this session. The per-set "Log as a different exercise" toggle
and the whole-exercise "Switch exercise" flow (§6, below) both resolve
to a name via the same search/browse sheet as the exercise picker
(§6.2) — neither ever creates or links a real exercise record, only a
name string for `substitutedExerciseName` (user feedback: originally
free-text-only).

**Reopening/deleting a workout** (user feedback, added post-launch): a
`complete` workout can be reopened for review, or deleted outright, from
Home. Either action reverts that workout's `progressionEvents` (each
affected slot's weight goes back to the event's `oldWeight`, and the
events are deleted) — the one place the repository breaks
`progressionEvents`' otherwise append-only rule. This is safest for the
*most recently* completed workout; reopening an older one after newer
workouts already built on top of it can leave a weight that no longer
matches what's happened since, and the UI warns before allowing it. A rep
trigger raised via the ceiling flow's "raise trigger instead" can't be
undone this way — the prior value was never recorded.

### 5.1 Scheduling vs. rotation — precedence

The rotation (Upper → Lower → Push → Pull, or an active program's own
routine order — see `programs` in §4) is the **single source of truth**
for what comes next. A `scheduledWorkout` is intent only:

- If today has a `scheduledWorkout`, the Home screen pre-selects that
  routine and location.
- If I start something else instead, the app follows what I actually did
  **silently**. No warning, no confirmation, no "you missed your plan"
  prompt.
- An unfulfilled `scheduledWorkout` whose date has passed is simply
  rendered as unmet on the calendar. It is never deleted and never
  blocks anything.
- Scheduling **never** touches progression state, rotation index, or
  `setTarget` weights.

Do not build reconciliation logic. Plans that don't happen are not
errors.

## 6. Screens

Top nav: **Home / Programs / Routines / Exercises / Settings** (user
feedback — Programs and Settings were each added as their own tab).

**Home** — Which routine is next in the rotation (Upper → Lower → Push →
Pull → repeat, or the active program's own order — see **Programs**
below), a location picker, and a large Start button. Below: last 5
workouts, each with a collapsed "Manage" toggle exposing Reopen (if
`complete`) and Delete — minimized by default since most of this list is
just being scanned, not acted on. If a workout is `inProgress` or
`awaitingProgression`, surface Resume/Review prominently instead.

**Programs** (user feedback, added post-launch) — a lightweight tab
above Routines: create/rename/delete a program, add or remove existing
routines from it, reorder them, and mark one "Active" — the active
program's routine order drives Home's rotation (§5.1). Removing a
routine from a program never deletes the routine; deleting a program
never deletes its routines. Doesn't touch Routines/Blocks/Set-slot
editing at all — see §4's `programs` entry.

**Active Workout** — the screen that matters. Before anything else, a
one-time **5-minute cardio warm-up** offers Start/Skip (user feedback —
same stored-end-timestamp countdown as the rest timer, so it survives
backgrounding too). Then, per plan item:
- Current exercise name, set N of M
- **Target: weight × rep range**, large and unmissable
- What I did on this exact set slot last session (e.g. "Last: 70 × 6")
- A rep entry control — stepper or number pad, pre-filled with a flat 6
  reps (personal preference override; not derived from the slot's rep
  range), one tap to log
- Weight override field (deviating should be easy and shouldn't feel
  like an error)
- Plate calculator, collapsed by default, expanding to show per-side
  loading using the location's plate profile
- On log: auto-start rest timer, auto-advance to the next item in the
  session plan — except a **superset**'s first leg (user feedback,
  post-launch block type alongside single/alternatingPair: same
  interleave as an alternating pair, but zero rest between the two
  exercises, only after the pair; `sessionPlan.js`'s `restAfter` on each
  plan item carries this). Use `navigator.vibrate` if present as a
  best-effort haptic (iOS Safari does not implement it — treat this as a
  bonus for browsers that do, not a requirement)
- **Drop sets** (user feedback, post-launch): "+ Drop set" logs the
  current entry as the slot's primary set, then lets me chain
  reduced-weight, no-rest follow-ups (`dropOf` on `loggedSets` links each
  back to its parent). Drops count toward total weight lifted but are
  never themselves evaluated for progression or shown as "last session's"
  performance — they're an extension of the primary set, not a
  prescribed one.
- Rest timer must survive backgrounding and tab switches. Store a target
  end timestamp and compute remaining — never a ticking in-memory
  counter. See §6.1 below for exactly what "survive" means on this
  platform, including the 1-minute/30-second/3-2-1 alert cadence.
- **Do this later** vs **Skip**: skipping a set or exercise drops it for
  the rest of the workout; "do this later" (user feedback) instead
  resurfaces it once everything else in the plan is done — not
  interchangeable, and not what "switch exercise" (below) is for.
- **Switch exercise** (user feedback, replacing an earlier
  free-standing "swap this exercise for today" action): on the first set
  of an exercise only, opens a choice between (a) trading this
  exercise's remaining positions with another exercise still ahead in
  today's workout — "the equipment for this one is occupied, let me do
  that one now and come back to this one where that one would've been" —
  matched pairwise by remaining occurrence order
  (`exerciseSwap.js`), or (b) swapping the exercise's identity entirely
  for the rest of the session (the substitution behavior above). Swiping
  isn't implemented — tap to skip. Confirmation dialog on back-navigation.

**Workout Complete** — the progression summary and below-range decisions
described in §5.

**Calendar** — month grid, one colored marker per day by routine, with
the location shown on the day detail. Past days show what actually
happened; future days show `scheduledWorkout` intent. Tap a past day for
the full session; tap a future day to schedule or clear a routine and
location. Swipe between months, tap a day to expand. This replaces the
flat list as the primary way I browse history.

**History** — kept as a secondary chronological list, filterable by
routine and location, for when I want to scan quickly rather than by
date.

**Progress** — per exercise, a line chart of weight over time with **one
series per set slot** (Set 1, Set 2, Set 3 as separate lines), since they
progress independently. Toggle for estimated 1RM (Epley:
`w × (1 + reps/30)`). PR detection on heaviest weight and best estimated
1RM per set slot. Filter by location. Hand-draw the chart with `<canvas>`
or inline SVG — no charting library.

**Program Editor** — full authoring, not just editing. This is a
first-class screen, not an afterthought. I must be able to build an
entire routine from an empty app without touching code:

- **Exercises**: pick from a bundled library (see §6.2) or create custom
  ones. Rename, delete, set equipment category and default increment.
  Deleting an exercise with logged history is soft-delete (hidden from
  pickers, history preserved).
- **Routines**: create, rename, delete, reorder in the rotation.
- **Blocks**: within a (routine, location), add a block, choose `single`
  or `alternatingPair`, pick the exercise(s), drag to reorder.
  **Removing a block affects only that (routine, location) pair** — it
  must not touch the exercise record, other locations, or any logged
  history. This is the common operation when adapting a routine to a
  location with different equipment, and it should be frictionless with
  no warning dialog.
- **Set slots**: add or remove working sets on an exercise, and edit each
  slot's weight, rep range low/high, increment, and rest seconds inline.
- **Warmup toggle** per exercise within a block.
- **Copy between locations**: "Duplicate this routine to `beach`" —
  copies structure and weights as a starting point, which I then edit
  down to whatever equipment is actually there. This is how I'll
  populate locations two and three.

Manual weight edits write a `progressionEvent` with reason `manualEdit`.

Assume the app can be launched with **zero routines** and be brought to a
fully usable state entirely through this screen. Empty states should
route me here.

**Settings** (user feedback — "where are the maximums set?") — the app
default rest seconds, a per-location editor for `plateProfiles`: bar
weight, the plate denominations on hand (count = total owned, the
calculator halves per side), and the four equipment ceilings the
progression engine checks (§5). Locations here are the three real ones
(`home` / `beach` / `florida`) — `other` mirrors `home` and has nothing
of its own to edit. A location with no profile yet offers a one-tap
"Create plate profile" with sensible defaults.

**Location names** (user feedback, post-launch) — a text field per real
location ("home" is called ___, etc.), stored in `appSettings.
locationNames` and looked up through `locationLabels.js` everywhere a
location is displayed. Display-only: the underlying ids
(`home`/`beach`/`florida`, and `other`, which is never renameable) never
change, so nothing keyed by location — `setTargets`, `routineBlocks`,
`workouts`, the CSV/JSON export — is touched by a rename.

### 6.1 Rest timer and notifications (adapted from the dropped §6.1)

No lock-screen quick-log — see §0. What we can still do:

- The rest timer is driven by a stored target end timestamp, computed
  fresh whenever the page becomes visible again
  (`visibilitychange`/`pageshow`), never by a `setInterval` assumed to
  keep ticking in the background — it won't.
- While the tab is open and foregrounded, show a countdown and fire a
  local `Notification` (if permission was granted) at the 1-minute mark,
  the 30-second mark, and at zero, plus a `navigator.vibrate` call where
  supported.
- Also fire a short synthesized beep (Web Audio `OscillatorNode` — no
  asset file) at the same marks, **plus a distinct short tick at 3, 2,
  and 1 second left** (user feedback: "a chime at 1 minute, then a 3-2-1
  go countdown"). A single heads-up beep at 1 minute and 30 seconds, a
  quick tick at 3/2/1, two quick beeps at zero. Mobile browsers only let
  an `AudioContext` produce sound once it's been unlocked from inside a
  real user-gesture handler, so every button tap in the active-workout
  flow unlocks it — but the context can also drift back to `suspended`
  on its own mid-session (iOS does this after backgrounding), so every
  play attempt tries to resume first rather than giving up the first
  time it finds the context not running (user feedback: "the chime at
  the end of timers isn't working" — this was the actual bug). Same
  best-effort treatment as vibrate/Notification: never required. The
  cardio warm-up timer (§6) uses the same alert cadence.
- If the PWA is installed (Add to Home Screen) and running standalone on
  iOS 16.4+, `Notification` permission can be requested and notifications
  can still be shown — but iOS Safari does **not** support any form of
  "fire this notification N seconds from now even if the tab is fully
  suspended." There is no web equivalent of a native scheduled local
  notification. Design around this rather than fighting it: when the
  user returns to a backgrounded tab after a rest period has already
  elapsed, detect that immediately (via the stored end timestamp) and
  show the "ready to log" state right away, with a notification/vibration
  fired at that moment rather than at the original zero-mark.
- Do not attempt Web Push. It requires a server to trigger sends at the
  right time, which conflicts with "no networking" and adds real
  infrastructure for a single-user local app. Skip it.

### 6.2 Exercise library

Adding an exercise should be a search-and-tap, not typing a name from
memory.

**Source:** the `free-exercise-db` dataset (public domain,
`github.com/yuhonas/free-exercise-db`).

**Bundle it, don't fetch it at runtime.** Preprocess the raw dataset
once (a small Node or Python script, run manually, not part of the app)
into a trimmed static JSON file committed to the project and loaded by
the service worker into the offline cache like any other asset:
- Keep only entries with `category: "strength"`
- Keep only the fields `name`, `equipment`, `mechanic`, `primaryMuscles`
- **Drop `instructions` and `images` entirely** — they are most of the
  file size and §1 rules out a form library

**Map the dataset's `equipment` values to my `equipmentCategory`
values:**

| Dataset value | `equipmentCategory` | Default increment |
|---|---|---|
| `barbell`, `e-z curl bar` | barbell | +10 |
| `dumbbell`, `kettlebell` | dumbbell | +5 |
| `machine` | machine (stack) | +5 |
| plate-loaded machines (hand-tagged: leg press, hack squat, Leverage/Hammer-style, T-bar row, etc.) | plateLoaded | +10 |
| `cable` | cable | +5 |
| `body only` | bodyweight | n/a |
| everything else | machine | +5 |

**The picker** is a single searchable sheet that shows my existing
`exercises` records first, then library matches, with **Create custom
"<query>"** always available at the bottom. Filters for equipment
category and primary muscle.

Choosing a library entry **copies** it into my `exercises` store with
the mapped category and increment pre-filled. The library is read-only
reference data; my copy is mine to rename and edit, and renaming it must
never mutate the library or break the link to logged history.

Library entries I have never used do not appear in history, charts, or
anywhere outside the picker.

## 7. Hooks for later intelligence

I am deliberately not building AI into v1, but I don't want to be locked
out. Satisfy these without adding any AI:

1. `progressionEngine` is a single module behind a clear interface. A
   future implementation can replace it without touching call sites.
2. Free-text `notes` on `loggedSets` and `workouts`, surfaced in the UI,
   so unstructured context accumulates from day one.
3. A `dataExporter` module producing complete JSON and CSV of every
   workout, set, and progression event, downloadable from a settings
   screen. **Built** (js/dataExporter.js) — JSON is a full, versioned,
   restorable dump of every store; CSV is a flat set/drop log. Both
   download from Settings → Backup. Since all data is device-local
   IndexedDB with no sync, this is the only backup path.
4. All persistence behind a repository module, not raw IndexedDB calls
   scattered through UI code.

## 8. Build order

Ship each phase working before starting the next. Stop and let me test
at each checkpoint.

1. **Schema + platform spike** — IndexedDB schema, service worker +
   manifest for offline install, seeded minimally from §9. Confirm the
   app installs to the home screen, runs full-screen, and works with
   the network disconnected.
2. **Program Editor + exercise library** — full CRUD per §6, with the
   bundled library and picker per §6.2. This comes early on purpose: I
   will enter the rest of my program through this screen rather than
   have it hardcoded, so it needs to work before there's anything to
   test against.
3. **Session plan generation** — pure logic that turns (routine,
   location) into the flat ordered set sequence, including
   alternating-pair interleaving. Unit tests, no UI.
4. **Progression engine** — pure logic, unit tested against the table in
   §5, including negative weights, weight overrides above and below
   target, dumbbell ceilings, and the boundary cases (one below the
   trigger, exactly at the trigger, exactly at `repRangeLow`, and a
   trigger equal to `repRangeHigh`).
5. **Active Workout screen** — logging, advance, rest timer, plate
   calculator.
6. **Completion flow** — summary, below-range decisions, writing
   progression events.
7. **Calendar, history, charts.**
8. **Notifications and polish** — best-effort rest-timer notifications
   per §6.1, PWA install prompt handling, final visual pass.

Write unit tests for phases 2 and 3. They encode the rules that make
this app worth building; everything else is UI I can eyeball.

## 9. Seed data

A fresh (empty) database is seeded with **no exercises, blocks or set
targets** — the Exercises tab starts empty and the real program is
authored through the Exercises tab and Program Editor. Only the
structural minimum is seeded:

- The four routines (`Upper`, `Lower`, `Push`, `Pull`)
- A `plateProfile` for `home`: 45 lb bar, plates in 45/35/25/10/5/2.5,
  and a `dumbbell` ceiling of 75 lb
- Default app settings

(Earlier versions seeded placeholder exercises for exercising the
engine; those were removed. Seeding only runs on an empty database, so
existing data is never touched.)

Leave `Lower`, `Push`, `Pull` and the `beach` / `florida` locations
completely empty — the app must handle that gracefully and route me to
the Program Editor.

## 10. Per-routine set targets

Set targets (weight, rep range, increment, rest, progression) belong to a
**(routine, exercise, location, set number)**, not to the exercise alone.
The same exercise in Upper and in Push is tracked independently — each
progresses on its own from its own logged sets. IndexedDB v3 replaced the
old `(exercise, location, set)` unique index accordingly.

Migration (`migrations.js`, data-driven, also runs after an import):
each legacy target goes to the first routine whose blocks use that
exercise at that location, and every other such routine gets its own
copy starting at the same weight. Progression events record `routineId`.

## 11. Plate-loaded machines

`equipmentCategory: "plateLoaded"` — machines loaded with plates (leg
press, hack squat, Hammer-style presses/rows). Behaves like `machine` for
progression (default increment +10, i.e. 5 lb per side; its own
`plateLoadedCeiling` on the plate profile) but gets the barbell-style plate
diagram. Each such exercise has an optional `startWeight` (the empty
machine's carriage/sled weight, default 0 = the logged weight is plates
only); the diagram subtracts it and splits the rest across two sides. It
assumes symmetric loading from the location's plate profile.

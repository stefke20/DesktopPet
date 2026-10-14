# DesktopPet 🐱🐶

A cute 3D toon **cat or dog** (swap them from the tray menu) that lives on your desktop. It walks along the taskbar, **jumps onto your windows and
text boxes**, climbs window edges, naps, grooms, chases your mouse cursor, **bats your desktop icons around
until they roll across the screen**, and occasionally steps in a puddle and **leaves muddy paw prints that you
wipe away by rubbing the cursor over them**.

Random **events** drop by now and then — a butterfly flutters across the screen and your pet stalks it,
pounces and *always* misses; a ball of yarn rolls in to be batted around.

The pets are real 3D models, generated procedurally (no downloaded assets), skinned to a skeleton and
animated with inverse kinematics — so every step, jump and pose is computed live rather than played back
from canned animation clips.

> **Status:** built and tested in a Linux sandbox (rendering, animation, simulation and the Electron shell all
> run there against a mock desktop). The **Windows-only native layer** (window list, text-box detection and
> desktop-icon moving) is compiled-checked but has **not** been run on a real Windows machine yet — see
> [Known limitations](#known-limitations).

## Run it

Requires Node 20+ (tested on 22). Windows 10/11 for the full experience.

```bash
npm install
npm start          # builds, then launches the overlay (+ system-tray icon)
```

Other platforms can run `npm run start:mock` to see the cat with fake windows and icons.

Right-click the tray icon (orange cat face) for: **Companion (Cat / Dog)**, call your pet, pause, **Reset desktop icons**,
clean paw prints, coat colour (6 cat coats, 5 dog coats), size, what the pet is allowed to do, **Surprise me** (trigger a
butterfly / yarn / random event right now), sound, start with Windows.

| Shortcut | Action |
| --- | --- |
| `Ctrl+Alt+R` | Reset desktop icons immediately |

### With the mouse

* **Hover slowly over the cat** — it purrs and leans into your hand.
* **Click** — it meows (or wakes up and stretches).
* **Click and drag** — pick it up by the scruff; let go and it falls and lands.
* **Rub over muddy paw prints** — they smear away.

## Cat vs. dog

| | Cat | Dog |
| --- | --- | --- |
| Look | big round head, pointy ears, slit-pupil eyes, whiskers | long snout, floppy ears, round eyes, big nose, tongue, curly tail |
| Coats | ginger, brown/grey tabby, black, tuxedo, cream | golden retriever, beagle, dalmatian, black lab, corgi |
| Movement | leaps up to 1.45 body-heights, **climbs window edges** | hops onto *low* ledges only, can't climb; trots and runs faster |
| Habits | grooms, naps on windows, stretches, yawns, meows | sniffs the ground, pants with its tongue out, wags (harder when you pet it), barks, play-bows |
| Event reaction | stalks the butterfly, pounces, fails | barks, chases, leaps, fails |

Swapping keeps the position; mid-air or on a wall the new pet just drops to the floor.

## Random events

A visitor arrives every couple of minutes (turn this off in the tray: *What the pet may do → Random events*, or trigger one
yourself with *Surprise me*). Every prop is 3-D / toon-styled and **sized relative to the pet** — a butterfly about as wide as its
head, a ball the size of its head, a mouse a fifth of its body length — so they scale when you change the pet's size or swap
species. Which visitor shows up depends on who is on the desktop:

| Event | What happens | Cat | Dog |
| --- | --- | --- | --- |
| 🦋 **Butterfly** | flutters erratically; the pet freezes, stalks, crouches, pounces — it slips away at the last moment. After 2–4 failed tries it leaves and the pet sulks | ✓ | ✓ barks |
| 🧶 **Toy** | a ball rolls in and is batted around with real rolling physics, then fades | ball of **yarn** | **tennis ball** |
| 🔴 **Laser dot** | a red dot skitters along surfaces (and hops between windows); the pet chases it, waits for it to pause, pounces — it zips off. It's switched off when the pet is confused enough | likes it | ✓ |
| 🐭 **Toy mouse** | zig-zags along the taskbar, freezes, bolts whenever the pet gets close; escapes off-screen after a few missed pounces | favourite | ✓ |
| 🐦 **Bird** | flies across the top of the screen (the pet watches and chatters/barks) — sometimes lands on a window edge. If the pet can get there it creeps up, wiggles… and the bird flies off | ✓ | ✓ |
| 🔔 **Doorbell** | a comic "DING-DONG!" bubble pops up at a screen edge. The dog sprints over and barks; the cat stares, puffs its tail and backs away | wary | ecstatic |

If the pet is asleep, being petted, held, or playing with your icons when a visitor arrives, it may ignore it; an event that
arrives while the pet is mid-jump is delivered as soon as it lands.

Events are an extensible list (`src/shared/sim/events.js`): add an entity class, a `trigger` case, a reaction routine in
`brain.js`, and a renderer in `src/renderer/props/`.

## What the pet interacts with

| Thing on screen | How the cat reacts |
| --- | --- |
| Taskbar / bottom of the screen | It's the floor: walks, runs, sits, naps |
| Windows | Jumps onto title bars, sits, naps, rides the window when you drag it, falls when it closes. Climbs the side edges of windows that are too high to jump to |
| Text boxes (browser address bar, Google search box, any edit field) | Found via Windows UI Automation; the cat jumps onto them and sits there |
| Desktop icons | See below |
| Mouse cursor | Watches it, chases it and pounces; purrs when stroked |
| Fullscreen apps (games, video) | The cat hides until you leave fullscreen |

### Desktop icons — and the reset button

The cat only touches icons that are actually visible (not hidden behind a window). To play with one it:

1. leaps (or climbs the screen edge) up to the icon and swats it,
2. the icon is swapped for a smooth GPU-drawn "ghost" that tumbles, bounces and rolls along the taskbar and
   window tops, while the real icon is parked off-screen,
3. when the cat loses interest and everything stops, the real icons are placed where their ghosts came to rest.

**Nothing can get lost:** before the very first move, DesktopPet saves every icon's original position to
`%APPDATA%\DesktopPet\icon-baseline.json`. You can undo everything at any time with

* the **↺ Reset desktop icons** button that appears on screen whenever icons have been moved,
* the tray menu entry, or `Ctrl+Alt+R`,
* `node tools/reset-icons.cjs` if the app isn't running.

If the app is closed or crashes while an icon is parked, it is put back automatically (on exit, and on the next
start). If *Auto arrange icons* is on, Windows would undo any move, so the cat leaves your icons alone.

## How it works

```
src/shared/cat/      procedural cat + dog: signed-distance-field body -> surface-nets mesh -> skin weights (rig-def.js = skeletons)
src/shared/species.cjs per-species traits (jump height, climbing, sounds) and coat lists
src/renderer/cat/    Three.js view (PetView/Character, toon shader + outline + eyes), IK rig, pose/gait animator
src/renderer/props/  3-D toon event props (butterfly, yarn / tennis ball, mouse, bird); laser dot + doorbell bubble live in overlay/props.js
src/shared/sim/      pure-JS simulation: world (windows, occlusion), navigation, behaviour "brain", icon physics, random events
src/renderer/        overlay app: input, paw-print layer, props, hand-off to the native bridge
src/main/            Electron main: transparent click-through overlay, tray, polling, icon bookkeeping
src/main/bridge/     PetBridge.cs (Windows native helper) + mock bridge
tools/               screenshot / contact-sheet / scenario harnesses (headless Chromium)
test/                node:test unit + soak tests
```

* The overlay window is transparent, always on top and **click-through**; it only grabs the mouse while the
  cursor is over the cat (or the reset button), so your normal work is unaffected.
* The native helper (`PetBridge.cs`) is compiled on first run with the `csc.exe` that ships with Windows
  (.NET Framework 4) — no SDK or extra install needed. It lists windows (DWM bounds, z-order, cloaked/fullscreen
  detection), finds text boxes via UI Automation, and reads/moves desktop icons through the desktop's list view.
* Coordinates are converted between physical pixels and DIPs, so display scaling (125 %, 150 % …) is handled.
* The simulation is deterministic given a seed and is covered by tests (`npm test`), including a 10-minute soak
  that asserts the cat stays on-screen and supported.

### Developing

```bash
npm test                         # unit + soak tests
npm run build                    # bundle the renderer, regenerate dist/cat.bin when the cat code changes
node tools/sheet.mjs out.png '[{"state":"sit","seconds":1.5}]' 2     # pose contact sheet
node tools/scenario.mjs icons    # fast-forward a scenario in headless Chromium (mud | icons | interact | butterfly | yarn | event | soak)
SCN_EVENT=laser node tools/scenario.mjs event      # watch one event: butterfly | toy | laser | mouse | bird | visitor
SPECIES=dog SWAP_EVERY=45 FAST_EVENTS=1 node tools/scenario.mjs soak     # soak: dog / swapping species / events every 25 s
npm run selftest                 # Electron smoke test (use xvfb on Linux)
npm run pack                     # Windows installer via electron-builder
```

Want a different pet? `src/shared/cat/shape.js` (bodies), `rig-def.js` (skeletons), `src/renderer/cat/coats.js`
(colours) and `toon-shader.js` (markings) are the places to look. A hand-modelled rigged GLB could replace
the procedural body — the animator drives bones by name (see `rig-def.js`).

## Known limitations

* **Untested on real Windows hardware.** The C# helper compiles under Mono and its protocol loop is tested, but
  the Win32 calls (window enumeration, UI Automation, desktop list-view messages, icon extraction) have not been
  exercised on a live desktop. If something misbehaves, `%APPDATA%\DesktopPet\desktoppet.log` says what; the app
  degrades gracefully (e.g. without the helper the cat simply lives on the taskbar).
* Primary monitor only (the overlay covers one display).
* Text-box detection needs the browser's accessibility tree; Chrome/Edge usually expose it automatically once
  UI Automation asks, but if text boxes aren't found try launching the browser with `--force-renderer-accessibility`.
* Icons are moved through the desktop list view with 16-bit coordinates, which is fine for normal screens.
* Not a Sketchfab/asset-store model: the pets are generated in code. It's toon-styled; photoreal fur was prototyped
  first and replaced at your request.

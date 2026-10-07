# Build plan: the fuller experience

Working notes for the build requested on 2026-10-07 and finished the same day. Kept as a record
of what was asked, what was decided and where things live.

## What was asked

1. One journey: Story → Explore → Play. Story is the front page; Explore slides in over the same
   scene with no reload; hands-on moments inside the story; the 30 s tour stays as "Watch".
2. More to play: Start the engine, Find the fault, harder rounds of the quiz and the build game,
   a flight log with a certificate image.
3. The rest of the plane, under one theme ("what the engine powers"): a landing chapter (gear,
   flaps, spoilers, reversers, runway), a cabin slice (the air you breathe), the cockpit as thrust
   levers and engine display, and a whole-aircraft view with hotspots.
4. Smaller things: narrator's voice and background sound (later removed), afterburner switch,
   altitude slider, "how it was made" section, share image.
5. Sky photo stored in the project (done: `public/sky/belfast_sunset_puresky_2k.hdr`).

## Decisions

- **One page.** `index.html` holds every mode; `body[data-mode]` is `story | tour | explore | play
  | aircraft`. `html.story` is set while the story is showing (the document scrolls only then).
  `story.html` and `src/story.js` go away.
- **Top bar.** Tabs are the journey: Story · Explore · Play · Aircraft. Tools next to them: Watch
  (the film) and Log. On phones the tools fold into a "More" menu.
- **Two films.** "The engine" (the original 30 s tour) and "The aircraft" (what the engine powers:
  overview → cabin air → gear → flaps → touchdown → spoilers and reverse). Watch plays either; the
  story scrolls through both, with an interlude panel hiding the cut between them.
- **Aircraft model.** Wing shortened to z = 18 (63 m span on a 58 m fuselage; it was 83 m).
  Movable surfaces follow the lines already drawn in `public/livery/wing-panels.svg`: flaps from
  0.74 chord in three spans (z −10.3…−3.6…5.0…14.0), ten spoilers 0.62–0.74 chord from z −8.5 every
  2.2, slats on the bare-metal leading edge. The far wing is the near one mirrored about the
  fuselage axis (z = −13.5). The far side, gear and cabin are hidden in the engine modes, so those
  look and cost the same as before.
- **Landing.** The aircraft stays put in world space; the runway moves under it and rises to meet
  the wheels. Pitch turns a `rig` group (engine + aircraft + airflow) about the main wheels.
- **Cabin.** A window cut in the forward fuselage with three clip planes (`clipIntersection`); the
  skin is a thick wall with the usual orange section twin; seats, bins, cargo containers inside.
- **Cockpit.** A 2D instrument panel (thrust lever, engine display, start switches) over the running
  cutaway engine. The "Start the engine" game uses the same panel.
- **Sound and narration** were built (synthesised engine sound, a narrator using the device voice)
  and then removed on 2026-10-07: they did not sound good enough. The project is first of all a 3D
  modelling piece, so it stays silent.
- **Hosting.** GitHub Pages, built and published by `.github/workflows/deploy.yml` on every push
  to `main`. Live at https://claudiu1910.github.io/turbofan-explorer/.
- **Numbers** stay illustrative and rounded, as before.

## Status

- [x] Sky photo local
- [x] 1 Flow: single page, story mode, hand-over, hands-on sliders, Watch
- [x] 2 Aircraft model: wing surfaces, mirror, gear, rig, ground, wide shadows
- [x] 3 Aircraft film, Watch picker, story part two, Aircraft mode panel and hotspots
- [x] 4 Cabin cutaway and system lines
- [x] 5 Cockpit panel, Start the engine
- [x] 6 Find the fault, quiz rounds, build levels
- [x] 7 Flight log and certificate
- [x] 8 Explore: afterburner, altitude
- [x] 9 Narration, ambience, game sounds (built, then removed: see Decisions)
- [x] 10 How it was made, share image, favicon, README
- [x] 11 Full check: desktop, tablet, phone, built site

## Where things live (added during the build)

- `src/films.js`: the two films. `src/aircraftFilm.js`: the aircraft film's timeline, camera shots
  and `restAirframe(view)` (what the engine lessons call to put the aircraft back to clean cruise).
- `src/ui/story.js`: the scroll story. Steps carry `data-film`; `.interlude` hides the film change.
- `src/scene/airframe.js`: every aircraft measurement. `wing.js`, `gear.js`, `cabin.js`,
  `systems.js`, `ground.js`: the new parts. `aircraft.js` assembles them; `update(view, time)`.
- `src/data/aircraft.js`: card text for the aircraft's systems, camera homes, hotspots.
- `src/ui/plane.js`: the Aircraft mode's panel and hotspots. `main.js` holds `aircraftFrame`.
- View fields added: `wide, gear, flaps, slats, spoilers, reverseAll, brakes, pitch, rolled,
  ground {agl, travel, alpha}, smoke, veil, cabin, systems {air, hyd, elec}, labelSet, acView`.
- `src/ui/cockpit.js`: the flight deck panel (engine display, start switches, thrust lever).
  `src/sim/start.js`: the engine-start simulation (pure logic, runs in Node for testing).
  `src/ui/sims.js`: the Start the engine and Find the fault games. `src/data/faults.js`: scenarios.
  `src/ui/play.js`: the menu, the quiz (three rounds) and the build game (two levels).
- `src/ui/log.js`: the flight log (localStorage key `turbofan-explorer-log-v1`) and certificate.
- `engineAt(throttle, { jet, reverse, burner, altitude })` and `airAt(km)` in `src/model.js`.

## Checked, and not

- Frame rate, measured 2026-10-07 in Chrome on an Apple M2 with the picture at 2880 × 1800: about
  30 to 45 frames a second on the Full preset, 60 at phone size. Slower machines rely on the
  automatic step-down.
- Nothing was run on a real phone or tablet (only emulated sizes).
- The pictures in `docs/screenshots/` come from real Chrome driving the running site, so they show
  what a visitor sees.

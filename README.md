<!-- markdownlint-disable MD026 -->

# Build It!

<!-- markdownlint-enable MD026 -->

A party platformer for 1 to 8 players. Each round everyone picks a piece from the box and places it on the course (blocks and shaped blocks, low beams, springs, lifts, conveyors, ice, portals, saws, cannons, spike blocks, fire bars, lasers and more, or a random piece from the Mystery card), then everyone takes a turn running from the start to the flag. Reaching the flag scores, and so does knocking out a friend with your trap, but a course everyone finishes scores nothing. It has eight levels with wrapping edges, lava, low gravity and ice, computer players at three skill levels, and a solo practice mode that keeps your best time on each level. It started as a single-file Claude artifact and runs as static assets on a Cloudflare Worker at build-it.motlin.com.

## Layout

`index.html` is the markup and `src/styles/game.css` the stylesheet. `src/main.ts` starts each part of the game on its own, so a failure in one leaves the rest working, then registers the service worker.

`src/game/` is the game:

- `types.ts` holds the shapes the modules share, and `state.ts` the state they share: the level in play, the player setup, the game in progress, the world with the run in it, and the piece being placed.
- `geometry.ts` is the 32 by 18 grid of 40 pixel cells and its collision math. `pieces.ts` defines every piece, with the cells each rotation covers, and `levels.ts` the eight levels. `course.ts` sets the level in play and decides where a piece may go.
- `world.ts` builds the world from the level and the placed pieces and moves every lift, saw, cannon and laser on a shared clock, and `physics.ts` runs, jumps, crouches, lands, teleports through portals and knocks out the runner. `solver.ts` is a cautious grid model of a course that Surprise me and the CPU players use to tell whether it can be finished, and `cpu.ts` is the CPU players, which plan their runs with the real physics, follow them with a person's late reactions and slips, and re-plan on the move. None of these touch the page, so the unit tests run them directly.
- `draw.ts` draws the course and the thumbnails, `ui.ts` runs the game's flow and its screens (setup, level vote, picking, placing, runs, results and solo practice), `input.ts` takes the keyboard, the touch pad under the course, the mouse and the full screen toggle, `loop.ts` is the frame loop, `sound.ts` the sound effects, which hazards play louder the closer the runner is, and `effects.ts` the particles.
- `storage.ts` saves the player setup in localStorage under `pieceparty` and the solo best times under `pieceparty-best`, the artifact's keys.

`tests/unit/game.test.ts` checks the pieces' rotations and placement, that every level's start and flag sit on its ground, that Surprise me can build a finishable course on every level, and the runner falling, jumping, bouncing off a spring, meeting spikes and spike blocks, dropping through a fake block, crouching under a low beam, riding a stood-up conveyor and going through a portal, cannon balls, hazard sounds, and the CPU players' Mystery picks and late reactions. `tests/unit/storage.test.ts` checks saving and loading. `tests/browser/play.spec.ts` builds across The Gap and runs to the flag in solo practice, and plays a 2-player round, nudging a piece into place after a drop where it does not fit.

## Installing and playing offline

The game installs from the browser as a standalone app and plays offline. `src/pwa/manifest.ts` holds the manifest and the fixed files the service worker keeps, and `src/pwa/worker.ts` its logic. `scripts/service-worker-build.ts` builds `src/pwa/sw.ts` to `dist/sw.js`, writes `dist/manifest.webmanifest`, and versions the worker's cache with a hash of everything it keeps, so each deploy that changes them is a new worker. `public/_headers` stops Cloudflare caching `sw.js` and the manifest.

## Icons

`scripts/icons/*.svg` are the hand-drawn sources. `just icons` copies the favicon to `public/` and renders the PNG icons with `rsvg-convert`, and `just og-image` renders the link preview `public/og.jpg` in Chromium with the copy of Fredoka in `tests/fixtures/fonts/`, so it needs no network.

## Development

- `just dev` runs the Vite dev server.
- `just worker` builds and serves `dist/` through `wrangler dev`, the way Cloudflare serves it.
- `just verify` runs lint, type checks, the build, Fallow, the pre-commit hooks, the unit tests and the Playwright tests.

## Deploying

The Worker serves `dist/` as static assets, with no Worker script; see `wrangler.toml`. Pushing to `main` deploys to build-it.motlin.com through `.github/workflows/deploy.yml`, which runs the checks and both test suites, then `wrangler deploy --domain build-it.motlin.com`. It needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. `just deploy` does the same from a machine logged in to Cloudflare.

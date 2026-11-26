<!-- markdownlint-disable MD026 -->

# Build It!

<!-- markdownlint-enable MD026 -->

A party platformer for 1 to 8 players. Each round everyone picks a piece from the box and places it on the course (blocks, planks, springs, lifts, conveyors, ice, saws, cannons, fire bars, lasers and more), then everyone takes a turn running from the start to the flag. Reaching the flag scores, and so does knocking out a friend with your trap, but a course everyone finishes scores nothing. It has eight levels with wrapping edges, lava, low gravity and ice, computer players at three skill levels, and a solo practice mode that keeps your best time on each level. It started as a single-file Claude artifact and runs as static assets on a Cloudflare Worker at build-it.motlin.com.

## Layout

`index.html` is the game as it came from the artifact: its markup and its inline script. `src/styles/game.css` is its stylesheet. It saves the player setup in localStorage under `pieceparty` and the solo best times under `pieceparty-best`. `src/main.ts` is the one module the build adds, and it registers the service worker.

## Installing and playing offline

The game installs from the browser as a standalone app and plays offline. `src/pwa/manifest.ts` holds the manifest and the fixed files the service worker keeps, and `src/pwa/worker.ts` its logic. `scripts/service-worker-build.ts` builds `src/pwa/sw.ts` to `dist/sw.js`, writes `dist/manifest.webmanifest`, and versions the worker's cache with a hash of everything it keeps, so each deploy that changes them is a new worker. `public/_headers` stops Cloudflare caching `sw.js` and the manifest.

## Icons

`scripts/icons/*.svg` are the hand-drawn sources. `just icons` copies the favicon to `public/` and renders the PNG icons with `rsvg-convert`, and `just og-image` renders the link preview `public/og.jpg` in Chromium with the copy of Fredoka in `tests/fixtures/fonts/`, so it needs no network.

## Development

- `just dev` runs the Vite dev server.
- `just worker` builds and serves `dist/` through `wrangler dev`, the way Cloudflare serves it.
- `just verify` runs lint, type checks, the build, Fallow, the pre-commit hooks, the unit tests and the Playwright tests.

Pushing to `main` deploys through `.github/workflows/deploy.yml`, which needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

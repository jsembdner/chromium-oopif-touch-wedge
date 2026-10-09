# Chromium: touch input to the main frame dies after a two-finger touch that starts in an OOPIF

## Summary

When a **second touch point goes down while a first touch is held inside an
out-of-process (cross-origin) iframe**, the main frame stops receiving
`touchstart` and all pointer events (`pointerdown`, `pointerup`, ...). This is
permanent. Every later tap on the main frame, with no fingers on the screen,
produces only the compatibility mouse events and `click`. Only a reload fixes it.

- **Expected:** after both fingers lift, a tap on a button in the main frame
  fires `touchstart`, `pointerdown`, `pointerup`, `click`.
- **Actual:** it fires only `click` (plus `mousedown`/`mouseup`). `touchstart`
  and pointer events never fire in the main frame again.

Any UI that activates on pointer events, or handles touch gestures, stops
responding to touch. Mouse and keyboard input still work normally.

## Run the test from scratch

Requires [Node.js](https://nodejs.org/) 20.11 or newer, and git.

```sh
git clone <this-repo-url> chromium-oopif-touch-wedge
cd chromium-oopif-touch-wedge
npm ci
npx playwright install chromium
npm test
```

`npm test` starts a static server on port 8000 (`server.mjs`) and runs
`repro.spec.ts` in Playwright's Chromium.

> **The test passes while the bug is present.** When the bug is fixed, the last
> assertion fails.

Expected output while the bug is present:

```
  Browser: Chromium 153.0.8010.12
  event        1 tap before   3 taps after
  touchstart   1              0
  pointerdown  1              0
  pointerup    1              0
  click        1              3

  ✓  1 repro.spec.ts:45:5 › touch/pointer events stop reaching the main frame ... (passes while the bug is present)

  1 passed
```

To watch it in a browser window, run `npx playwright test --headed`.

## What the test does

The page (`public/index.html`) has a button on the left and a cross-origin
iframe on the right (`public/frame.html`). The page is served from
`localhost:8000` and the iframe from `127.0.0.1:8000`. The button counts the
`touchstart`, `pointerdown`, `pointerup` and `click` events it receives.

Touches are sent with raw CDP `Input.dispatchTouchEvent`.

1. **Precondition:** the iframe is an OOPIF. The test checks that
   `Target.getTargets` lists a target of type `iframe`.
2. **Baseline:** a tap on the button fires one each of `touchstart`,
   `pointerdown`, `pointerup` and `click`.
3. **Trigger:**
   1. Finger A goes down in the iframe.
   2. Finger B goes down and lifts on an empty area of the main frame, while
      A is still down.
   3. Finger A lifts.
4. **Probe:** with no fingers down, tap the button 3 times. The counts are 0
   `touchstart`, 0 `pointerdown`, 0 `pointerup` and 3 `click`. In a correct
   browser all four would be 3.

Launch flags (`playwright.config.ts`):

- `--site-per-process --isolate-origins=http://127.0.0.1:8000,http://localhost:8000`
  makes sure the loopback iframe gets its own renderer process.
- `--touch-events=enabled` makes `Input.dispatchTouchEvent` arrive as real
  touch in headed mode.

## Manual reproduction (touchscreen device)

```sh
npm run serve
```

Then start Chromium with a fresh profile and the same flags:

```sh
chrome --user-data-dir=/tmp/oopif-repro --site-per-process --isolate-origins=http://127.0.0.1:8000,http://localhost:8000 http://localhost:8000
```

1. Tap **Tap me**. All four counters go up.
2. Rest one finger on the blue iframe. While it is down, tap the grey left
   pane with a second finger. Lift both fingers.
3. Tap **Tap me** again. Only `click` goes up. `touchstart`, `pointerdown` and
   `pointerup` stay at their values from now on.

## Observations

- **An out-of-process iframe is required.** If the iframe is same-origin,
  nothing goes wrong.
- **The first touch must start in the OOPIF.** Holding a finger on the main
  frame and then touching into the iframe is harmless. A single touch in the
  iframe, or two touches that don't overlap, are harmless too.
- **The second touch can land anywhere.** It can hit an empty area of the main
  frame, a button, or another point inside the same iframe. The first finger
  does not even have to lift.
- **Mouse and keyboard input are unaffected.** A real mouse click still
  delivers the full pointer sequence.
- **Removing the iframe from the DOM (or navigating it to `about:blank`)
  restores touch input**, with no reload.
- **Reproduced on Windows 11** with this exact sequence:
  - Chromium 153.0.8010.12 (bundled with Playwright 1.63): 10/10 with
    `--repeat-each=10`, headless and headed
  - Microsoft Edge 154.0.4258.48

  Related touch sequences on the same kind of page also caused this in
  Chromium 149.0.7827.55 and Chrome 154.0.8037.58.

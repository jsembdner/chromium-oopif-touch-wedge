import { test, expect, type CDPSession } from '@playwright/test';

/**
 * A second touch that goes down while a first touch is held inside an
 * out-of-process (cross-origin) iframe permanently stops touchstart and
 * pointer events from reaching the main frame. Later taps produce only the
 * compatibility mouse events and click, until the page is reloaded.
 *
 * INVERTED POLARITY: this test PASSES while the bug is present. Once the bug is
 * fixed, the final assertion fails.
 */

type Point = { x: number; y: number };
type Counts = Record<'touchstart' | 'pointerdown' | 'pointerup' | 'click', number>;

/**
 * Raw multi-touch over CDP. Every still-pressed point must be re-listed on each
 * Input.dispatchTouchEvent, or Chromium treats it as released.
 */
function touchscreen(cdp: CDPSession) {
  const held = new Map<number, Point>();
  let nextId = 1;
  const send = (type: 'touchStart' | 'touchEnd') =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...held].map(([id, p]) => ({ id, ...p })),
    });
  return {
    async down(p: Point) {
      const id = nextId++;
      held.set(id, p);
      await send('touchStart');
      return id;
    },
    async up(id: number) {
      held.delete(id);
      await send('touchEnd');
    },
    async tap(p: Point) {
      await this.up(await this.down(p));
    },
  };
}

test('touch/pointer events stop reaching the main frame after a two-finger touch that starts in an OOPIF (passes while the bug is present)', async ({
  page,
  browser,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const touch = touchscreen(cdp);

  await page.goto('/');
  await expect(page.frameLocator('#frame').locator('#marker')).toBeVisible();

  // Precondition: the iframe really is out-of-process.
  await expect
    .poll(async () => {
      const { targetInfos } = await cdp.send('Target.getTargets');
      return targetInfos.some((t) => t.type === 'iframe');
    }, { message: 'iframe is not out-of-process; check the launch flags' })
    .toBe(true);

  // A multi-touch digitizer (hasTouch alone declares maxTouchPoints = 1).
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const centre = async (selector: string): Promise<Point> => {
    const box = (await page.locator(selector).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const button = await centre('#target');
  const inFrame = await centre('#frame');
  const leftBox = (await page.locator('#left').boundingBox())!;
  const emptySpot = { x: leftBox.x + leftBox.width / 2, y: leftBox.y + leftBox.height * 0.8 };
  const counts = () => page.evaluate(() => (window as unknown as { counts: Counts }).counts);
  const reset = () => page.evaluate(() => (window as unknown as { resetCounts(): void }).resetCounts());

  // 1. Baseline: a touch tap on the button delivers the full touch/pointer sequence.
  await touch.tap(button);
  await expect.poll(counts).toEqual({ touchstart: 1, pointerdown: 1, pointerup: 1, click: 1 });
  const before = await counts();

  // 2. Trigger: finger A down inside the OOPIF, finger B down+up in the main
  //    frame while A is still held, then A up.
  const a = await touch.down(inFrame);
  await touch.tap(emptySpot);
  await touch.up(a);

  // 3. Probe: with no fingers down, tap the button three more times.
  await reset();
  for (let i = 0; i < 3; i++) {
    await touch.tap(button);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1000);
  const after = await counts();

  console.log(
    `\n  Browser: Chromium ${browser.version()}\n` +
      `  event        1 tap before   3 taps after\n` +
      (Object.keys(before) as (keyof Counts)[])
        .map((t) => `  ${t.padEnd(12)} ${String(before[t]).padEnd(14)} ${after[t]}`)
        .join('\n') +
      '\n',
  );

  // The bug: no touchstart or pointer events reach the main frame any more.
  // Expected in a correct browser: 3 of each.
  expect({ touchstart: after.touchstart, pointerdown: after.pointerdown, pointerup: after.pointerup })
    .toEqual({ touchstart: 0, pointerdown: 0, pointerup: 0 });
});

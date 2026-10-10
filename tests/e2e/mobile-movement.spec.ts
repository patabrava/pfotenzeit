import { expect, test, type Page } from '@playwright/test';

type Position = { x: number; z: number };
async function position(page: Page): Promise<Position> {
  return page.evaluate(() => {
    const world = (window as unknown as { __pzWorld: { getState(): { actors: { handler: { position: Position } } } } }).__pzWorld;
    return { ...world.getState().actors.handler.position };
  });
}

for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 844, height: 390 }]) {
  test(`touch arrows move and stop at ${viewport.width}×${viewport.height}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    const controls = page.getByRole('group', { name: 'Ines bewegen' });
    await expect(controls).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => controls.evaluate(node => {
      const box = node.getBoundingClientRect();
      const dock = document.querySelector('.dock')!.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= dock.top && box.top >= document.querySelector('.hud-top')!.getBoundingClientRect().bottom;
    })).toBe(true);
    for (const button of await controls.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(48);
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }
    const cdp = await context.newCDPSession(page);
    const sendTouch = async (direction: string, id = 1) => {
      const box = await controls.locator(`[data-direction="${direction}"]`).boundingBox();
      return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, id };
    };
    for (const [direction, axis, sign] of [
      ['arrowup', 'z', -1], ['arrowdown', 'z', 1], ['arrowleft', 'x', -1], ['arrowright', 'x', 1],
    ] as const) {
      const before = await position(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await sendTouch(direction)] });
      await expect(controls.locator(`[data-direction="${direction}"]`)).toHaveClass(/is-pressed/);
      await expect.poll(async () => ((await position(page))[axis] - before[axis]) * sign).toBeGreaterThan(0.12);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(controls.locator('.is-pressed')).toHaveCount(0);
      await page.waitForTimeout(100);
      const stopped = await position(page);
      await page.waitForTimeout(200);
      const after = await position(page);
      expect(Math.hypot(after.x - stopped.x, after.z - stopped.z)).toBeLessThan(0.01);
    }
    // A cancellation (e.g. OS gesture) must also release the avatar.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await sendTouch('arrowright')] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(controls.locator('.is-pressed')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('mobile-arrows.png') });
    // Opening a modal while a direction is held must stop movement and hide the pad.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await sendTouch('arrowright')] });
    await page.locator('[data-key="dog"]').evaluate((button: HTMLButtonElement) => button.click());
    await expect(controls).toBeHidden();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);
    const modalPosition = await position(page);
    await page.waitForTimeout(200);
    expect(await position(page)).toEqual(modalPosition);
    expect(errors).toEqual([]);
  });
}

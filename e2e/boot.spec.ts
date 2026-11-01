import { expect, test, type Page } from '@playwright/test';

interface DebugState {
  state: string;
  seed: string;
  day: number;
  clock: number;
  night: number;
  player: { x: number; y: number; z: number; health: number; hunger: number };
  enemies: number;
  structures: number;
  pointerLocked: boolean;
  lastSaveAttempt: { manual: boolean; result: string; at: number } | null;
  lastUiAction: { action: string; value: string; at: number } | null;
}

async function debugState(page: Page): Promise<DebugState> {
  const state = await page.evaluate(() => window.__OUTPOST__?.getState() ?? null);
  expect(state).not.toBeNull();
  return state as DebugState;
}

async function waitForPlaying(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__OUTPOST__?.getState().state === 'playing',
    undefined,
    { timeout: 90_000 },
  );
  await expect(page.locator('#hud')).toBeVisible({ timeout: 10_000 });
}

test.describe('OUTPOST ZERO', () => {
  test.setTimeout(180_000);

  test('title, movement, field terminal and checkpoint persistence', async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await expect(page.locator('#title-screen')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('#game-canvas')).toBeVisible();
    await expect(page.locator('h1')).toContainText('OUTPOST');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: testInfo.outputPath('01-title.png') });

    await page.locator('#btn-new-game').click();
    await expect(page.locator('#loading-screen')).toBeVisible({ timeout: 10_000 });
    await waitForPlaying(page);
    await page.waitForTimeout(900);
    await page.screenshot({ path: testInfo.outputPath('02-daylight.png') });

    const before = await debugState(page);
    expect(before.player.health).toBeGreaterThan(0);
    expect(before.seed.length).toBeGreaterThan(2);

    await page.keyboard.down('w');
    await page.waitForTimeout(1600);
    await page.keyboard.up('w');
    await page.waitForTimeout(250);
    const after = await debugState(page);
    const travelled = Math.hypot(after.player.x - before.player.x, after.player.z - before.player.z);
    expect(travelled).toBeGreaterThan(0.08);

    await page.keyboard.press('Tab');
    await expect(page.locator('#terminal-screen')).toBeVisible();
    await expect(page.locator('[data-testid="tab-inventory"]')).toHaveClass(/is-active/);
    await page.waitForTimeout(700);
    await page.screenshot({ path: testInfo.outputPath('03-inventory.png') });

    await page.keyboard.press('c');
    await expect(page.locator('[data-testid="tab-crafting"]')).toHaveClass(/is-active/);
    await page.screenshot({ path: testInfo.outputPath('04-crafting.png') });

    await page.keyboard.press('Escape');
    await expect(page.locator('#terminal-screen')).not.toBeVisible();

    await page.keyboard.press('Escape');
    if (!(await page.locator('#pause-screen').isVisible())) {
      await page.keyboard.press('Escape');
    }
    await expect(page.locator('#pause-screen')).toBeVisible();
    await expect.poll(async () => (await debugState(page)).pointerLocked).toBe(false);
    await page.waitForTimeout(650);
    await page.locator('#pause-save').click();
    await expect(page.locator('#save-status')).toContainText('CHECKPOINT SYNCED', {
      timeout: 5000,
    });
    const saveState = await debugState(page);
    expect(saveState.lastSaveAttempt?.result).toBe('ok');
    await page.screenshot({ path: testInfo.outputPath('05-pause.png') });

    const savedValue = await page.evaluate(() => window.localStorage.getItem('outpost-zero:save:v1'));
    expect(savedValue).not.toBeNull();

    await page.reload();
    await expect(page.locator('#title-screen')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('#btn-continue')).toBeEnabled({ timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath('06-title-continue.png') });
    await page.locator('#btn-continue').click();
    await waitForPlaying(page);
    const loaded = await debugState(page);
    expect(loaded.day).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(800);
    await page.screenshot({ path: testInfo.outputPath('07-loaded.png') });

    expect(pageErrors).toEqual([]);
  });

  test('nightfall, hostiles and construction terminal', async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await expect(page.locator('#title-screen')).toBeVisible({ timeout: 90_000 });
    await page.locator('#btn-new-game').click();
    await waitForPlaying(page);

    await page.evaluate(() => window.__OUTPOST__?.enterNight());
    await page.waitForTimeout(1400);
    const nightState = await debugState(page);
    expect(nightState.enemies).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath('08-nightfall.png') });

    await page.evaluate(() => {
      window.__OUTPOST__?.giveResources({ wood: 40, metal: 30, energy: 20, food: 10 });
      window.__OUTPOST__?.openTerminal('build');
    });
    await expect(page.locator('#terminal-screen')).toBeVisible();
    await expect(page.locator('[data-testid="tab-build"]')).toHaveClass(/is-active/);
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath('09-construction.png') });

    expect(pageErrors).toEqual([]);
  });
});

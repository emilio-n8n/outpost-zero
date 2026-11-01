import { expect, test } from '@playwright/test';

test('boots into the title scene without runtime errors', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#title-screen')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('h1')).toContainText('OUTPOST');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: testInfo.outputPath('title.png') });

  await page.locator('#boot-start').click();
  await expect(page.locator('#boot-start')).toContainText('UPLINK RESERVED');

  expect(pageErrors).toEqual([]);
});

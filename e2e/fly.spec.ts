import { expect, test } from '@playwright/test';

test.describe('/fly hangar: the Kestrel', () => {
  test('opens without the site header or footer and shows the ship card', async ({ page }) => {
    await page.goto('/fly');
    await expect(page.getByTestId('ship-card')).toContainText('Kestrel', { timeout: 60_000 });
    await expect(page.getByTestId('ship-card')).toContainText('Δv 14.9 km/s');
    await expect(page.getByTestId('ship-card')).toContainText('original bubble-canopy');
    await expect(page.getByRole('contentinfo')).toHaveCount(0); // bare route: no site footer
    await expect(page.getByTestId('hangar-canvas').locator('canvas')).toBeVisible({ timeout: 30_000 });
  });

  test('controls respond and views switch', async ({ page }) => {
    await page.goto('/fly');
    await expect(page.getByTestId('hangar-canvas').locator('canvas')).toBeVisible({ timeout: 60_000 });
    const gear = page.getByRole('checkbox', { name: 'Landing gear' });
    await expect(gear).toBeChecked();
    await page.getByText('Landing gear').click();
    await expect(gear).not.toBeChecked();
    await page.getByRole('slider', { name: 'Lift thrust' }).press('End');
    await expect(page.getByRole('slider', { name: 'Lift thrust' })).toHaveAttribute('aria-valuenow', '1');
    await page.getByRole('button', { name: 'Side' }).click();
    await expect(page.getByRole('button', { name: 'Side' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('checkbox', { name: 'Turntable' })).not.toBeChecked(); // picking a fixed view stops the turntable
  });

  test('Save image downloads kestrel.png', async ({ page }) => {
    await page.goto('/fly');
    await expect(page.getByTestId('hangar-canvas').locator('canvas')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2500);
    const download = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Save image' }).click();
    expect((await download).suggestedFilename()).toBe('kestrel.png');
  });
});

test.describe('/fly arena: first and third person', () => {
  const key = async (page: import('@playwright/test').Page, k: string, ms: number) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };

  test('Take it flying opens the arena in third person with the controls and HUD', async ({ page }) => {
    await page.goto('/fly');
    await page.getByTestId('fly-button').click({ timeout: 60_000 });
    await expect(page.getByTestId('arena')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Third person' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('arena-help')).toContainText('Space / Shift');
    await expect(page.getByTestId('arena-hud')).toContainText('SPD');
    await expect(page.getByTestId('arena-canvas').locator('canvas')).toBeVisible({ timeout: 30_000 });
  });

  test('V and the buttons switch between first and third person', async ({ page }) => {
    await page.goto('/fly?mode=arena');
    await expect(page.getByTestId('arena-canvas').locator('canvas')).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press('v');
    await expect(page.getByRole('button', { name: 'First person' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('v');
    await expect(page.getByRole('button', { name: 'Third person' })).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(200, 200); // the toolbar fades while the pointer is still; reaching for it brings it back
    await page.getByRole('button', { name: 'First person' }).click();
    await expect(page.getByRole('button', { name: 'First person' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('holding Space lifts the ship off the pad and the HUD altitude rises; R resets', async ({ page }) => {
    await page.goto('/fly?mode=arena');
    await expect(page.getByTestId('arena-canvas').locator('canvas')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('hud-alt')).toHaveText('0.0');
    // Software rendering runs few frames per second and the sim clamps long frames, so hold the key until the climb shows up.
    await page.keyboard.down(' ');
    await expect.poll(async () => Number(await page.getByTestId('hud-alt').innerText()), { timeout: 40_000, intervals: [500] }).toBeGreaterThan(1);
    await page.keyboard.up(' ');
    await page.keyboard.press('r');
    await expect(page.getByTestId('hud-alt')).toHaveText('0.0', { timeout: 10_000 });
  });

  test('the interface can be hidden with I', async ({ page }) => {
    await page.goto('/fly?mode=arena');
    await expect(page.getByTestId('arena-canvas').locator('canvas')).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press('i');
    await expect(page.getByTestId('arena-hud')).toBeHidden();
    await page.keyboard.press('i');
    await expect(page.getByTestId('arena-hud')).toBeVisible();
  });
});

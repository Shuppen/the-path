import { expect, test, type Page } from '@playwright/test'

const ratioWithinTolerance = (value: number, target: number, tolerance: number): boolean =>
  Math.abs(value - target) <= tolerance

const openGameCanvas = async (page: Page) => {
  await page.goto('/?screen=game')
  await page.waitForSelector('[data-testid="game-screen"]', { timeout: 15000 })
  const canvas = page.locator('canvas[role="presentation"]')
  await expect(canvas).toHaveCount(1)
  await expect(canvas).toBeVisible()

  return canvas
}

test.describe('Game canvas aspect ratio', () => {
  test('mobile viewport keeps a 9:16 ratio', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 })
    const canvas = await openGameCanvas(page)

    const box = await canvas.boundingBox()
    if (!box) {
      throw new Error('Failed to read canvas bounds')
    }

    const expectedHeight = (box.width * 16) / 9
    expect(Math.abs(box.height - expectedHeight)).toBeLessThanOrEqual(2)

    const ratio = box.width / box.height
    expect(ratioWithinTolerance(ratio, 9 / 16, 0.02)).toBe(true)
  })

  test('larger viewport maintains the vertical ratio', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    const canvas = await openGameCanvas(page)

    const box = await canvas.boundingBox()
    if (!box) {
      throw new Error('Failed to read canvas bounds')
    }

    const expectedHeight = (box.width * 16) / 9
    expect(Math.abs(box.height - expectedHeight)).toBeLessThanOrEqual(2)

    const ratio = box.width / box.height
    expect(ratioWithinTolerance(ratio, 9 / 16, 0.02)).toBe(true)
  })
})

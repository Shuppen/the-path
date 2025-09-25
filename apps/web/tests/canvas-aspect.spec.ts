import { expect, test } from '@playwright/test'

const ratioWithinTolerance = (value: number, target: number, tolerance: number): boolean =>
  Math.abs(value - target) <= tolerance

test.describe('Hero canvas aspect ratio', () => {
  test('mobile viewport keeps a 16:9 ratio', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 })
    await page.goto('/')

    const canvas = page.getByRole('presentation')
    await expect(canvas).toBeVisible()

    const box = await canvas.boundingBox()
    if (!box) {
      throw new Error('Failed to read canvas bounds')
    }

    const expectedHeight = (box.width * 9) / 16
    expect(Math.abs(box.height - expectedHeight)).toBeLessThanOrEqual(1.5)

    const ratio = box.width / box.height
    expect(ratioWithinTolerance(ratio, 16 / 9, 0.02)).toBe(true)
  })

  test('sm breakpoint switches to an 18:9 ratio', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 })
    await page.goto('/')

    const canvas = page.getByRole('presentation')
    await expect(canvas).toBeVisible()

    const box = await canvas.boundingBox()
    if (!box) {
      throw new Error('Failed to read canvas bounds')
    }

    const expectedHeight = box.width / 2
    expect(Math.abs(box.height - expectedHeight)).toBeLessThanOrEqual(1.5)

    const ratio = box.width / box.height
    expect(ratioWithinTolerance(ratio, 18 / 9, 0.02)).toBe(true)
  })
})

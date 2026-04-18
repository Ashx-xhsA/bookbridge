import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('shows the BookBridge hero section', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Read any book')
    await expect(page.locator('h1')).toContainText('in your language')
  })

  test('has a sign-in link', async ({ page }) => {
    await page.goto('/')
    const signIn = page.locator('a[href="/sign-in"]')
    await expect(signIn).toBeVisible()
  })

  test('has a sign-up link', async ({ page }) => {
    await page.goto('/')
    // Two sign-up links exist: "Get Started" (header) and "Start Translating" (hero)
    const signUpLinks = page.locator('a[href="/sign-up"]')
    await expect(signUpLinks).toHaveCount(2)
  })

  test('has three feature cards', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h3', { hasText: 'Upload' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Translate' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Read' })).toBeVisible()
  })

  test('demo reader page loads', async ({ page }) => {
    await page.goto('/read/demo')
    await expect(page.locator('h1')).toContainText('The Little Prince')
  })
})

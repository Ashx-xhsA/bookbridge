import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('shows the BookBridge hero section', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Translate books with')
    await expect(page.locator('h1 span')).toContainText('AI precision')
  })

  test('has a sign-in link', async ({ page }) => {
    await page.goto('/')
    const signIn = page.locator('a[href="/sign-in"]')
    await expect(signIn).toBeVisible()
  })

  test('has a sign-up link', async ({ page }) => {
    await page.goto('/')
    const signUp = page.locator('a[href="/sign-up"]')
    await expect(signUp).toBeVisible()
  })

  test('has three feature cards', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Multi-Language')).toBeVisible()
    await expect(page.locator('text=Glossary Consistency')).toBeVisible()
    await expect(page.locator('text=Chapter-by-Chapter')).toBeVisible()
  })

  test('demo reader page loads', async ({ page }) => {
    await page.goto('/read/demo')
    await expect(page.locator('h1')).toContainText('Demo: Bilingual Reader')
  })
})

import { test, expect } from '@playwright/test'

test.describe('Landing Page (About)', () => {
  test('explains what BookBridge does', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('BookBridge')
    await expect(page.getByRole('heading', { name: 'What it does differently' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Some ways to use it' })).toBeVisible()
  })

  test('has sign-in and sign-up links', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('a[href="/sign-in"]').first()).toBeVisible()
    await expect(page.locator('a[href="/sign-up"]').first()).toBeVisible()
  })

  test('the About page is public', async ({ page }) => {
    await page.goto('/about')
    await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible()
  })
})

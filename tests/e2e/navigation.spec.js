import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('homepage loads correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Enterprise React/)
    await expect(page.locator('h1')).toContainText('Enterprise React')
  })

  test('navigation to About page works', async ({ page }) => {
    await page.click('text=About')
    await expect(page).toHaveURL(/.*about/)
    await expect(page.locator('h1')).toContainText('About')
  })

  test('navigation to Contact page works', async ({ page }) => {
    await page.click('text=Contact')
    await expect(page).toHaveURL(/.*contact/)
    await expect(page.locator('h1')).toContainText('Contact')
  })

  test('404 page works for unknown routes', async ({ page }) => {
    await page.goto('/nonexistent')
    await expect(page.locator('h1')).toContainText('404')
    await expect(page.locator('text=Go Home')).toBeVisible()
  })

  test('mobile menu toggle works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    const menuButton = page.locator('button[aria-label="Toggle menu"]')
    await expect(menuButton).toBeVisible()
    await menuButton.click()
    await expect(page.locator('text=Home')).toBeVisible()
  })

  test('contact form submission', async ({ page }) => {
    await page.click('text=Contact')
    await page.fill('input#name', 'Test User')
    await page.fill('input#email', 'test@example.com')
    await page.fill('textarea#message', 'This is a test message')
    await page.click('button[type="submit"]')
    await expect(page.locator('text=Message Sent!')).toBeVisible()
  })
})

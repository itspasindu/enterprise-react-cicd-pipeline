import { test, expect } from '@playwright/test'

/**
 * Desktop nav links stay in the DOM (CSS-hidden on small viewports) while the
 * mobile menu duplicates the same labels. Prefer role + visible filters so
 * Mobile Safari does not hit strict-mode or hidden-element click timeouts.
 */
async function clickNavLink(page, label) {
  const menuButton = page.getByRole('button', { name: 'Toggle menu' })
  
  // If the mobile menu toggle is visible, we're on a small viewport and need to open the menu first
  if (await menuButton.isVisible()) {
    await menuButton.click()
  }

  const nav = page.getByRole('navigation')
  const link = nav.getByRole('link', { name: label }).filter({ visible: true })
  await link.click()
}

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('homepage loads correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Enterprise React/)
    await expect(page.locator('h1')).toContainText('Enterprise React')
  })

  test('navigation to About page works', async ({ page }) => {
    await clickNavLink(page, 'About')
    await expect(page).toHaveURL(/.*about/)
    await expect(page.locator('h1')).toContainText('About')
  })

  test('navigation to Contact page works', async ({ page }) => {
    await clickNavLink(page, 'Contact')
    await expect(page).toHaveURL(/.*contact/)
    await expect(page.locator('h1')).toContainText('Contact')
  })

  test('404 page works for unknown routes', async ({ page }) => {
    await page.goto('/nonexistent')
    await expect(page.locator('h1')).toContainText('404')
    await expect(page.getByRole('link', { name: 'Go Home' })).toBeVisible()
  })

  test('mobile menu toggle works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    const menuButton = page.getByRole('button', { name: 'Toggle menu' })
    await expect(menuButton).toBeVisible()
    await menuButton.click()
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Home' }).filter({ visible: true })
    ).toBeVisible()
  })

  test('contact form submission', async ({ page }) => {
    await clickNavLink(page, 'Contact')
    await page.fill('input#name', 'Test User')
    await page.fill('input#email', 'test@example.com')
    await page.fill('textarea#message', 'This is a test message')
    await page.click('button[type="submit"]')
    await expect(page.getByText('Message Sent!')).toBeVisible()
  })
})

import { test, expect } from '@playwright/test'
import {
  clickNavLink,
  expectPageMarker,
  NAV_LINKS,
  TEST_IDS,
  ROUTES,
  CONTACT_FORM,
  NOT_FOUND_PATH,
  APP_NAME,
} from './helpers/navigation.js'

/**
 * Behavior-focused E2E: asserts routes, navigation, and forms via shared
 * app-contract.js — not marketing copy. Runs on all browser projects in CI.
 */
test.describe('Application smoke @cross-browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTES.home)
  })

  test('home route loads', async ({ page }) => {
    await expect(page).toHaveTitle(new RegExp(APP_NAME))
    await expectPageMarker(page, TEST_IDS.homePage)
  })

  for (const { path, label } of NAV_LINKS.filter(link => link.path !== ROUTES.home)) {
    test(`navigates to ${label} (${path})`, async ({ page }) => {
      await clickNavLink(page, label)
      await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')))
      if (path === ROUTES.about) {
        await expectPageMarker(page, TEST_IDS.aboutPage)
      }
      if (path === ROUTES.contact) {
        await expectPageMarker(page, TEST_IDS.contactPage)
      }
    })
  }

  test('404 route shows recovery link', async ({ page }) => {
    await page.goto(NOT_FOUND_PATH)
    await expectPageMarker(page, TEST_IDS.notFoundPage)
    await expect(page.getByTestId(TEST_IDS.goHomeLink)).toBeVisible()
  })

  test('mobile menu exposes navigation links', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    const menuButton = page.getByTestId(TEST_IDS.mobileMenuToggle)
    await expect(menuButton).toBeVisible()
    await menuButton.click()
    await expect(
      page.getByTestId(TEST_IDS.mainNav).getByRole('link', { name: 'Home' }).filter({ visible: true })
    ).toBeVisible()
  })

  test('contact form submits successfully', async ({ page }) => {
    await clickNavLink(page, 'Contact')
    await expectPageMarker(page, TEST_IDS.contactPage)

    await page.getByLabel(CONTACT_FORM.labels.name).fill('Test User')
    await page.getByLabel(CONTACT_FORM.labels.email).fill('test@example.com')
    await page.getByLabel(CONTACT_FORM.labels.message).fill('E2E test message')
    await page.getByRole('button', { name: CONTACT_FORM.submit }).click()

    await expect(page.getByTestId(TEST_IDS.contactSuccess)).toBeVisible()
    await expect(page.getByText(CONTACT_FORM.successHeading)).toBeVisible()
  })
})

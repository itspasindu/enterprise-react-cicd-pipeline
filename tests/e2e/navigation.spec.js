import { test, expect } from '@playwright/test'
import {
  clickNavLink,
  expectPageMarker,
  NAV_LINKS,
  TEST_IDS,
  ROUTES,
  CONTACT_FORM,
  NOT_FOUND_PATH,
} from './helpers/navigation.js'

/**
 * Smoke E2E — tests behavior + stable data-testid markers, NOT page copy.
 * Change headlines/paragraphs freely without editing this file.
 * Only update src/config/app-contract.js when routes, nav labels, or form fields change.
 */
test.describe('Application smoke @cross-browser', () => {
  test.beforeEach(async ({ page }) => {
    if (!process.env.E2E_USE_REAL_API) {
      await page.route('**/api/contacts', route =>
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, message: 'Contact request received' }),
        })
      )
      await page.route('**/api/pipelines/status', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            configured: false,
            live: false,
            owner: null,
            repo: null,
            stagingUrl: 'http://localhost:4173',
            hint: 'Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO on the API to enable live pipeline data.',
          }),
        })
      )
      await page.route('**/api/pipelines/**', route =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Pipeline monitor is not configured',
            hint: 'Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO on the API to enable live pipeline data.',
          }),
        })
      )
    }
    await page.goto(ROUTES.home)
  })

  test('home route loads', async ({ page }) => {
    // Marker only — do not assert title/hero text (those change often)
    await expectPageMarker(page, TEST_IDS.homePage)
  })

  for (const { path, label } of NAV_LINKS.filter(link => link.path !== ROUTES.home)) {
    test(`navigates to ${label} (${path})`, async ({ page }) => {
      await clickNavLink(page, label)
      await expect(page).toHaveURL(path)
      if (path === ROUTES.about) {
        await expectPageMarker(page, TEST_IDS.aboutPage)
      }
      if (path === ROUTES.contact) {
        await expectPageMarker(page, TEST_IDS.contactPage)
      }
      if (path === ROUTES.pipeline) {
        await expectPageMarker(page, TEST_IDS.pipelinePage)
        await expect(page.getByTestId(TEST_IDS.pipelineSubnav)).toBeVisible()
        await expect(page.getByTestId(TEST_IDS.pipelineSetupBanner)).toBeVisible()
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
    const homeLabel = NAV_LINKS.find(link => link.path === ROUTES.home)?.label ?? 'Home'
    await expect(
      page.getByTestId(TEST_IDS.mainNav).getByRole('link', { name: homeLabel }).filter({ visible: true })
    ).toBeVisible()
  })

  test('contact form submits successfully', async ({ page }) => {
    await clickNavLink(page, 'Contact')
    await expectPageMarker(page, TEST_IDS.contactPage)

    await page.getByLabel(CONTACT_FORM.labels.name).fill('Test User')
    await page.getByLabel(CONTACT_FORM.labels.email).fill('test@example.com')
    await page.getByLabel(CONTACT_FORM.labels.message).fill('E2E test message')
    await page.getByRole('button', { name: CONTACT_FORM.submit }).click()

    // Success state via test id — not the success message text
    await expect(page.getByTestId(TEST_IDS.contactSuccess)).toBeVisible()
  })
})
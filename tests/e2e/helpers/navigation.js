import { TEST_IDS } from '../../../src/config/app-contract.js'

/**
 * Cross-viewport nav helper: opens mobile menu when the toggle is visible,
 * then clicks the visible link inside <nav> (avoids strict-mode duplicates).
 */
export async function clickNavLink(page, label) {
  const menuButton = page.getByTestId(TEST_IDS.mobileMenuToggle)

  if (await menuButton.isVisible()) {
    await menuButton.click()
  }

  const nav = page.getByTestId(TEST_IDS.mainNav)
  await nav.getByRole('link', { name: label }).filter({ visible: true }).click()
}

export async function expectPageMarker(page, testId) {
  await page.getByTestId(testId).waitFor({ state: 'visible' })
}

export {
  NAV_LINKS,
  ARIA,
  TEST_IDS,
  ROUTES,
  CONTACT_FORM,
  PAGE_TITLES,
  NOT_FOUND_PATH,
} from '../../../src/config/app-contract.js'

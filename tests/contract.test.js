import { describe, it, expect } from 'vitest'
import { NAV_LINKS, ROUTES, TEST_IDS, CONTACT_FORM, PAGE_TITLES, APP_NAME } from '../src/config/app-contract'

describe('app-contract', () => {
  it('defines unique nav paths and labels', () => {
    const paths = NAV_LINKS.map(link => link.path)
    const labels = NAV_LINKS.map(link => link.label)
    expect(new Set(paths).size).toBe(paths.length)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('includes standard routes in navigation', () => {
    expect(NAV_LINKS.map(link => link.path)).toEqual(
      expect.arrayContaining([ROUTES.home, ROUTES.about, ROUTES.contact])
    )
  })

  it('uses unique test ids', () => {
    const ids = Object.values(TEST_IDS)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('defines page titles for E2E title checks', () => {
    expect(PAGE_TITLES.home).toContain(APP_NAME)
    expect(PAGE_TITLES.about).toContain(APP_NAME)
    expect(PAGE_TITLES.contact).toContain(APP_NAME)
    expect(PAGE_TITLES.notFound).toBeTruthy()
  })

  it('defines contact form labels used by getByLabel in E2E', () => {
    expect(CONTACT_FORM.labels.name).toBeTruthy()
    expect(CONTACT_FORM.labels.email).toBeTruthy()
    expect(CONTACT_FORM.labels.message).toBeTruthy()
    expect(CONTACT_FORM.submit).toBeTruthy()
    expect(CONTACT_FORM.successHeading).toBeTruthy()
  })
})

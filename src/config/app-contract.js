/**
 * Single source of truth for routes, navigation, and E2E selectors.
 * Update this file when changing URLs, nav labels, or form fields —
 * React components and Playwright tests both import from here.
 */

export const APP_NAME = 'Enterprise React App'

export const ROUTES = {
  home: '/',
  about: '/about',
  contact: '/contact',
}

export const NAV_LINKS = [
  { path: ROUTES.home, label: 'Home' },
  { path: ROUTES.about, label: 'About' },
  { path: ROUTES.contact, label: 'Contact' },
]

/** Stable selectors — survive copy and styling changes */
export const TEST_IDS = {
  mainNav: 'main-nav',
  mobileMenuToggle: 'mobile-menu-toggle',
  homePage: 'home-page',
  aboutPage: 'about-page',
  contactPage: 'contact-page',
  notFoundPage: 'not-found-page',
  goHomeLink: 'go-home-link',
  contactForm: 'contact-form',
  contactSuccess: 'contact-success',
}

export const ARIA = {
  toggleMenu: 'Toggle menu',
  goHome: 'Go Home',
}

export const CONTACT_FORM = {
  labels: {
    name: 'Name',
    email: 'Email',
    message: 'Message',
  },
  submit: 'Send Message',
  successHeading: 'Message Sent!',
}

/** Unknown route used only in E2E 404 checks */
export const NOT_FOUND_PATH = '/__e2e-not-found__'

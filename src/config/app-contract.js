/**
 * Single source of truth for routes, navigation, and E2E selectors.
 * Update this file when changing URLs, nav labels, or form fields —
 * React components and Playwright tests both import from here.
 */

export const APP_NAME = 'Delivery Status'

/** Document titles — keep in sync with page <Helmet> titles */
export const PAGE_TITLES = {
  home: `Home | ${APP_NAME}`,
  about: `About | ${APP_NAME}`,
  contact: `Contact | ${APP_NAME}`,
  pipeline: `Status | ${APP_NAME}`,
  pipelineRuns: `History | ${APP_NAME}`,
  pipelineRunDetail: `Run details | ${APP_NAME}`,
  pipelineArtifacts: `Reports | ${APP_NAME}`,
  pipelineFailures: `Problems | ${APP_NAME}`,
  pipelineStaging: `Live website | ${APP_NAME}`,
  notFound: '404 | Page Not Found',
}

export const ROUTES = {
  home: '/',
  about: '/about',
  contact: '/contact',
  pipeline: '/pipeline',
  pipelineRuns: '/pipeline/runs',
  pipelineRunDetail: '/pipeline/runs/:runId',
  pipelineArtifacts: '/pipeline/artifacts',
  pipelineFailures: '/pipeline/failures',
  pipelineStaging: '/pipeline/staging',
}

export const NAV_LINKS = [
  { path: ROUTES.home, label: 'Home' },
  { path: ROUTES.about, label: 'About' },
  { path: ROUTES.pipeline, label: 'Status' },
  { path: ROUTES.contact, label: 'Contact' },
]

export const PIPELINE_NAV = [
  { path: ROUTES.pipeline, label: 'At a glance', end: true },
  { path: ROUTES.pipelineRuns, label: 'History' },
  { path: ROUTES.pipelineArtifacts, label: 'Reports' },
  { path: ROUTES.pipelineFailures, label: 'Problems' },
  { path: ROUTES.pipelineStaging, label: 'Live website' },
]

/** Stable selectors — survive copy and styling changes */
export const TEST_IDS = {
  mainNav: 'main-nav',
  mobileMenuToggle: 'mobile-menu-toggle',
  homePage: 'home-page',
  aboutPage: 'about-page',
  contactPage: 'contact-page',
  pipelinePage: 'pipeline-page',
  pipelineRunsPage: 'pipeline-runs-page',
  pipelineRunDetailPage: 'pipeline-run-detail-page',
  pipelineArtifactsPage: 'pipeline-artifacts-page',
  pipelineFailuresPage: 'pipeline-failures-page',
  pipelineStagingPage: 'pipeline-staging-page',
  pipelineSetupBanner: 'pipeline-setup-banner',
  pipelineSubnav: 'pipeline-subnav',
  notFoundPage: 'not-found-page',
  goHomeLink: 'go-home-link',
  contactForm: 'contact-form',
  contactSuccess: 'contact-success',
  contactError: 'contact-error',
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

export function pipelineRunPath(runId) {
  return `/pipeline/runs/${runId}`
}

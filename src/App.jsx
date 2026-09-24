import { Routes, Route } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Helmet } from 'react-helmet-async'
import Navbar from '@components/Navbar'
import LoadingSpinner from '@components/LoadingSpinner'
import ErrorBoundary from '@components/ErrorBoundary'
import PipelineLayout from '@components/pipeline/PipelineLayout'
import { APP_NAME } from './config/app-contract'

const Home = lazy(() => import('@pages/Home'))
const About = lazy(() => import('@pages/About'))
const Contact = lazy(() => import('@pages/Contact'))
const NotFound = lazy(() => import('@pages/NotFound'))
const PipelineOverview = lazy(() => import('@pages/pipeline/PipelineOverview'))
const PipelineRuns = lazy(() => import('@pages/pipeline/PipelineRuns'))
const PipelineRunDetail = lazy(() => import('@pages/pipeline/PipelineRunDetail'))
const PipelineArtifacts = lazy(() => import('@pages/pipeline/PipelineArtifacts'))
const PipelineFailures = lazy(() => import('@pages/pipeline/PipelineFailures'))
const PipelineStaging = lazy(() => import('@pages/pipeline/PipelineStaging'))

function App() {
  return (
    <ErrorBoundary>
      <Helmet>
        <title>{APP_NAME}</title>
        <meta
          name="description"
          content="See whether software builds and releases are healthy — in plain language."
        />
      </Helmet>
      <div className="min-h-screen flex flex-col text-slate-800">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg"
        >
          Skip to content
        </a>
        <Navbar />
        <main
          id="main-content"
          className="container mx-auto px-4 py-8 md:py-10 flex-1 animate-fade"
        >
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/pipeline" element={<PipelineLayout />}>
                <Route index element={<PipelineOverview />} />
                <Route path="runs" element={<PipelineRuns />} />
                <Route path="runs/:runId" element={<PipelineRunDetail />} />
                <Route path="artifacts" element={<PipelineArtifacts />} />
                <Route path="failures" element={<PipelineFailures />} />
                <Route path="staging" element={<PipelineStaging />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="border-t border-slate-200/80 bg-white/70 backdrop-blur-sm py-8 mt-4">
          <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-slate-500">
            <p>
              &copy; {new Date().getFullYear()} {APP_NAME}
            </p>
            <p className="text-center md:text-right">
              Built to make delivery status easy to understand.
            </p>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  )
}

export default App

import { Routes, Route } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Helmet } from 'react-helmet-async'
import Navbar from '@components/Navbar'
import LoadingSpinner from '@components/LoadingSpinner'
import ErrorBoundary from '@components/ErrorBoundary'

const Home = lazy(() => import('@pages/Home'))
const About = lazy(() => import('@pages/About'))
const Contact = lazy(() => import('@pages/Contact'))
const NotFound = lazy(() => import('@pages/NotFound'))

function App() {
  return (
    <ErrorBoundary>
      <Helmet>
        <title>Enterprise React App</title>
        <meta name="description" content="Enterprise-grade React application" />
      </Helmet>
      <div className="min-h-screen bg-slate-900 text-white">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="border-t border-slate-700 py-6 mt-auto">
          <div className="container mx-auto px-4 text-center text-slate-400">
            <p>&copy; {new Date().getFullYear()} Enterprise React App. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  )
}

export default App

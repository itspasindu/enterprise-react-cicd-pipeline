import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="card max-w-md text-center">
            <h2 className="text-2xl font-bold text-rose-700 mb-3">Something went wrong</h2>
            <p className="text-slate-600 mb-6">
              Please refresh the page. If the problem continues, contact the team.
            </p>
            <button type="button" onClick={() => window.location.reload()} className="btn-primary">
              Refresh page
            </button>
            {import.meta.env.DEV && (
              <pre className="mt-4 p-4 bg-slate-100 rounded-xl text-left text-sm text-rose-700 overflow-auto">
                {this.state.error?.toString()}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

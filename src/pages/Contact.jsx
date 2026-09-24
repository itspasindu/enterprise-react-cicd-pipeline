import { Helmet } from 'react-helmet-async'
import { useState } from 'react'
import { CONTACT_FORM, TEST_IDS, PAGE_TITLES } from '../config/app-contract'
import api from '../utils/api'

function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await api.post('/contacts', formData)
      setSubmitted(true)
      setFormData({ name: '', email: '', message: '' })
    } catch {
      setError('Unable to send your message. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Helmet>
        <title>{PAGE_TITLES.contact}</title>
        <meta name="description" content="Send a message to the team" />
      </Helmet>

      <div className="max-w-xl mx-auto animate-rise" data-testid={TEST_IDS.contactPage}>
        <div className="text-center mb-8">
          <p className="section-label mb-2">Get in touch</p>
          <h1 className="page-title">Contact the team</h1>
          <p className="page-subtitle mt-3">Send a short message and we will get back to you.</p>
        </div>

        <div className="card shadow-lift">
          {submitted ? (
            <div className="text-center py-10" data-testid={TEST_IDS.contactSuccess}>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl text-emerald-700 shadow-sm">
                ✓
              </div>
              <h3 className="text-xl font-bold text-emerald-700">{CONTACT_FORM.successHeading}</h3>
              <p className="text-slate-600 mt-2">We will get back to you soon.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" data-testid={TEST_IDS.contactForm}>
              {error && (
                <p
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
                  role="alert"
                  data-testid={TEST_IDS.contactError}
                >
                  {error}
                </p>
              )}
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-slate-700 mb-2">
                  {CONTACT_FORM.labels.name}
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="input-field"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                  {CONTACT_FORM.labels.email}
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="input-field"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label
                  htmlFor="message"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  {CONTACT_FORM.labels.message}
                </label>
                <textarea
                  id="message"
                  required
                  rows={5}
                  value={formData.message}
                  onChange={e => setFormData({ ...formData, message: e.target.value })}
                  className="input-field resize-none"
                  placeholder="How can we help?"
                />
              </div>

              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? 'Sending…' : CONTACT_FORM.submit}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}

export default Contact

import { Helmet } from 'react-helmet-async'
import { useState } from 'react'
import { CONTACT_FORM, TEST_IDS } from '../config/app-contract'

function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = e => {
    e.preventDefault()
    // In production, send to API
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3000)
    setFormData({ name: '', email: '', message: '' })
  }

  return (
    <>
      <Helmet>
        <title>Contact | Enterprise React App</title>
        <meta name="description" content="Get in touch with our team" />
      </Helmet>

      <div className="max-w-xl mx-auto" data-testid={TEST_IDS.contactPage}>
        <h1 className="text-4xl font-bold text-gradient mb-8 text-center">Contact Us</h1>

        <div className="card">
          {submitted ? (
            <div className="text-center py-8" data-testid={TEST_IDS.contactSuccess}>
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-xl font-semibold text-green-400">
                {CONTACT_FORM.successHeading}
              </h3>
              <p className="text-slate-400 mt-2">We'll get back to you soon.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6" data-testid={TEST_IDS.contactForm}>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                  {CONTACT_FORM.labels.name}
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-white"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  {CONTACT_FORM.labels.email}
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-white"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">
                  {CONTACT_FORM.labels.message}
                </label>
                <textarea
                  id="message"
                  required
                  rows={5}
                  value={formData.message}
                  onChange={e => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-white resize-none"
                  placeholder="Your message..."
                />
              </div>

              <button type="submit" className="btn-primary w-full">
                {CONTACT_FORM.submit}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}

export default Contact

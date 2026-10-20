import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthShell } from './AuthShell'
import { authService } from '../lib/services/authService'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)

    try {
      await authService.forgotPassword(email)
      window.setTimeout(() => {
        setSubmitting(false)
        setSubmitted(true)
      }, 300)
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : 'Failed to send reset email. Please try again.')
    }
  }

  if (submitted) {
    return (
      <AuthShell plateLabel="PLAZA OS · CHECK YOUR EMAIL">
        <div className="py-2 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#16161F]">Check your email</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#6B6B7D]">
            If an account exists for that address, we've sent a link to reset the password. It expires in 30 minutes.
          </p>

          <Link to="/login" className="mt-6 inline-block text-[13px] font-medium text-primary hover:underline">
            ← Back to sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell plateLabel="PLAZA OS · RESET PASSWORD">
      <h1 className="font-display text-2xl font-bold tracking-tight text-[#16161F]">Reset your password</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#6B6B7D]">Enter your email and we'll send you a link to reset it.</p>

      {error && (
        <p className="mt-4 rounded-lg border border-[#F0D4D4] bg-[#FDF5F5] px-4 py-3 text-sm text-[#9B2C2C]" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
        <div>
          <label htmlFor="email" className="mb-2 block font-mono text-[11px] uppercase tracking-[0.14em] text-[#6B6B7D]">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-[#E6E6EF] bg-white px-4 py-3 text-[15px] text-[#16161F] outline-none transition-colors placeholder:text-[#A8A8B8] focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-primary px-4 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-primary-light focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 border-t border-[#E6E6EF] pt-5 text-center text-[13px] leading-relaxed text-[#6B6B7D]">
        <Link to="/login" className="font-medium text-primary hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </AuthShell>
  )
}

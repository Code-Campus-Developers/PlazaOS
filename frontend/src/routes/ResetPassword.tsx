import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthShell } from './AuthShell'
import { authService } from '../lib/services/authService'

export function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  // Empty token means invalid/expired/missing
  const hasValidToken = !!token

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)

    try {
      await authService.resetPassword(token, newPassword)
      window.setTimeout(() => {
        setIsSubmitting(false)
        setDone(true)
      }, 300)
    } catch (err) {
      setIsSubmitting(false)
      setError(err instanceof Error ? err.message : 'Failed to reset password. Please try again.')
    }
  }

  if (done) {
    return (
      <AuthShell plateLabel="PLAZA OS · PASSWORD SET" plateVariant="success">
        <div className="py-2 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#16161F]">Password updated</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#6B6B7D]">Sign in with your new password.</p>
          <Link
            to="/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-primary-light"
          >
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  if (!hasValidToken) {
    return (
      <AuthShell plateLabel="PLAZA OS · LINK EXPIRED">
        <div className="py-2 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#16161F]">This link isn't valid</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#6B6B7D]">It may have expired or already been used.</p>
          <Link to="/forgot-password" className="mt-6 inline-block text-[13px] font-medium text-primary hover:underline">
            Request a new link
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell plateLabel="PLAZA OS · NEW PASSWORD">
      <h1 className="font-display text-2xl font-bold tracking-tight text-[#16161F]">Choose a new password</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#6B6B7D]">Minimum 8 characters.</p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
        <div>
          <label htmlFor="new-password" className="mb-2 block font-mono text-[11px] uppercase tracking-[0.14em] text-[#6B6B7D]">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'reset-error' : undefined}
            className="w-full rounded-lg border border-[#E6E6EF] bg-white px-4 py-3 text-[15px] text-[#16161F] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label htmlFor="confirm-password" className="mb-2 block font-mono text-[11px] uppercase tracking-[0.14em] text-[#6B6B7D]">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'reset-error' : undefined}
            className="w-full rounded-lg border border-[#E6E6EF] bg-white px-4 py-3 text-[15px] text-[#16161F] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {error && (
          <p id="reset-error" role="alert" className="rounded-lg border border-[#F0D4D4] bg-[#FDF5F5] px-4 py-3 text-sm text-[#9B2C2C]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-primary px-4 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-primary-light focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </AuthShell>
  )
}

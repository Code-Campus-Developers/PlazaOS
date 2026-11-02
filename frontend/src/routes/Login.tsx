import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { Spinner } from '../components/Spinner'

type Role = 'admin' | 'tenant'

interface SignedInUser {
  name: string
  role: Role
  unit?: string // tenants have one; admins don't
  mustChangePassword?: boolean
}

interface LoginFormProps {
  /** Plug our existing auth call in here. Should throw on failure. */
  onSignIn: (email: string, password: string) => Promise<SignedInUser>
  /** Called after the welcome beat — navigate to the dashboard here. */
  onComplete: (user: SignedInUser) => void
}

const WELCOME_MS = 2200

function LoginForm({ onSignIn, onComplete }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<SignedInUser | null>(null)
  const welcomeTimeoutRef = useRef<number | null>(null)

  // Hold the welcome state briefly, then hand off.
  useEffect(() => {
    if (!user) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    welcomeTimeoutRef.current = window.setTimeout(() => onComplete(user), reduced ? 0 : WELCOME_MS)
    return () => {
      if (welcomeTimeoutRef.current !== null) window.clearTimeout(welcomeTimeoutRef.current)
    }
  }, [user, onComplete])

  // Lets an impatient user skip the rest of the welcome beat instead of waiting it out.
  function handleSkipWelcome() {
    if (!user) return
    if (welcomeTimeoutRef.current !== null) window.clearTimeout(welcomeTimeoutRef.current)
    onComplete(user)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const signedIn = await onSignIn(email.trim(), password)
      setUser(signedIn)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (/no internet|taking too long|unable to reach/i.test(msg)) {
        setError(msg)
      } else {
        setError('Incorrect email or password.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const plate = user
    ? user.role === 'tenant'
      ? user.unit
        ? `UNIT ${user.unit} · TENANT`
        : 'TENANT · PLAZA OS'
      : 'ADMIN · PLAZA OS'
    : 'PLAZA OS · SIGN IN'

  return (
    <AuthShell plateLabel={plate} plateVariant={user ? 'success' : 'default'}>
      {user ? (
        /* ---------- Welcome state ---------- */
        <div className="cursor-pointer py-6 text-center" onClick={handleSkipWelcome}>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6B6B7D]">Welcome back</p>
          <p className="mt-3 font-display text-3xl font-bold tracking-tight text-[#16161F]">{user.name}</p>
          <p className="mt-4 text-sm text-[#6B6B7D]">Taking you to your dashboard…</p>
        </div>
      ) : (
        /* ---------- Sign-in state ---------- */
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#16161F]">Sign in</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6B6B7D]">First time? Use the password from your welcome email.</p>

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
                aria-invalid={!!error}
                aria-describedby={error ? 'signin-error' : undefined}
                className="w-full rounded-lg border border-[#E6E6EF] bg-white px-4 py-3 text-[15px] text-[#16161F] outline-none transition-colors placeholder:text-[#A8A8B8] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <label htmlFor="password" className="block font-mono text-[11px] uppercase tracking-[0.14em] text-[#6B6B7D]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="font-mono text-[11px] uppercase tracking-[0.14em] text-primary hover:underline"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? 'signin-error' : undefined}
                className="w-full rounded-lg border border-[#E6E6EF] bg-white px-4 py-3 text-[15px] text-[#16161F] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {error && (
              <p id="signin-error" role="alert" className="rounded-lg border border-[#F0D4D4] bg-[#FDF5F5] px-4 py-3 text-sm text-[#9B2C2C]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-primary px-4 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-primary-light focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
               {submitting ? <Spinner label="Signing in…" size={14} /> : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 border-t border-[#E6E6EF] pt-5 text-[13px] leading-relaxed text-[#6B6B7D]">
            Forgotten your password?{' '}
            <Link to="/forgot-password" className="font-medium text-primary hover:underline">
              Reset it
            </Link>
            .
          </p>
        </>
      )}
    </AuthShell>
  )
}

/**
 * Wires the presentational form above to our real auth call and post-login
 * routing — the form itself never touches AuthContext or the router.
 */
export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSignIn = useCallback(
    async (email: string, password: string): Promise<SignedInUser> => {
      const user = await login(email, password)
      return { name: user.name, role: user.role, mustChangePassword: user.mustChangePassword }
    },
    [login],
  )

  const handleComplete = useCallback(
    (user: SignedInUser) => {
      if (user.role === 'tenant' && user.mustChangePassword) {
        navigate('/tenant/account-setup', { replace: true })
        return
      }
      navigate(user.role === 'admin' ? '/admin/dashboard' : '/tenant', { replace: true })
    },
    [navigate],
  )

  return <LoginForm onSignIn={handleSignIn} onComplete={handleComplete} />
}

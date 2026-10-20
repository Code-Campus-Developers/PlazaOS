import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Input, Text } from '../../components'
import { useAuth } from '../../context/useAuth'
import { ApiError } from '../../lib/api'
import { authService, type InvitationStatus } from '../../lib/services/authService'

type FormValues = {
  newPassword: string
  confirmPassword: string
}

const MIN_PASSWORD_LENGTH = 8

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'Unable to secure your account. Please try again.'
}

const INVITATION_REASON_MESSAGES: Record<InvitationStatus['reason'], string> = {
  invalid: 'This invitation link is not valid. Please ask your administrator to send a new one.',
  expired: 'This invitation link has expired. Please ask your administrator to send a new one.',
  used: 'This invitation link has already been used. Please sign in with your password.',
  ready: '',
}

/**
 * Account setup.
 *
 * Two modes, both ending in the same place:
 *
 * 1. **Invitation (public).** The tenant arrives from the emailed setup link
 *    (`?token=…`) and chooses their own password. This route is deliberately
 *    reachable without being signed in.
 * 2. **Signed-in (legacy).** A tenant already holding a system-issued
 *    password is still on `mustChangePassword`, and sets a new one here.
 */
export function AccountSetup() {
  const { user, completePasswordSetup } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<unknown>(null)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Invitation state: 'checking' until the server has confirmed the link.
  const [invitation, setInvitation] = useState<InvitationStatus | null>(null)
  const [isCheckingInvitation, setIsCheckingInvitation] = useState(Boolean(token))

  const { register, handleSubmit, watch, formState } = useForm<FormValues>({
    defaultValues: { newPassword: '', confirmPassword: '' },
  })
  const newPassword = watch('newPassword')

  // Validate the invitation against the server so the page never tells a
  // tenant their link is fine when it is not. The authoritative check still
  // happens again when the password is submitted.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    setIsCheckingInvitation(true)
    authService
      .getInvitationStatus(token)
      .then((status) => {
        if (!cancelled) setInvitation(status)
      })
      .catch((error) => {
        if (!cancelled) {
          setInvitation({ valid: false, reason: 'invalid' })
          setSubmitError(error)
        }
      })
      .finally(() => {
        if (!cancelled) setIsCheckingInvitation(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  // Signed-in mode: a tenant who no longer needs to change their password
  // has nothing to do here.
  useEffect(() => {
    if (token) return
    if (!user?.mustChangePassword) {
      navigate('/tenant', { replace: true })
    }
  }, [navigate, token, user?.mustChangePassword])

  async function onSubmit(values: FormValues) {
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      if (token) {
        // Invitation mode — the tenant sets their own password for the first
        // time, then signs in normally.
        await authService.acceptInvitation(token, values.newPassword)
        navigate('/login', { replace: true, state: { accountSetup: 'success' } })
        return
      }

      await authService.setPassword(values.newPassword)
      completePasswordSetup()
      navigate('/tenant', { replace: true })
    } catch (error) {
      setSubmitError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isCheckingInvitation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-200/40 px-4 py-8">
        <Card className="w-full max-w-md">
          <Text variant="h1">Checking your invitation</Text>
          <Text variant="body" className="mt-2 text-slate-500">
            One moment…
          </Text>
        </Card>
      </div>
    )
  }

  if (token && invitation && !invitation.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-200/40 px-4 py-8">
        <Card className="w-full max-w-md">
          <Text variant="h1">This link can’t be used</Text>
          <Text variant="body" className="mt-2 text-slate-500">
            {INVITATION_REASON_MESSAGES[invitation.reason]}
          </Text>
          <Button type="button" variant="secondary" className="mt-6 w-full" onClick={() => navigate('/login', { replace: true })}>
            Go to sign in
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-200/40 px-4 py-8">
      <Card className="w-full max-w-md">
        <Text variant="h1">Secure your account</Text>
        <Text variant="body" className="mt-2 text-slate-500">
          {token
            ? 'Welcome to PlazaOS. Choose your own password to finish setting up your account.'
            : 'Your account was created by an administrator. For your privacy and security, please create your own password before continuing.'}
        </Text>
        {token && invitation?.email ? (
          <Text variant="bodySmall" className="mt-2 text-slate-500">
            Setting up {invitation.email}
          </Text>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
          <Input
            label="New password"
            type={showNewPassword ? 'text' : 'password'}
            autoComplete="new-password"
            disabled={isSubmitting}
            error={formState.errors.newPassword?.message}
            action={
              <button
                type="button"
                onClick={() => setShowNewPassword((value) => !value)}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                {showNewPassword ? 'Hide' : 'Show'}
              </button>
            }
            {...register('newPassword', {
              required: 'A new password is required.',
              minLength: { value: MIN_PASSWORD_LENGTH, message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` },
            })}
          />
          <Input
            label="Confirm new password"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            disabled={isSubmitting}
            error={formState.errors.confirmPassword?.message}
            action={
              <button
                type="button"
                onClick={() => setShowConfirmPassword((value) => !value)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            }
            {...register('confirmPassword', {
              required: 'Please confirm your new password.',
              validate: (value) => value === newPassword || 'Passwords do not match.',
            })}
          />
          <Text variant="bodySmall" className="text-slate-500">
            Password requirements: use at least {MIN_PASSWORD_LENGTH} characters and confirm the same password.
          </Text>
          {submitError ? <Text variant="bodySmall" className="text-danger">{getErrorMessage(submitError)}</Text> : null}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Securing account…' : 'Secure my account'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

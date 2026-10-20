import { Card, Text } from '../../../components'
import type { InvitationResult } from './data'

interface InvitationNoticeProps {
  email: string
  invitation: InvitationResult
  /** True when the tenant account already existed (a re-issued invitation). */
  resent?: boolean
}

/**
 * Shows the administrator the delivery status of a setup invitation.
 *
 * It never shows a password, a temporary password, or a token-bearing URL —
 * the administrator has no access to any of those by design.
 */
export function InvitationNotice({ email, invitation, resent = false }: InvitationNoticeProps) {
  if (invitation.delivered) {
    return (
      <Card>
        <Text variant="h3">Setup invitation sent</Text>
        <Text variant="body" className="mt-2 text-slate-500">
          {resent ? 'A new setup invitation was sent to ' : 'A setup invitation was sent to '}
          <span className="font-medium text-slate-700">{email}</span>. They will choose their own
          password from the link in the email — no password is ever shown to you.
        </Text>
      </Card>
    )
  }

  const reason =
    invitation.status === 'not_configured'
      ? 'No email provider is configured on the server, so the invitation could not be sent.'
      : 'The email provider rejected the invitation.'

  return (
    <Card>
      <Text variant="h3">Invitation not delivered</Text>
      <Text variant="body" className="mt-2 text-slate-500">
        {reason} The account was still created and is safe — the tenant cannot sign in until they
        complete setup, and no setup link has been sent. Send the invitation again once the email
        provider is working.
      </Text>
    </Card>
  )
}

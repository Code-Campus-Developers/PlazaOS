import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Button, Card, StatusBadge, Text } from '../../../components'
import { BackLink } from '../components/BackLink'
import { DetailField } from '../components/DetailField'
import { PageHeader } from '../components/PageHeader'
import type { Reminder, ReminderStatus, ReminderType } from '../data/types'
import { cancelReminder, getReminder } from './data'

const statusLabel: Record<ReminderStatus, string> = {
  scheduled: 'Scheduled',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const statusVariant: Record<ReminderStatus, 'info' | 'success' | 'danger' | 'warning'> = {
  scheduled: 'info',
  sent: 'success',
  failed: 'danger',
  cancelled: 'warning',
}

const typeLabel: Record<ReminderType, string> = {
  automatic: 'Automatic',
  manual: 'Manual',
}

// Fetches this reminder from GET /reminders/:reminderId.
export function ReminderDetail() {
  const queryClient = useQueryClient()
  const { reminderId } = useParams<{ reminderId: string }>()
  const [reminder, setReminder] = useState<Reminder | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState(false)

  useEffect(() => {
    if (!reminderId) return
    let cancelled = false
    const queryKey = ['admin-reminder', reminderId]
    const cachedReminder = queryClient.getQueryData<Reminder>(queryKey)
    if (cachedReminder) {
      setReminder(cachedReminder)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setLoadError(false)
    queryClient.fetchQuery({
      queryKey,
      queryFn: () => getReminder(reminderId),
      staleTime: 30_000,
      retry: false,
    })
      .then((found) => {
        if (!cancelled) setReminder(found)
      })
      .catch(() => {
        if (!cancelled && !cachedReminder) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [queryClient, reminderId])

  if (loading) {
    return (
      <div>
        <BackLink to="/admin/reminders" label="Back to reminders" />
        <Text variant="body">Loading…</Text>
      </div>
    )
  }

  if (loadError || !reminder) {
    return (
      <div>
        <BackLink to="/admin/reminders" label="Back to reminders" />
        <Text variant="body">{loadError ? 'Unable to load this reminder from the server.' : 'Reminder not found.'}</Text>
      </div>
    )
  }

  const currentReminder = reminder

  async function handleCancel() {
    if (!window.confirm(`Cancel the scheduled reminder “${currentReminder.title}”? It will remain in reminder history.`)) return
    setIsCancelling(true)
    setCancelError(false)
    try {
      const updated = await cancelReminder(currentReminder.id)
      setReminder(updated)
      queryClient.setQueryData(['admin-reminder', currentReminder.id], updated)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-page', 'reminders'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-page', 'calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard-calendar'] }),
      ])
    } catch {
      setCancelError(true)
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <div>
      <BackLink to="/admin/reminders" label="Back to reminders" />
      <PageHeader
        title={currentReminder.title}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge variant={statusVariant[currentReminder.status]} label={statusLabel[currentReminder.status]} />
            {currentReminder.status === 'scheduled' ? (
              <Button type="button" variant="destructive" onClick={handleCancel} disabled={isCancelling}>
                {isCancelling ? 'Cancelling…' : 'Cancel reminder'}
              </Button>
            ) : null}
          </div>
        }
      />
      {cancelError ? <p role="alert" className="mb-4 text-[13px] text-danger">Unable to cancel this reminder. It may no longer be scheduled.</p> : null}
      <Card className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <DetailField label="Type">{typeLabel[currentReminder.type]}</DetailField>
        <DetailField label="Target">{currentReminder.targetLabel}</DetailField>
        <DetailField label="Scheduled for">{currentReminder.scheduledFor}</DetailField>
        <div className="sm:col-span-2">
          <DetailField label="Message">{currentReminder.message}</DetailField>
        </div>
      </Card>
    </div>
  )
}

import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Input } from '../../../components'
import { BackLink } from '../components/BackLink'
import { PageHeader } from '../components/PageHeader'
import { addCalendarEvent } from './data'

// Submits to POST /calendar — see addCalendarEvent() in ./data.ts.
export function CalendarNew() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState('')
  const [relatedLabel, setRelatedLabel] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await addCalendarEvent({
        title,
        type: 'other',
        date,
        relatedLabel: relatedLabel || undefined,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-page', 'calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard-calendar'] }),
      ])
      navigate('/admin/calendar')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      <BackLink to="/admin/calendar" label="Back to calendar" />
      <PageHeader title="Add event" description="Add a standalone plaza event. Lease, rent, and reminder dates are managed in their own areas." />
      <Card className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          <Input
            label="Event title"
            placeholder="e.g. Wade Warren lease renewal"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <Input
            label="Related to"
            placeholder="e.g. B block, A-101, or a tenant name"
            value={relatedLabel}
            onChange={(event) => setRelatedLabel(event.target.value)}
          />
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Saving…' : 'Add event'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

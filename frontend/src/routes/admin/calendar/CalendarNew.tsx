import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Input } from '../../../components'
import { BackLink } from '../components/BackLink'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import type { CalendarEventType } from '../data/types'
import { addCalendarEvent } from './data'

const typeOptions: { value: CalendarEventType; label: string }[] = [
  { value: 'lease_renewal', label: 'Lease renewal' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'rent_due', label: 'Rent due' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'eviction', label: 'Eviction' },
  { value: 'other', label: 'Other' },
]

// Submits to POST /calendar — see addCalendarEvent() in ./data.ts.
export function CalendarNew() {
  const navigate = useNavigate()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState('')
  const [relatedLabel, setRelatedLabel] = useState('')
  const [type, setType] = useState<CalendarEventType>('reminder')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await addCalendarEvent({
        title,
        type,
        date,
        relatedLabel: relatedLabel || undefined,
      })
      navigate('/admin/calendar')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      <BackLink to="/admin/calendar" label="Back to calendar" />
      <PageHeader title="Add event" description="Add a lease renewal, reminder, or other plaza event to the calendar." />
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
          <Select label="Type" value={type} onChange={(event) => setType(event.target.value as CalendarEventType)} options={typeOptions} />
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Saving…' : 'Add event'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

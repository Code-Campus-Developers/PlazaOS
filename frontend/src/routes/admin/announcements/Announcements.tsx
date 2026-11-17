import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, StatusBadge, Text } from '../../../components'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import { TenantMultiSelect } from '../components/TenantMultiSelect'
import { Textarea } from '../components/Textarea'
import { getTenants } from '../tenants/data'
import type { Announcement, AnnouncementAudience, Tenant } from '../data/types'
import { addAnnouncement, deleteAnnouncement, getAnnouncements } from './data'

const audienceOptions: { value: AnnouncementAudience; label: string }[] = [
  { value: 'all', label: 'All tenants' },
  { value: 'selected', label: 'Selected tenants' },
]

function audienceLabel(announcement: Announcement): string {
  if (announcement.audience === 'all') return 'All tenants'
  return `${announcement.audienceTenantIds.length} tenant${announcement.audienceTenantIds.length === 1 ? '' : 's'}`
}

// Fetches from GET /announcements and submits new ones to POST /announcements
// — see getAnnouncements()/addAnnouncement() in ./data.ts.
export function Announcements() {
  const queryClient = useQueryClient()
  const announcementsQuery = useQuery({
    queryKey: ['admin-announcements'],
    queryFn: () => getAnnouncements({ pageSize: 100 }),
    retry: false,
  })
  const tenantsQuery = useQuery({
    queryKey: ['admin-announcement-tenants'],
    queryFn: () => getTenants({ pageSize: 1000 }),
    retry: false,
  })
  const announcements = announcementsQuery.data?.data ?? []
  const tenants: Tenant[] = tenantsQuery.data?.data ?? []
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<AnnouncementAudience>('all')
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setSubmitError(false)
    try {
      const newAnnouncement = await addAnnouncement({
        title,
        body,
        audience,
        audienceTenantIds: audience === 'selected' ? selectedTenantIds : [],
      })
      queryClient.setQueryData(['admin-announcements'], (current: Awaited<ReturnType<typeof getAnnouncements>> | undefined) =>
        current ? { ...current, data: [newAnnouncement, ...current.data] } : current,
      )
      setTitle('')
      setBody('')
      setAudience('all')
      setSelectedTenantIds([])
    } catch {
      setSubmitError(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(announcement: Announcement) {
    if (!window.confirm(`Delete the announcement “${announcement.title}”? Tenants will no longer see it.`)) return
    setDeletingId(announcement.id)
    setDeleteError(false)
    try {
      await deleteAnnouncement(announcement.id)
      queryClient.setQueryData(['admin-announcements'], (current: Awaited<ReturnType<typeof getAnnouncements>> | undefined) =>
        current ? { ...current, data: current.data.filter((item) => item.id !== announcement.id), total: Math.max(0, current.total - 1) } : current,
      )
    } catch {
      setDeleteError(true)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <PageHeader title="Announcements" description="Post updates to all tenants or a selected group." />

      <Card className="mb-8 max-w-xl">
        <Text variant="h3" className="mb-3">
          New announcement
        </Text>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <Textarea label="Message" value={body} onChange={(event) => setBody(event.target.value)} required />
          <Select
            label="Audience"
            value={audience}
            onChange={(event) => setAudience(event.target.value as AnnouncementAudience)}
            options={audienceOptions}
          />
          {audience === 'selected' ? (
            <TenantMultiSelect tenants={tenants} selectedTenantIds={selectedTenantIds} onChange={setSelectedTenantIds} />
          ) : null}
          <Button type="submit" disabled={isSubmitting || (audience === 'selected' && selectedTenantIds.length === 0)}>
            {isSubmitting ? 'Posting…' : 'Post announcement'}
          </Button>
          {submitError ? <p role="alert" className="text-[13px] text-danger">Unable to post the announcement. Please try again.</p> : null}
          {tenantsQuery.isError ? <p role="alert" className="text-[13px] text-danger">Unable to load tenants for audience selection.</p> : null}
        </form>
      </Card>

      <Text variant="h3" className="mb-3">
        Posted announcements
      </Text>
      {announcementsQuery.isError ? (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-danger/20 bg-danger/5 p-3">
          <p role="alert" className="text-[13px] text-danger">Unable to load announcements from the server.</p>
          <Button variant="secondary" size="sm" onClick={() => void announcementsQuery.refetch()}>Retry</Button>
        </div>
      ) : null}
      {deleteError ? <p role="alert" className="mb-3 text-[13px] text-danger">Unable to delete the announcement. Please try again.</p> : null}
      <div className="flex flex-col gap-4">
        {announcementsQuery.isLoading ? <Text variant="body">Loading announcements…</Text> : null}
        {announcements.map((announcement) => (
          <Card key={announcement.id}>
            <div className="mb-1 flex items-center justify-between gap-4">
              <Text variant="h3">{announcement.title}</Text>
              <div className="flex items-center gap-3">
                <StatusBadge variant="info" label={audienceLabel(announcement)} />
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDelete(announcement)}
                  disabled={deletingId !== null}
                >
                  {deletingId === announcement.id ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </div>
            <Text variant="body" className="text-slate-500">
              {announcement.body}
            </Text>
            <Text variant="caption" className="mt-2 text-slate-500">
              {announcement.createdAt} · {announcement.author}
            </Text>
          </Card>
        ))}
      </div>
    </div>
  )
}

import { useForm } from 'react-hook-form'
import { useMemo, useState } from 'react'
import { Button, Card, Input, Text, Spinner } from '../../components'
import { useMaintenance } from '../../hooks/useMaintenance'
import { useNavigate } from 'react-router-dom'

type FormValues = { title: string; description?: string; priority?: string }

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_IMAGES = 5

export function MaintenanceNew() {
  const { register, handleSubmit, formState } = useForm<FormValues>()
  const [images, setImages] = useState<File[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const { create } = useMaintenance()
  const navigate = useNavigate()

  const previewUrls = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images])

  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function onSubmit(values: FormValues) {
    setErrorMessage(null)
    setSuccessMessage(null)
    const payload = { ...values, images }
    try {
      await create.mutateAsync(payload)
      setSuccessMessage('Maintenance request submitted.')
      // Prevent duplicate submissions briefly and then navigate back
      setTimeout(() => navigate('/tenant/maintenance'), 700)
    } catch (err) {
      console.error(err)
      setErrorMessage('Submission failed. Please try again.')
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    setImageError(null)
    const arr = Array.from(files)

    const invalidType = arr.find((f) => !f.type.startsWith('image/'))
    if (invalidType) {
      setImageError(`"${invalidType.name}" isn't an image file.`)
      return
    }
    const tooLarge = arr.find((f) => f.size > MAX_IMAGE_SIZE_BYTES)
    if (tooLarge) {
      setImageError(`"${tooLarge.name}" is larger than 5MB.`)
      return
    }
    if (images.length + arr.length > MAX_IMAGES) {
      setImageError(`You can attach up to ${MAX_IMAGES} images.`)
      return
    }

    setImages((prev) => [...prev, ...arr])
  }

  const isSubmitting = create.isPending

  return (
    <div className="px-4 sm:px-6">
      <Text variant="h1">New Maintenance Request</Text>
      <Card className="mt-4">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            label="Title"
            {...register('title', { required: 'Title is required.' })}
            disabled={isSubmitting}
            error={formState.errors.title?.message}
          />
          <Input label="Description" {...register('description')} disabled={isSubmitting} />
          <Input label="Priority" {...register('priority')} disabled={isSubmitting} />

          <div>
            <label className="text-[13px] font-medium text-slate-900">Images</label>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFiles(e.target.files)}
              className="mt-2 w-full text-sm"
              disabled={isSubmitting || images.length >= MAX_IMAGES}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {previewUrls.map((src, i) => (
                <img key={i} src={src} alt={`preview-${i}`} className="h-20 w-20 flex-none rounded border border-slate-200 object-cover" />
              ))}
            </div>
            {imageError ? (
              <Text variant="bodySmall" className="mt-2 text-danger">
                {imageError}
              </Text>
            ) : (
              <Text variant="bodySmall" className="mt-2 text-slate-500">
                Up to {MAX_IMAGES} images, 5 MB each.
              </Text>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner label="Submitting request…" size={14} /> : 'Submit'}
            </Button>
          </div>

          {errorMessage ? <Text variant="bodySmall" className="text-danger">{errorMessage}</Text> : null}
          {successMessage ? <Text variant="bodySmall" className="text-success">{successMessage}</Text> : null}
        </form>
      </Card>
    </div>
  )
}

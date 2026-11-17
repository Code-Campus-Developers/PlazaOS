import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MaintenanceNew } from './MaintenanceNew'
import { useMaintenance } from '../../hooks/useMaintenance'

vi.mock('../../hooks/useMaintenance', () => ({ useMaintenance: vi.fn() }))

const mockedUseMaintenance = vi.mocked(useMaintenance)

describe('MaintenanceNew', () => {
  const mutateAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mutateAsync.mockResolvedValue(undefined)
    mockedUseMaintenance.mockReturnValue({ create: { mutateAsync, isPending: false } } as never)
  })

  it('only offers valid priorities and defaults to medium', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <MaintenanceNew />
      </MemoryRouter>,
    )

    const priority = screen.getByLabelText('Priority')
    expect(priority).toHaveValue('medium')
    expect(screen.getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual([
      'low',
      'medium',
      'high',
      'urgent',
    ])
    await user.selectOptions(priority, 'urgent')
    expect(priority).toHaveValue('urgent')
  })

  it('submits the selected valid priority with required request details', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <MaintenanceNew />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Title'), 'Leaking tap')
    await user.type(screen.getByLabelText('Description'), 'Water is leaking under the sink.')
    await user.selectOptions(screen.getByLabelText('Priority'), 'high')
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        title: 'Leaking tap',
        description: 'Water is leaking under the sink.',
        priority: 'high',
        images: [],
      })
    })
  })
})

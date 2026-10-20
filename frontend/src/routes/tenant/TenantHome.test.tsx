import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TenantHome } from './TenantHome'
import { usePayments } from '../../hooks/usePayments'
import { useProfile } from '../../hooks/useProfile'
import { useMaintenance } from '../../hooks/useMaintenance'
import { useAnnouncements } from '../../hooks/useAnnouncements'
import { useNotifications } from '../../hooks/useNotifications'

vi.mock('../../hooks/usePayments', () => ({ usePayments: vi.fn() }))
vi.mock('../../hooks/useProfile', () => ({ useProfile: vi.fn() }))
vi.mock('../../hooks/useMaintenance', () => ({ useMaintenance: vi.fn() }))
vi.mock('../../hooks/useAnnouncements', () => ({ useAnnouncements: vi.fn() }))
vi.mock('../../hooks/useNotifications', () => ({ useNotifications: vi.fn() }))

const mockedUsePayments = vi.mocked(usePayments)
const mockedUseProfile = vi.mocked(useProfile)
const mockedUseMaintenance = vi.mocked(useMaintenance)
const mockedUseAnnouncements = vi.mocked(useAnnouncements)
const mockedUseNotifications = vi.mocked(useNotifications)

function mockPayments(statuses: Array<'paid' | 'pending' | 'failed' | 'refunded'>) {
  mockedUsePayments.mockReturnValue({
    data: {
      data: statuses.map((status, index) => ({
        id: `p${index}`,
        amount: 1000,
        date: '2026-08-01',
        status,
      })),
      total: statuses.length,
      page: 1,
      pageSize: 10,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never)
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TenantHome />
    </MemoryRouter>,
  )
}

describe('TenantHome rent summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseProfile.mockReturnValue({ data: { name: 'Jane', unit: 'A-101', monthlyRent: 5000 } } as never)
    mockedUseMaintenance.mockReturnValue({ data: { data: [] } } as never)
    mockedUseAnnouncements.mockReturnValue({ data: { data: [] } } as never)
    mockedUseNotifications.mockReturnValue({ data: [] } as never)
  })

  it('counts a refunded payment separately from paid ones', () => {
    mockPayments(['paid', 'refunded', 'failed'])
    renderPage()

    expect(screen.getByText('Refunded')).toBeInTheDocument()
    // One paid, one refunded, one failed.
    const summary = screen.getByText('Refunded').parentElement as HTMLElement
    expect(summary.textContent).toContain('1')
  })

  it('includes a refunded payment in the outstanding balance', () => {
    // The gateway returned the money, so the rent is owed again.
    mockPayments(['refunded'])
    renderPage()

    expect(screen.getByText('₦1,000.00')).toBeInTheDocument()
  })

  it('excludes a paid payment from the outstanding balance', () => {
    mockPayments(['paid'])
    renderPage()

    expect(screen.queryByText('₦1,000.00')).not.toBeInTheDocument()
  })
})

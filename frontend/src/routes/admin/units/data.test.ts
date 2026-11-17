import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api'
import { getAvailableFloors, getUnit, getUnits } from './data'

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn() },
}))

describe('admin unit data', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requests filtered and paginated units from the API', async () => {
    const response = { data: [], total: 0, page: 2, pageSize: 5 }
    vi.mocked(api.get).mockResolvedValue(response)

    await expect(
      getUnits({ search: 'D-401', status: 'occupied', floor: '4', sortBy: 'monthlyRent', sortDir: 'desc', page: 2, pageSize: 5 }),
    ).resolves.toEqual(response)

    expect(api.get).toHaveBeenCalledWith(
      '/units?search=D-401&status=occupied&floor=4&sortBy=monthlyRent&sortDir=desc&page=2&pageSize=5',
    )
  })

  it('propagates API errors instead of substituting sample units', async () => {
    const error = new Error('Backend unavailable')
    vi.mocked(api.get).mockRejectedValue(error)

    await expect(getUnits()).rejects.toBe(error)
  })
})

describe('getAvailableFloors', () => {
  it('requests the distinct floor list from the API', async () => {
    vi.mocked(api.get).mockResolvedValue(['2', '10'])
    await expect(getAvailableFloors()).resolves.toEqual(['2', '10'])
    expect(api.get).toHaveBeenCalledWith('/units/floors')
  })
})

describe('getUnit', () => {
  it('requests the unit by id from the API', async () => {
    const unit = { id: 'unit-1', unitNumber: 'D-401' }
    vi.mocked(api.get).mockResolvedValue(unit)

    await expect(getUnit('unit-1')).resolves.toEqual(unit)
    expect(api.get).toHaveBeenCalledWith('/units/unit-1')
  })
})

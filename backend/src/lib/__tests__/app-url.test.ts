import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

async function loadPublicAppUrl() {
  // Imported lazily so each test sees the current environment.
  const { publicAppUrl } = await import('@/lib/app-url')
  return publicAppUrl
}

describe('publicAppUrl', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the configured URL', async () => {
    vi.stubEnv('FRONTEND_URL', 'https://app.plazaos.ng')
    const publicAppUrl = await loadPublicAppUrl()
    expect(publicAppUrl()).toBe('https://app.plazaos.ng')
  })

  it('keeps a base path but drops a trailing slash', async () => {
    vi.stubEnv('FRONTEND_URL', 'https://app.plazaos.ng/plaza/')
    const publicAppUrl = await loadPublicAppUrl()
    expect(publicAppUrl()).toBe('https://app.plazaos.ng/plaza')
  })

  it('falls back to the dev server when unset outside production', async () => {
    vi.stubEnv('FRONTEND_URL', undefined)
    vi.stubEnv('NODE_ENV', 'development')
    const publicAppUrl = await loadPublicAppUrl()
    expect(publicAppUrl()).toBe('http://localhost:5173')
  })

  it('throws in production when unset', async () => {
    // A missing FRONTEND_URL in production would silently produce links
    // pointing at localhost, so it must fail loudly.
    vi.stubEnv('FRONTEND_URL', undefined)
    vi.stubEnv('NODE_ENV', 'production')
    const publicAppUrl = await loadPublicAppUrl()
    expect(() => publicAppUrl()).toThrow('FRONTEND_URL is not configured')
  })

  it('throws for a value that is not an absolute URL', async () => {
    vi.stubEnv('FRONTEND_URL', 'app.plazaos.ng')
    const publicAppUrl = await loadPublicAppUrl()
    expect(() => publicAppUrl()).toThrow('FRONTEND_URL is not a valid absolute URL')
  })

  it('throws for a non-http(s) scheme', async () => {
    // A javascript: or file: URL here would turn every emailed link into an
    // attack on the tenant's browser.
    vi.stubEnv('FRONTEND_URL', 'javascript:alert(1)')
    const publicAppUrl = await loadPublicAppUrl()
    expect(() => publicAppUrl()).toThrow('FRONTEND_URL must use http or https')
  })
})

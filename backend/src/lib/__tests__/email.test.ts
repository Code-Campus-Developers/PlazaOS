import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

describe('sendEmail', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('skips sending (never throws) when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY
    const { sendEmail } = await import('@/lib/email')

    await expect(sendEmail({ to: 'tenant@example.com', subject: 'Hi', html: '<p>Hi</p>' })).resolves.toBeUndefined()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('skips sending when RESEND_API_KEY is still the placeholder value', async () => {
    process.env.RESEND_API_KEY = 're_replace_me'
    const { sendEmail } = await import('@/lib/email')

    await sendEmail({ to: 'tenant@example.com', subject: 'Hi', html: '<p>Hi</p>' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sends via Resend when a real API key is configured', async () => {
    process.env.RESEND_API_KEY = 'real-key'
    process.env.RESEND_FROM_EMAIL = 'noreply@plaza.test'
    sendMock.mockResolvedValue({ data: { id: 'email-1' } })
    const { sendEmail } = await import('@/lib/email')

    await sendEmail({ to: 'tenant@example.com', subject: 'Hi', html: '<p>Hi</p>' })

    expect(sendMock).toHaveBeenCalledWith({
      from: 'noreply@plaza.test',
      to: 'tenant@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
    })
  })

  it('never throws even if the Resend API call fails', async () => {
    process.env.RESEND_API_KEY = 'real-key'
    sendMock.mockRejectedValue(new Error('network error'))
    const { sendEmail } = await import('@/lib/email')

    await expect(sendEmail({ to: 'tenant@example.com', subject: 'Hi', html: '<p>Hi</p>' })).resolves.toBeUndefined()
  })
})

describe('escapeHtml', () => {
  it('escapes angle brackets so a name cannot inject markup', async () => {
    const { escapeHtml } = await import('@/lib/email')

    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('escapes ampersands first, so entities are not double-decoded', async () => {
    const { escapeHtml } = await import('@/lib/email')

    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
    expect(escapeHtml('&lt;b&gt;')).toBe('&amp;lt;b&amp;gt;')
  })

  it('escapes quotes so an attribute cannot be broken out of', async () => {
    const { escapeHtml } = await import('@/lib/email')

    expect(escapeHtml('" onmouseover="alert(1)')).toBe('&quot; onmouseover=&quot;alert(1)')
    expect(escapeHtml("it's")).toBe('it&#39;s')
  })

  it('leaves ordinary text unchanged', async () => {
    const { escapeHtml } = await import('@/lib/email')

    expect(escapeHtml('Jane Cooper')).toBe('Jane Cooper')
    expect(escapeHtml('Unit A-101, Block B')).toBe('Unit A-101, Block B')
  })
})

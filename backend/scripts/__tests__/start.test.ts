import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { resolvePort, exitStatusFor, DEFAULT_PORT } = require('../start.js') as {
  resolvePort: (env?: Record<string, string | undefined>) => number
  exitStatusFor: (code: number | null, signal: string | null) => number
  DEFAULT_PORT: number
}

const startScriptPath = fileURLToPath(new URL('../start.js', import.meta.url))

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
) as { scripts: Record<string, string> }

describe('start script port resolution', () => {
  it('falls back to 4000 when PORT is not set', () => {
    expect(resolvePort({})).toBe(4000)
    expect(DEFAULT_PORT).toBe(4000)
  })

  it('falls back to 4000 when PORT is empty or whitespace', () => {
    expect(resolvePort({ PORT: '' })).toBe(4000)
    expect(resolvePort({ PORT: '   ' })).toBe(4000)
  })

  it('uses the PORT provided by the host', () => {
    expect(resolvePort({ PORT: '8080' })).toBe(8080)
    expect(resolvePort({ PORT: ' 8080 ' })).toBe(8080)
  })

  it('rejects a PORT that is not a valid TCP port', () => {
    expect(() => resolvePort({ PORT: 'abc' })).toThrow(/PORT must be an integer/)
    expect(() => resolvePort({ PORT: '0' })).toThrow(/PORT must be an integer/)
    expect(() => resolvePort({ PORT: '70000' })).toThrow(/PORT must be an integer/)
  })
})

describe('exit status mapping', () => {
  it('propagates the child exit code', () => {
    expect(exitStatusFor(0, null)).toBe(0)
    expect(exitStatusFor(1, null)).toBe(1)
  })

  it('maps a signal-terminated child to the conventional 128+signal status', () => {
    expect(exitStatusFor(null, 'SIGTERM')).toBe(143)
    expect(exitStatusFor(null, 'SIGINT')).toBe(130)
  })

  it('falls back to 1 when the termination is unknown', () => {
    expect(exitStatusFor(null, null)).toBe(1)
    expect(exitStatusFor(null, 'SIGWHATEVER')).toBe(1)
  })
})

describe('start script process behaviour', () => {
  it('exits with a clear error and status 1 when PORT is invalid', () => {
    const result = spawnSync(process.execPath, [startScriptPath], {
      env: { ...process.env, PORT: 'not-a-port' },
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('PORT must be an integer')
  })
})

describe('npm start wiring', () => {
  it('starts the server through the PORT-aware launcher, not a hardcoded port', () => {
    expect(packageJson.scripts.start).toBe('node scripts/start.js')
  })

  it('keeps the development server on port 4000', () => {
    expect(packageJson.scripts.dev).toBe('next dev -p 4000')
  })
})

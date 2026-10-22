'use strict'

/**
 * Starts the production Next.js server on the port the host provides.
 *
 * Railway (and most PaaS providers) inject a dynamic `PORT`; local runs fall
 * back to this project's conventional 4000. The port is resolved in Node
 * rather than inside the npm script because npm runs scripts through
 * `cmd.exe` on Windows and `sh` elsewhere, so shell-style `${PORT:-4000}`
 * expansion would only work on one of them.
 *
 * Written as plain CommonJS with no dependencies so the start command works
 * even in an image that installed only production dependencies.
 */

const { spawn } = require('node:child_process')

const DEFAULT_PORT = 4000
const MIN_PORT = 1
const MAX_PORT = 65535

// Conventional shell exit statuses for signal-terminated children.
const SIGNAL_EXIT_STATUS = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 }

/**
 * Resolves the port the server should listen on.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {number}
 */
function resolvePort(env) {
  const source = env || process.env
  const raw = typeof source.PORT === 'string' ? source.PORT.trim() : ''

  if (!raw) return DEFAULT_PORT

  const port = Number(raw)
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `PORT must be an integer between ${MIN_PORT} and ${MAX_PORT}, got ${JSON.stringify(raw)}`,
    )
  }

  return port
}

/**
 * Maps a child's termination to the status this process should exit with.
 *
 * @param {number | null} code
 * @param {string | null} signal
 * @returns {number}
 */
function exitStatusFor(code, signal) {
  if (signal) return SIGNAL_EXIT_STATUS[signal] ?? 1
  return code === null || code === undefined ? 1 : code
}

function main() {
  const port = resolvePort(process.env)
  const nextBin = require.resolve('next/dist/bin/next')

  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) },
  })

  // A child that could not be spawned emits 'error' and never emits 'exit',
  // so it needs its own handler — otherwise it surfaces as an unhandled
  // 'error' event (an uncaught exception with a raw stack trace).
  child.on('error', (error) => {
    console.error(`Failed to start the Next.js server: ${error.message}`)
    process.exit(1)
  })

  // Railway stops a service with SIGTERM; forward it so Next.js can close
  // its server gracefully instead of being killed mid-request.
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      child.kill(signal)
    })
  }

  child.on('exit', (code, signal) => {
    // Exit explicitly. Re-raising the signal here would be a no-op, because
    // a handler for it is installed above — that would leave this process
    // running until the platform's hard kill instead of shutting down now.
    process.exit(exitStatusFor(code, signal))
  })
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

module.exports = { resolvePort, exitStatusFor, DEFAULT_PORT, MIN_PORT, MAX_PORT }

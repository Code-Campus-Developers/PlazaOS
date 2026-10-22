import { fileURLToPath } from 'node:url'
import { relative } from 'node:path'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const projectLabel = relative(process.cwd(), projectRoot) || '.'
const API_BASE_URL_VAR = 'VITE_API_BASE_URL'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, projectRoot, 'VITE_')

  // Guard the build: an unset/empty VITE_API_BASE_URL inlines as `undefined`
  // into the bundle, so every API call silently targets the wrong origin.
  // Fail the build loudly instead of shipping a broken frontend.
  if (command === 'build') {
    const apiBaseUrl = env[API_BASE_URL_VAR]?.trim()
    if (!apiBaseUrl) {
      throw new Error(
        [
          `${API_BASE_URL_VAR} is not set — refusing to build the frontend.`,
          'Without it, API requests would be sent to the wrong origin.',
          '',
          'Set it in one of these places:',
          `  - a local ${projectLabel}/.env file (see ${projectLabel}/.env.example)`,
          '  - your CI / hosting provider environment variables',
          '',
          'Example:',
          `  ${API_BASE_URL_VAR}=https://api.example.com/api npm run build`,
        ].join('\n'),
      )
    }
  }

  return {
    root: projectRoot,
    envDir: projectRoot,
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  }
})

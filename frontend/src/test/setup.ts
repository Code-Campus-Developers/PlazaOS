import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// The API client refuses to call an unconfigured API base URL, so the test
// environment provides one — mirroring a real deployment.
vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000/api')

afterEach(() => {
  cleanup()
})

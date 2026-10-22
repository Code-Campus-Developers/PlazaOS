const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim()
const TOKEN_KEY = 'plaza_os_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Backend errors are `{ message: string }` JSON (see BACKEND_BUILD_PLAN.md §10.2);
// fall back to plain text for any response that isn't JSON-shaped.
async function extractErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) return response.statusText
  try {
    const body = JSON.parse(text) as { message?: unknown }
    if (typeof body.message === 'string' && body.message) return body.message
  } catch {
    // Not JSON — use the raw text below.
  }
  return text || response.statusText
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const isFormData = options.body instanceof FormData
  if (!isFormData) {
    // Let the browser set Content-Type (incl. multipart boundary) for FormData bodies.
    headers.set('Content-Type', 'application/json')
  }

  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (!API_BASE_URL) {
    throw new Error(
      'VITE_API_BASE_URL is not set, so the API base URL is undefined and requests would be sent to ' +
        'the wrong origin. Set VITE_API_BASE_URL (see frontend/.env.example) and rebuild the frontend.',
    )
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: isFormData ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 401) {
    clearToken()
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    throw new ApiError('Unauthorized', 401)
  }

  if (!response.ok) {
    const message = await extractErrorMessage(response)
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const api = {
  get: <T,>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T,>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
}

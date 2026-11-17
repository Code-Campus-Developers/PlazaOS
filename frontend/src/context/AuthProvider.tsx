import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { api, clearToken, getToken, setToken } from '../lib/api'
import { AuthContext, type AuthContextValue, type AuthUser } from './AuthContext'

interface LoginResponse {
  token: string
  user: AuthUser
}

const USER_KEY = 'plaza_os_user'

export { AuthContext }

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children?: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser())

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<LoginResponse>('/auth/login', { email, password })
    setToken(response.token)
    localStorage.setItem(USER_KEY, JSON.stringify(response.user))
    setTokenState(response.token)
    setUser(response.user)
    return response.user
  }, [])

  const completePasswordSetup = useCallback((updatedUser?: AuthUser) => {
    setUser((currentUser) => {
      if (!currentUser) return currentUser
      const nextUser = { ...currentUser, ...updatedUser, mustChangePassword: false }
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
      return nextUser
    })
  }, [])

  const logout = useCallback(() => {
    clearToken()
    localStorage.removeItem(USER_KEY)
    setTokenState(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      role: user?.role ?? null,
      isAuthenticated: Boolean(token && user),
      login,
      completePasswordSetup,
      logout,
    }),
    [user, token, login, completePasswordSetup, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

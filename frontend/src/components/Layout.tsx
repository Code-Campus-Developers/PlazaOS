import {
  Bell,
  Building2,
  CalendarDays,
  CreditCard,
  Home,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  User,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import type { Role } from '../context/AuthContext'

interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Only the tenant "Home" item needs exact matching — everything else should stay
   * active for its own sub-routes (e.g. /admin/units/:unitId keeps "Units" highlighted). */
  end?: boolean
}

const NAV_ITEMS: Record<Role, NavItem[]> = {
  admin: [
    { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Units', to: '/admin/units', icon: Building2 },
    { label: 'Tenants', to: '/admin/tenants', icon: Users },
    { label: 'Maintenance', to: '/admin/maintenance', icon: Wrench },
    { label: 'Announcements', to: '/admin/announcements', icon: Megaphone },
    { label: 'Reminders', to: '/admin/reminders', icon: Bell },
    { label: 'Calendar', to: '/admin/calendar', icon: CalendarDays },
    { label: 'Notifications', to: '/admin/notifications', icon: Bell },
  ],
  tenant: [
    { label: 'Home', to: '/tenant', icon: Home, end: true },
    { label: 'Profile', to: '/tenant/profile', icon: User },
    { label: 'Payments', to: '/tenant/payments', icon: CreditCard },
    { label: 'Maintenance', to: '/tenant/maintenance', icon: Wrench },
    { label: 'Announcements', to: '/tenant/announcements', icon: Megaphone },
    { label: 'Notifications', to: '/tenant/notifications', icon: Bell },
    { label: 'Calendar', to: '/tenant/calendar', icon: CalendarDays },
  ],
}

interface SidebarContentProps {
  navItems: NavItem[]
  role: Role | null
  userName: string | undefined
  onLogout: () => void
  onNavigate?: () => void
  onClose?: () => void
}

function SidebarContent({ navItems, role, userName, onLogout, onNavigate, onClose }: SidebarContentProps) {
  const initials = (userName ?? '?')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-lg font-bold tracking-tight text-primary">Plaza OS</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light md:hidden"
          >
            <X aria-hidden="true" size={18} />
          </button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex min-h-[44px] items-center gap-3 rounded-md px-3 text-[15px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light focus-visible:ring-offset-2 ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon aria-hidden="true" size={18} className={isActive ? 'text-white' : 'text-slate-500'} />
                  <span className={isActive ? 'font-semibold' : 'font-medium'}>{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-slate-900">{userName}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">{role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-[14px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
        >
          <LogOut aria-hidden="true" size={16} />
          Log out
        </button>
      </div>
    </div>
  )
}

/** One shell for both roles — sidebar links and identity swap based on AuthContext's role. */
export function Layout() {
  const { role, user, logout } = useAuth()
  const navItems = role ? NAV_ITEMS[role] : []
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  useEffect(() => {
    if (!isMobileNavOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsMobileNavOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMobileNavOpen])

  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="hidden md:block">
        <SidebarContent navItems={navItems} role={role} userName={user?.name} onLogout={logout} />
      </div>

      {isMobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setIsMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64">
            <SidebarContent
              navItems={navItems}
              role={role}
              userName={user?.name}
              onLogout={logout}
              onNavigate={() => setIsMobileNavOpen(false)}
              onClose={() => setIsMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-[44px] items-center border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            aria-label="Open navigation"
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
          >
            <Menu aria-hidden="true" size={20} />
          </button>
          <span className="ml-3 text-lg font-bold tracking-tight text-primary">Plaza OS</span>
        </div>
        <main className="min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

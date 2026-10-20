import { StatusBadge } from '../StatusBadge'

const STATS = [
  { label: 'Occupancy', value: '92%', change: '+2.4%' },
  { label: 'Revenue', value: '₦48,250', change: '+12%' },
  { label: 'Tenants', value: '128', change: '+3' },
  { label: 'Maintenance', value: '12', change: '-4' },
]

const PAYMENTS = [
  { tenant: 'Acme Corp', unit: 'A-101', amount: '₦2,400', status: 'success' as const },
  { tenant: 'Globex Inc', unit: 'B-204', amount: '₦1,850', status: 'success' as const },
  { tenant: 'Initech', unit: 'C-310', amount: '₦3,100', status: 'info' as const },
  { tenant: 'Umbrella Co', unit: 'D-102', amount: '₦950', status: 'danger' as const },
]

const SIDEBAR_ITEMS = [
  'Dashboard',
  'Tenants',
  'Payments',
  'Maintenance',
  'Reports',
  'Settings',
]

export function DashboardMockup() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="/PlazaOS%20logo.png" alt="PlazaOS" className="h-8 w-auto" />
        </div>
        <div className="hidden md:flex items-center gap-3">
          <div className="h-8 w-48 rounded-lg bg-slate-100" />
          <div className="h-8 w-8 rounded-full bg-slate-200" />
        </div>
      </div>

      <div className="flex">
        <aside className="hidden md:flex w-44 flex-col border-r border-slate-200 p-3">
          {SIDEBAR_ITEMS.map((item) => (
            <div
              key={item}
              className="flex items-center rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              {item}
            </div>
          ))}
        </aside>

        <div className="flex-1 p-4">
          <div className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {STATS.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">{stat.label}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{stat.value}</div>
                <div className="mt-1 text-xs text-success">{stat.change}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">Recent Payments</div>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-xs font-medium text-slate-500">Tenant</th>
                  <th className="px-4 py-2 text-xs font-medium text-slate-500">Unit</th>
                  <th className="px-4 py-2 text-xs font-medium text-slate-500">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {PAYMENTS.map((row) => (
                  <tr key={row.tenant} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 text-slate-900">{row.tenant}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.unit}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge variant={row.status} label={row.status.charAt(0).toUpperCase() + row.status.slice(1)} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-900">{row.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

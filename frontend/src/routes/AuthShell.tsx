import type { ReactNode } from 'react'

interface AuthShellProps {
  plateLabel: string
  plateVariant?: 'default' | 'success'
  children: ReactNode
}

export function AuthShell({ plateLabel, plateVariant = 'default', children }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.3]"
        style={{
          backgroundImage:
            'linear-gradient(#E2E8F0 1px, transparent 1px), linear-gradient(90deg, #E2E8F0 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />

      <div className="relative w-full max-w-[420px]">
        <div
          className={`flex items-center justify-center rounded-t-xl px-4 py-2 font-mono text-[11px] tracking-[0.18em] transition-colors duration-300 ${
            plateVariant === 'success'
              ? 'bg-primary text-white'
              : 'bg-slate-900 text-white/70'
          }`}
        >
          {plateLabel}
        </div>

        <div className="rounded-b-xl border border-t-0 border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/60">
          {children}
        </div>
      </div>
    </div>
  )
}
import { type CSSProperties } from 'react'

interface SpinnerProps {
  label?: string
  size?: number
  className?: string
}

export function Spinner({ label = 'Loading…', size = 16, className = '' }: SpinnerProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="status" aria-live="polite">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="#E0E7FF" strokeWidth="3" />
        <path d="M12 2 a10 10 0 0 1 10 10" stroke="#3730A3" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="text-sm text-slate-600">{label}</span>
    </span>
  )
}

import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  className?: string
  header?: ReactNode
  footer?: ReactNode
  padding?: boolean
}

export function Card({ children, className = '', header, footer, padding = true, ...props }: CardProps) {
  return (
    <div
      className={`rounded-card border border-slate-200 bg-white shadow-sm ${className}`}
      {...props}
    >
      {header ? (
        <div className={`flex items-center justify-between border-b border-slate-100 ${padding ? 'px-5 py-3.5' : 'px-5 py-3.5'}`}>
          {header}
        </div>
      ) : null}
      <div className={padding ? 'p-5' : ''}>{children}</div>
      {footer ? (
        <div className={`border-t border-slate-100 ${padding ? 'px-5 py-3.5' : 'px-5 py-3.5'}`}>
          {footer}
        </div>
      ) : null}
    </div>
  )
}
import type { ButtonHTMLAttributes } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  leftIcon?: LucideIcon
  rightIcon?: LucideIcon
  loading?: boolean
}

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold text-[15px] leading-none transition-all duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light focus-visible:ring-offset-2'

const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'min-h-[36px] px-3 text-[13px]',
  md: 'min-h-[44px] px-4 text-[15px]',
  lg: 'min-h-[52px] px-6 text-[16px]',
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-dark hover:shadow-md active:scale-[0.98]',
  secondary: 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98]',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 active:scale-[0.98]',
  destructive: 'border border-danger/20 bg-white text-danger hover:bg-danger/5 active:scale-[0.98]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  loading = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : LeftIcon ? (
        <LeftIcon className="h-4 w-4" />
      ) : null}
      {children}
      {RightIcon && !loading ? <RightIcon className="h-4 w-4" /> : null}
    </button>
  )
}

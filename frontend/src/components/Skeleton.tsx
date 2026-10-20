
interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string
  height?: string
}

export function Skeleton({ className = '', variant = 'text', width, height }: SkeletonProps) {
  const variantClasses = {
    text: 'rounded bg-slate-200',
    circular: 'rounded-full bg-slate-200',
    rectangular: 'rounded-md bg-slate-200',
  }

  return (
    <div
      className={`animate-pulse ${variantClasses[variant]} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}

interface SkeletonCardProps {
  className?: string
}

export function SkeletonCard({ className = '' }: SkeletonCardProps) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width="40px" height="40px" />
        <div className="flex-1">
          <Skeleton variant="text" width="60%" height="14px" />
          <Skeleton variant="text" width="40%" height="12px" className="mt-2" />
        </div>
      </div>
      <Skeleton variant="text" width="80%" height="24px" className="mt-4" />
    </div>
  )
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} variant="text" width="80px" height="12px" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="px-4 py-3 flex gap-4">
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton key={colIdx} variant="text" width="60%" height="14px" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
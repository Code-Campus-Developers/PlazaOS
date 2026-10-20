import { useMemo, useState, type ReactNode } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'

export interface TableColumn<T> {
  key: string
  header: string
  sortable?: boolean
  render?: (row: T) => ReactNode
  className?: string
}

interface TableProps<T> {
  columns: TableColumn<T>[]
  data: T[]
  getRowKey: (row: T) => string
  emptyMessage?: string
  onRowClick?: (row: T) => void
}

type SortDirection = 'asc' | 'desc'

function getCellValue<T>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key]
}

export function Table<T>({
  columns,
  data,
  getRowKey,
  emptyMessage = 'No data available',
  onRowClick,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const sortedData = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const comparison = String(getCellValue(a, sortKey) ?? '').localeCompare(
        String(getCellValue(b, sortKey) ?? ''),
        undefined,
        { numeric: true },
      )
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [data, sortKey, sortDirection])

  function handleSort(column: TableColumn<T>) {
    if (!column.sortable) return
    if (sortKey === column.key) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(column.key)
      setSortDirection('asc')
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-[15px]">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                onClick={() => handleSort(column)}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                  column.sortable ? 'cursor-pointer select-none' : ''
                } ${column.className ?? ''}`}
              >
                <span className="inline-flex items-center gap-1">
                  {column.header}
                  {column.sortable && (
                    <span className="flex flex-col">
                      {sortKey === column.key ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp size={12} className="text-primary" />
                        ) : (
                          <ArrowDown size={12} className="text-primary" />
                        )
                      ) : (
                        <span className="h-3 w-3 text-slate-300">
                          <ArrowUp size={12} />
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row) => (
              <tr
                key={getRowKey(row)}
                className={`border-t border-slate-100 transition-colors duration-150 ${
                  onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''
                }`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} className={`px-4 py-3 text-slate-900 ${column.className ?? ''}`}>
                    {column.render ? column.render(row) : String(getCellValue(row, column.key) ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
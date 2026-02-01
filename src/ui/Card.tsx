import React from 'react'

export function Card({
  className = '',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={
        'rounded-3xl border border-slate-200 bg-white shadow-sm ' +
        'dark:border-white/12 dark:bg-slate-900/60 dark:shadow-none ' +
        className
      }
    >
      {children}
    </div>
  )
}

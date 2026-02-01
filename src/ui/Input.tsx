import React from 'react'

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: string
}

export function Input({ className = '', error, ...props }: Props) {
  return (
    <div className="w-full">
      <input
        className={
          'w-full rounded-2xl border px-4 py-3 text-sm shadow-sm outline-none transition ' +
          (error
            ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/15 '
            : 'border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ') +
          'bg-white text-slate-900 placeholder:text-slate-400 ' +
          'dark:border-white/12 dark:bg-slate-900/40 dark:text-white dark:placeholder:text-white/40 dark:shadow-none ' +
          className
        }
        {...props}
      />
      {error ? (
        <div className="mt-1 text-xs text-red-600 dark:text-red-300">{error}</div>
      ) : null}
    </div>
  )
}

import React from 'react'
import { cn } from './cn'

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  hint?: string
  error?: string
}

export function Input({ className, hint, error, ...props }: Props) {
  return (
    <div className="w-full">
      <input
        className={cn(
          'w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm outline-none transition ' +
            'placeholder:text-white/45 focus:border-white/25 focus:bg-white/12 dark:text-white text-gray-900 ' +
            (error ? 'border-red-400/50 focus:border-red-400/60' : ''),
          className,
        )}
        {...props}
      />
      {error ? (
        <div className="mt-2 text-xs text-red-300">{error}</div>
      ) : hint ? (
        <div className="mt-2 text-xs text-white/60 dark:text-white/60 text-gray-500">{hint}</div>
      ) : null}
    </div>
  )
}

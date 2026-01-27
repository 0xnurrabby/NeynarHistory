import React from 'react'
import { cn } from './cn'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline'
  loading?: boolean
  leftIcon?: React.ReactNode
}

export function Button({
  className,
  variant = 'primary',
  loading = false,
  leftIcon,
  disabled,
  children,
  ...props
}: Props) {
  const base =
    'relative inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ' +
    'active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
  const variants: Record<string, string> = {
    primary:
      'bg-white/10 hover:bg-white/15 border border-white/15 shadow-soft backdrop-blur-md dark:text-white text-gray-900',
    outline:
      'bg-transparent hover:bg-white/5 border border-white/15 dark:text-white text-gray-900',
    ghost: 'bg-transparent hover:bg-white/5 dark:text-white text-gray-900',
  }

  return (
    <button
      className={cn(base, variants[variant], className)}
      disabled={disabled || loading}
      {...props}
    >
      {leftIcon}
      <span className={cn(loading ? 'opacity-0' : 'opacity-100')}>{children}</span>
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />
        </span>
      ) : null}
    </button>
  )
}

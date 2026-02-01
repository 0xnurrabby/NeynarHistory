import React from 'react'

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden
    />
  )
}

type Variant = 'primary' | 'outline' | 'ghost'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  variant?: Variant
}

export function Button({
  children,
  className = '',
  disabled,
  loading,
  variant = 'primary',
  ...props
}: Props) {
  const isDisabled = Boolean(disabled || loading)

  const base =
    'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold ' +
    'transition active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-blue-500/35'

  const variants: Record<Variant, string> = {
    primary:
      'bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-600/60 ' +
      'dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-blue-600/50',
    outline:
      'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 disabled:bg-white/60 ' +
      'dark:border-white/12 dark:bg-slate-900/40 dark:text-white dark:hover:bg-slate-900/60 dark:disabled:bg-slate-900/30',
    ghost:
      'bg-transparent text-slate-900 hover:bg-slate-100 disabled:text-slate-400 ' +
      'dark:text-white dark:hover:bg-white/8 dark:disabled:text-white/40',
  }

  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={isDisabled} {...props}>
      {loading ? <Spinner /> : null}
      <span className={loading ? 'opacity-90' : ''}>{children}</span>
    </button>
  )
}

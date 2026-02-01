import React from 'react'
import { cn } from './cn'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-2xl bg-slate-200 dark:bg-white/10', className)}
      {...props}
    />
  )
}

import React from 'react'
import { cn } from './cn'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-white/12 bg-white/8 backdrop-blur-md shadow-soft',
        className,
      )}
      {...props}
    />
  )
}

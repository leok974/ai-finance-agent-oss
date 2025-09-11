import * as React from 'react'
import { cn } from '@/lib/utils'

export type ChipProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'muted'
  size?: 'sm' | 'md'
}

export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(function Chip({
  className,
  tone = 'default',
  size = 'sm',
  ...props
}, ref) {
  const tones: Record<string, string> = {
    default: 'border-border text-foreground/90 bg-accent/10',
    good: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10',
    warn: 'border-amber-500/30 text-amber-300 bg-amber-500/10',
    bad: 'border-rose-500/30 text-rose-300 bg-rose-500/10',
    muted: 'border-border text-foreground/70 bg-muted/10',
  }
  const sizes: Record<string, string> = {
    sm: 'text-[10px] px-2 py-0.5 rounded-full',
    md: 'text-xs px-2.5 py-1 rounded-full',
  }
  return (
    <span ref={ref} className={cn('inline-flex items-center gap-1 border', tones[tone], sizes[size], className)} {...props} />
  )
})

export default Chip

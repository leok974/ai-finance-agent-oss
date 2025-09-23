import * as React from 'react'
import { cn } from '@/lib/utils'

export type PillProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'default' | 'accent' | 'muted'
  size?: 'xs' | 'sm'
}

// Lightweight pill/badge surface for drawer header & status chips.
export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(function Pill({
  className,
  tone = 'default',
  size = 'xs',
  ...props
}, ref) {
  const tones: Record<string, string> = {
    default: 'bg-white/5 border border-white/10 text-[11px] text-white/90',
    accent: 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300',
    muted: 'bg-white/5 border border-white/10 text-white/60',
  }
  const sizes: Record<string, string> = {
    xs: 'px-2 py-[2px] rounded-full',
    sm: 'px-2.5 py-1 text-[12px] rounded-full',
  }
  return <span ref={ref} className={cn('inline-flex items-center gap-1 font-medium tracking-tight', tones[tone], sizes[size], className)} {...props} />
})

export default Pill

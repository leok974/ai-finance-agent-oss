import React from 'react'
import clsx from 'clsx'

type Props = React.PropsWithChildren<{ title?: React.ReactNode; right?: React.ReactNode; className?: string }>
export default function Card({ title, right, className, children }: Props) {
  return (
  <section className={clsx('card bg-card border border-border rounded-2xl p-3', className)}>
      {(title || right) && (
        <header className="flex items-center justify-between border-b border-border pb-1 mb-3">
          <h3 className="text-lg font-semibold opacity-90">{title}</h3>
          <div>{right}</div>
        </header>
      )}
      <div>{children}</div>
    </section>
  )
}

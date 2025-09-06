import React from 'react'

type Props = React.PropsWithChildren<{ title?: React.ReactNode; right?: React.ReactNode; className?: string }>
export default function Card({ title, right, className, children }: Props) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || right) && (
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold opacity-90">{title}</h3>
          <div>{right}</div>
        </header>
      )}
      <div>{children}</div>
    </section>
  )
}

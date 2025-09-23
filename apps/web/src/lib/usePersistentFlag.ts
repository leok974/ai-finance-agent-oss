import * as React from 'react'

export function usePersistentFlag(key: string, initial = false): [boolean, (v: boolean) => void] {
  const [val, setVal] = React.useState<boolean>(() => {
    try {
      const s = localStorage.getItem(key)
      return s === null ? initial : s === '1'
    } catch { return initial }
  })
  const set = React.useCallback((v: boolean) => {
    setVal(v)
    try { localStorage.setItem(key, v ? '1' : '0') } catch {}
  }, [])
  return [val, set]
}

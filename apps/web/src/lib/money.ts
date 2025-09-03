export function money(n: number|string){ 
  const v = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(v)) return '--'
  return v.toLocaleString(undefined, {style:'currency', currency:'USD'})
}

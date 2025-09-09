export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 400) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

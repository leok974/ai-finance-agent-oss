export function scrollToId(id: string, opts: ScrollIntoViewOptions = { behavior: "smooth", block: "start" }) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
  if (el) el.scrollIntoView(opts);
}

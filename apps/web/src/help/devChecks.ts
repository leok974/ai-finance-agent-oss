import { helpRegistry } from "./helpRegistry";

export function verifyHelpKeys() {
  if ((import.meta as any).env?.PROD) return;
  const keys = Object.keys(helpRegistry);
  const set = new Set(keys);
  if (set.size !== keys.length) {
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    // eslint-disable-next-line no-console
    console.warn("[Help] Duplicate keys detected:", Array.from(new Set(dupes)));
  }
  const missing = Array.from(document.querySelectorAll<HTMLElement>("[data-help-key]"))
    .map((el) => el.dataset.helpKey!)
    .filter((k) => !(k in helpRegistry));
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn("[Help] Missing registry entries:", Array.from(new Set(missing)));
  }
}

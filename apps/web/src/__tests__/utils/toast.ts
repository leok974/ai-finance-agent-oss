// Test toast helpers: polling-based assertions for portal-rendered toasts.
// Attempts to work with sonner, radix, or generic aria-live containers.

function getToastNodes(): Element[] {
  return Array.from(document.querySelectorAll<HTMLElement>([
    '[data-sonner-toast]',
    '[data-sonner-toaster]',
    '[data-radix-toast-viewport]',
    '[data-toast]',
    '[role="status"]',
    '[role="alert"]'
  ].join(',')));
}

function toastsText(): string {
  const nodes = getToastNodes();
  if (!nodes.length) return document.body.textContent || '';
  return nodes.map(n => n.textContent || '').join('\n');
}

export async function expectToast(
  pattern: RegExp | string,
  timeout = 3000,
  interval = 50
): Promise<void> {
  const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (re.test(toastsText())) return;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Timed out waiting for toast matching: ${re}`);
}

export async function expectNoToast(
  pattern: RegExp | string,
  timeout = 300,
  interval = 50
): Promise<void> {
  const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (re.test(toastsText())) {
      throw new Error(`Unexpected toast appeared: ${re}`);
    }
    await new Promise(r => setTimeout(r, interval));
  }
}

export async function clickToastAction(
  label: RegExp | string,
  timeout = 3000,
  interval = 50
): Promise<void> {
  const re = typeof label === 'string' ? new RegExp(`^${label}$`, 'i') : label;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
    const btn = buttons.find(b => re.test(b.textContent?.trim() || ''));
    if (btn) {
      btn.click();
      return;
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Timed out waiting for toast action: ${re}`);
}

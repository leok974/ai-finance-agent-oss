export async function expectBodyText(pattern: RegExp, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const text = document.body.textContent || '';
    if (pattern.test(text)) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for body text to match ${pattern}`);
}

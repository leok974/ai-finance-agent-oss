import { Locator, Page, Response } from '@playwright/test';

const INPUT_SELECTORS = [
  '[data-testid="uploadcsv-input"]',
  '[data-test="uploadcsv-input"]',
  '[data-e2e="uploadcsv-input"]',
  'input[type="file"][accept*="csv"]',
];

const SUBMIT_SELECTORS = [
  '[data-testid="uploadcsv-submit"]',
  '[data-test="uploadcsv-submit"]',
  '[data-e2e="uploadcsv-submit"]',
  'button:has-text("Upload CSV")',
];

export type UploadUiHandles = {
  input: Locator;
  submit: Locator;
  replaceToggle: Locator | null;
};

export type EnsureUploadUiOptions = {
  timeout?: number;
};

export async function ensureUploadUi(page: Page, options?: EnsureUploadUiOptions): Promise<UploadUiHandles> {
  const timeout = options?.timeout ?? 15_000;

  const input = page.locator(INPUT_SELECTORS.join(', ')).first();
  await input.waitFor({ state: 'attached', timeout });
  await input.scrollIntoViewIfNeeded().catch(() => undefined);

  const submit = page.locator(SUBMIT_SELECTORS.join(', ')).first();
  await submit.waitFor({ state: 'visible', timeout }).catch(() => undefined);

  const replaceToggle = await locateCheckbox(page);

  return { input, submit, replaceToggle };
}

async function locateCheckbox(page: Page): Promise<Locator | null> {
  const checkbox = page.getByRole('checkbox', { name: /replace existing data/i }).first();
  try {
    await checkbox.waitFor({ state: 'attached', timeout: 2500 });
    return checkbox;
  } catch {
    return null;
  }
}

export type UploadCsvOptions = {
  timeout?: number;
  expectSuccessToast?: boolean;
  replaceExisting?: boolean;
  ingestUrlPattern?: RegExp;
};

export type UploadCsvResult = {
  response: Response;
};

export async function uploadCsvAndWait(
  page: Page,
  filePath: string,
  options?: UploadCsvOptions,
): Promise<UploadCsvResult> {
  const timeout = options?.timeout ?? 40_000;
  const expectToast = options?.expectSuccessToast ?? true;
  const ingestPattern = options?.ingestUrlPattern ?? /\/ingest(\?|$)/;

  const { input, submit, replaceToggle } = await ensureUploadUi(page, { timeout });

  if (options?.replaceExisting !== undefined && replaceToggle) {
    const shouldReplace = !!options.replaceExisting;
    const current = await replaceToggle.isChecked().catch(() => shouldReplace);
    if (current !== shouldReplace) {
      await replaceToggle.click();
    }
  }

  await input.setInputFiles(filePath);

  const uploadResponsePromise = page.waitForResponse((resp) => {
    if (resp.request().method() !== 'POST') return false;
    try {
      const url = new URL(resp.url());
      return ingestPattern.test(url.pathname);
    } catch {
      return ingestPattern.test(resp.url());
    }
  }, { timeout });

  await submit.click();

  const response = await uploadResponsePromise;
  if (!response.ok()) {
    throw new Error(`CSV upload failed with ${response.status()} ${response.statusText()}`);
  }

  if (expectToast) {
    await page.getByText(/success|csv ingested successfully/i, { exact: false }).first().waitFor({ timeout }).catch(() => undefined);
  }

  return { response };
}

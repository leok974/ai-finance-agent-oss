import { describe, it, expect, vi, beforeEach } from 'vitest';
// Use existing uploadCsv from lib/api.ts (already implemented there)
import { uploadCsv } from '@/lib/api';

const okJSON = (data: Record<string, unknown>, init: Partial<ResponseInit> = {}) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
    ...init,
  });

const errJSON = (status: number, data: Record<string, unknown>, init: Partial<ResponseInit> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    ...init,
  });

// Minimal File fallback if environment lacks a real File constructor
const FileCtor: typeof File = (globalThis as unknown as { File?: typeof File }).File || (class FileShim extends Blob {
  name: string;
  constructor(chunks: BlobPart[], name: string, opts: BlobPropertyBag = {}) {
    super(chunks, opts);
    this.name = name;
  }
} as unknown as typeof File);

describe('api/ingest.uploadCsv', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('POSTs multipart to /ingest?replace=false with named file (File input)', async () => {
    const file = new FileCtor([`date,amount,merchant\n2025-01-01,12.34,Coffee\n`], 'test.csv', {
      type: 'text/csv',
    });

    const spy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input, init) => {
      expect(typeof input).toBe('string');
      expect(input).toBe('/ingest?replace=false'); // No /api prefix per copilot-instructions
      expect(init?.method).toBe('POST');

      const fd = init?.body as FormData;
      expect(fd).toBeInstanceOf(FormData);
      const part = fd.get('file') as File;
      expect(part).toBeTruthy();
  expect((part as unknown as { name: string }).name).toBe('test.csv');
      return okJSON({ success: true, rows: 1 });
    });

  const res = await uploadCsv(file as unknown as File, false);
    expect(res).toEqual({ success: true, rows: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('sets replace=true when requested and defaults filename to upload.csv for Blob', async () => {
    const blob = new Blob([`date,amount\n2025-02-01,99.99\n`], { type: 'text/csv' });

    const spy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input, init) => {
      expect(typeof input).toBe('string');
      expect(input).toBe('/ingest?replace=true'); // No /api prefix per copilot-instructions
      expect(init?.method).toBe('POST');
      const fd = init?.body as FormData;
      const part = fd.get('file') as File;
      expect(part).toBeTruthy();
  expect((part as unknown as { name: string }).name).toBe('upload.csv');
      return okJSON({ success: true });
    });

  const res = await uploadCsv(blob as unknown as File, true);
    expect(res).toEqual({ success: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('propagates backend JSON errors via fetchJSON', async () => {
    const file = new FileCtor([`date,amount,merchant\n2025-01-01,12.34,Coffee\n`], 'bad.csv', {
      type: 'text/csv',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      errJSON(400, { error: 'bad_csv', message: 'Invalid header' })
    );

  await expect(uploadCsv(file as unknown as File, false)).rejects.toThrow(/HTTP 400/i);
  });
});

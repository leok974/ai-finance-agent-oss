import { fetchJSON } from '@/lib/fetchJSON';

export type IngestResult = {
  success: boolean;
  rows?: number;
  message?: string;
  errors?: Array<{ line?: number; reason: string }>;
};

/** POST /ingest?replace=bool with multipart file */
export async function uploadCsv(file: File | Blob, replace = false) {
  const fd = new FormData();
  const name = (file as File)?.name || 'upload.csv';
  fd.append('file', file, name);
  return fetchJSON<IngestResult>(`/ingest?replace=${replace}`, { method: 'POST', body: fd });
}

export default { uploadCsv };

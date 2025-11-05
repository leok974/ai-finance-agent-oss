import { fetchLatestMonth as coreFetchLatestMonth } from '@/lib/api';

// Single shim: adapts existing core function (returns string|null) to object shape.
export async function fetchLatestMonth(): Promise<{ month: string | null }> {
  const m = await coreFetchLatestMonth();
  return { month: m };
}

export default { fetchLatestMonth };

// Simple stable hash for filters object for analytics grouping.
export function hashFilters(obj: any): string {
  if (!obj || typeof obj !== 'object') return 'none';
  try {
    const stable = JSON.stringify(sortObj(obj));
    let h = 0, i = 0, len = stable.length;
    for (; i < len; i++) {
      h = (Math.imul(31, h) + stable.charCodeAt(i)) | 0;
    }
    return 'f' + (h >>> 0).toString(16);
  } catch {
    return 'none';
  }
}

function sortObj(o: any): any {
  if (Array.isArray(o)) return o.map(sortObj);
  if (o && typeof o === 'object') {
    return Object.keys(o).sort().reduce((acc, k) => { acc[k] = sortObj(o[k]); return acc; }, {} as any);
  }
  return o;
}

export default hashFilters;
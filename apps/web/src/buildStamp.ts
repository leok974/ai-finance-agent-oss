/**
 * Central build metadata for console banners and diagnostics
 */

declare const __WEB_BRANCH__: string | undefined;
declare const __WEB_COMMIT__: string | undefined;
declare const __WEB_BUILD_TIME__: string | undefined;

// Fallback to import.meta.env or window globals if Vite defines are undefined
const getBranch = () => {
  if (typeof __WEB_BRANCH__ !== 'undefined' && __WEB_BRANCH__ !== 'unknown') return __WEB_BRANCH__;
  if (import.meta.env.VITE_BUILD_BRANCH) return import.meta.env.VITE_BUILD_BRANCH;
  if ((window as any).__LM_BRANCH__) return (window as any).__LM_BRANCH__;
  return 'local';
};

const getCommit = () => {
  if (typeof __WEB_COMMIT__ !== 'undefined' && __WEB_COMMIT__ !== 'unknown') {
    return __WEB_COMMIT__.slice(0, 7);
  }
  if (import.meta.env.VITE_BUILD_COMMIT) {
    return import.meta.env.VITE_BUILD_COMMIT.slice(0, 7);
  }
  if ((window as any).__LM_COMMIT__) {
    return (window as any).__LM_COMMIT__.slice(0, 7);
  }
  return 'dev';
};

const getBuildTime = () => {
  if (typeof __WEB_BUILD_TIME__ !== 'undefined' && __WEB_BUILD_TIME__ !== 'unknown') {
    return __WEB_BUILD_TIME__;
  }
  if (import.meta.env.VITE_BUILD_TIME) return import.meta.env.VITE_BUILD_TIME;
  return new Date().toISOString();
};

const BRANCH = getBranch();
const COMMIT = getCommit();
const BUILD_TIME = getBuildTime();

export const BUILD_STAMP = `${BRANCH}@${COMMIT} (${BUILD_TIME})`;

export const BUILD_INFO = {
  branch: BRANCH,
  commit: COMMIT,
  buildTime: BUILD_TIME,
};

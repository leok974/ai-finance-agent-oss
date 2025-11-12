/**
 * Retry Logic with Exponential Backoff
 * 
 * Defensive measures for transient network failures and rate limiting.
 */

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
};

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  shouldRetry: (error: unknown) => {
    // Retry on network errors, 429 (rate limit), 502/503/504 (server errors)
    if (error && typeof error === 'object' && 'message' in error) {
      const msg = String(error.message);
      return (
        msg.includes('429') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('fetch failed')
      );
    }
    return false;
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if we shouldn't or if it's the last attempt
      if (!opts.shouldRetry(error) || attempt === opts.maxAttempts) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt - 1),
        opts.maxDelayMs
      );
      
      console.warn(
        `[retry] Attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${delay}ms...`,
        error
      );
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Wrap an API function to automatically retry on failure
 */
export function withRetryWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return withRetry(() => fn(...args), options);
  };
}

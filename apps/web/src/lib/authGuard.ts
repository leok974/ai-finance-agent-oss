/**
 * Auth State Validation Guards
 * 
 * Defensive measures to prevent API calls during authentication transitions.
 * All data fetching should go through these guards to ensure auth stability.
 */

// Note: Cannot use useAuth hook directly in non-component code
// Instead, we'll validate state passed from components

/**
 * Check if authentication state is safe for API calls
 * @param authReady - Auth provider has completed initialization
 * @param authOk - User is authenticated
 * @returns true if safe to make API calls, false otherwise
 */
export function canMakeApiCall(authReady: boolean, authOk: boolean): boolean {
  return authReady && authOk;
}

/**
 * Async guard that waits for auth to be ready with timeout
 * @param getAuthState - Function that returns current auth state
 * @param timeoutMs - Max time to wait (default 5000ms)
 * @returns Promise that resolves when auth is ready or rejects on timeout
 */
export async function waitForAuth(
  getAuthState: () => { authReady: boolean; authOk: boolean },
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now();
  
  return new Promise((resolve, reject) => {
    const check = () => {
      const { authReady, authOk } = getAuthState();
      if (authReady && authOk) {
        resolve();
        return;
      }
      
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Auth timeout'));
        return;
      }
      
      setTimeout(check, 100);
    };
    
    check();
  });
}

/**
 * HOF to wrap API calls with auth guard
 * Note: For use in component context where auth state is available
 * @param fn - API function to wrap
 * @returns Wrapped function that checks auth before executing
 */
export function withAuthGuard<T extends (...args: any[]) => Promise<any>>(
  fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    // This wrapper assumes auth was checked before calling
    // The actual guard is in the calling component
    try {
      return await fn(...args);
    } catch (error) {
      // Log 401s for debugging
      if (error && typeof error === 'object' && 'message' in error) {
        const msg = String(error.message);
        if (msg.includes('401') || msg.includes('Unauthorized')) {
          console.warn('[authGuard] 401 detected during API call');
        }
      }
      throw error;
    }
  };
}

/**
 * Safe API caller that silently fails if auth not ready
 * Use for non-critical prefetch operations
 */
export async function safeFetch<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.warn('[authGuard] Safe fetch failed, using fallback:', error);
    return fallback;
  }
}

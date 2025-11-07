/**
 * Auth State Validation Guards
 * 
 * Defensive measures to prevent API calls during authentication transitions.
 * All data fetching should go through these guards to ensure auth stability.
 */

import { useAuthStore } from '@/state/auth';

/**
 * Check if authentication is ready and user is authenticated
 * @returns true if safe to make API calls, false otherwise
 */
export function canMakeApiCall(): boolean {
  const { authReady, authOk } = useAuthStore.getState();
  return authReady && authOk;
}

/**
 * Async guard that waits for auth to be ready with timeout
 * @param timeoutMs - Max time to wait (default 5000ms)
 * @returns Promise that resolves when auth is ready or rejects on timeout
 */
export async function waitForAuth(timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  
  return new Promise((resolve, reject) => {
    const check = () => {
      if (canMakeApiCall()) {
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
 * @param fn - API function to wrap
 * @returns Wrapped function that checks auth before executing
 */
export function withAuthGuard<T extends (...args: any[]) => Promise<any>>(
  fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    if (!canMakeApiCall()) {
      console.warn('[authGuard] Blocking API call - auth not ready');
      throw new Error('Authentication not ready');
    }
    
    try {
      return await fn(...args);
    } catch (error) {
      // If we get 401, update auth state
      if (error && typeof error === 'object' && 'message' in error) {
        const msg = String(error.message);
        if (msg.includes('401') || msg.includes('Unauthorized')) {
          console.warn('[authGuard] 401 detected, auth may have expired');
          useAuthStore.getState().setAuthOk(false);
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
  if (!canMakeApiCall()) {
    return fallback;
  }
  
  try {
    return await fn();
  } catch (error) {
    console.warn('[authGuard] Safe fetch failed:', error);
    return fallback;
  }
}

/**
 * React hook to get current auth gate status
 */
export function useAuthGate() {
  const { authReady, authOk } = useAuthStore();
  
  return {
    canFetch: authReady && authOk,
    authReady,
    authOk,
    isTransitioning: !authReady,
  };
}

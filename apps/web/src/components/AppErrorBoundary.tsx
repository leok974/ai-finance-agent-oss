import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  err?: any;
}

/**
 * Top-level error boundary to prevent entire app crashes.
 * Catches errors during render, lifecycle methods, and in constructors
 * of the whole tree below it.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { err: undefined };

  static getDerivedStateFromError(err: any): State {
    // Update state so next render shows fallback UI
    return { err };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    // Log error details for debugging
    console.error('[AppErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.err) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full p-6 border border-red-500/40 bg-red-500/5 text-red-400 rounded-lg">
            <div className="font-semibold text-lg mb-2">Something went wrong</div>
            <div className="text-sm opacity-90 mb-4">
              The application encountered an unexpected error. Please refresh the page to try again.
            </div>
            <div className="text-xs opacity-70 font-mono bg-black/20 p-3 rounded overflow-auto max-h-32 break-all">
              {String(this.state.err?.message || this.state.err)}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import React from 'react';

type State = { hasError: boolean; info?: string };

export class ChatErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(_err: unknown): State {
    // One-time flip. Do not setState in componentDidCatch again.
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    // LOG ONLY — no setState here, avoids depth loops
    // eslint-disable-next-line no-console
    console.error('[chat] ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div data-chat-fallback>Something went wrong loading chat.</div>;
    }
    return this.props.children;
  }
}

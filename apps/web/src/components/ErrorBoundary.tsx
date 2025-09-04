import React from "react";

export default class ErrorBoundary extends React.Component<{
  fallback: (e: any) => React.ReactNode;
  children?: React.ReactNode;
}, { err: any }> {
  constructor(props: any) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err: any) {
    return { err };
  }
  componentDidCatch() {
    // no-op
  }
  render() {
    return this.state.err ? this.props.fallback(this.state.err) : this.props.children as any;
  }
}

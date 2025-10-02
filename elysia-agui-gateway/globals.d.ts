// Minimal globals for the gateway runtime
declare const Bun: {
  sleep(ms: number): Promise<void>
} | undefined;

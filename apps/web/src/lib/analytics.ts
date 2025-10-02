// Lightweight analytics helper wrapping existing api telemetry.track
import { telemetry } from "@/lib/api";

export function track(event: string, props?: Record<string, any>) {
  try {
    telemetry.track(event, props);
  } catch (e) {
    // swallow
  }
}

export default { track };
import { runToolWithRephrase } from "@/lib/tools-runner";

/**
 * Thin wrapper for deterministic tool run + LLM rephrase into chat.
 * Keeps a simpler name for callers while delegating to the shared runner.
 */
export async function runAndRephrase<T>(
  tool: string,
  fetcher: () => Promise<T>,
  promptBuilder: (data: T) => string,
  appendAssistant: (msg: string, meta?: any) => void,
  setThinking: (on: boolean) => void,
  buildRephraseMeta?: () => Record<string, any>
) {
  return runToolWithRephrase(tool, fetcher, promptBuilder, appendAssistant, setThinking, buildRephraseMeta);
}

export default runAndRephrase;

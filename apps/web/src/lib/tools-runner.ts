import { agentRephrase } from "./api";

export async function runToolWithRephrase<T>(
  tool: string,
  fetcher: () => Promise<T>,
  promptBuilder: (data: T) => string,
  appendAssistant: (msg: string, meta?: any) => void,
  setThinking: (on: boolean) => void,
  buildRephraseMeta?: () => Record<string, any>
) {
  console.debug(`[tools] ${tool} → fetch`);
  setThinking(true);
  try {
    // No text placeholder; rely on UI spinner via setThinking(true)

    const data = await fetcher();
    let prompt = "";
    try {
      prompt = promptBuilder(data);
    } catch (e: any) {
      console.error(`[tools] ${tool} promptBuilder failed`, e);
      prompt = `Explain briefly why there is no data or an error for ${tool}: ${e?.message ?? e}`;
    }

    console.debug(`[tools] ${tool} → rephrase`, { prompt: (prompt || '').slice(0, 160) });
    const extra = (typeof buildRephraseMeta === 'function' ? (buildRephraseMeta() || {}) : {});

    // Try to rephrase via LLM, but fall back to raw prompt if it fails
    let finalReply = prompt;
    let model: string | undefined;
    try {
      const llm = await agentRephrase(prompt);
      finalReply = llm.reply ?? prompt;
      model = llm.model;
      console.debug(`[tools] ${tool} ← rephrase ok`, { model });
    } catch (rephraseErr: any) {
      console.warn(`[tools] ${tool} rephrase failed, using raw prompt`, rephraseErr);
      // Don't throw - just use the raw prompt as fallback
    }

    // Surface mode/args/tool to the UI so ModeChip can render
    appendAssistant(finalReply, { model, grounded: true, tool, mode: tool, ...extra });
  } catch (e: any) {
    console.error(`[tools] ${tool} failed`, e);
    appendAssistant(`Sorry, ${tool} failed: ${e?.message ?? e}`, { severity: "error", tool });
  } finally {
    setThinking(false);
  }
}

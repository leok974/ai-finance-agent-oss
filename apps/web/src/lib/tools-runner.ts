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
    // small placeholder so users see activity immediately
    appendAssistant("(thinking…)", { ephemeral: true, tool });

    const data = await fetcher();
    let prompt = "";
    try {
      prompt = promptBuilder(data);
    } catch (e: any) {
      console.error(`[tools] ${tool} promptBuilder failed`, e);
      prompt = `Explain briefly why there is no data or an error for ${tool}: ${e?.message ?? e}`;
    }
  console.debug(`[tools] ${tool} → /agent/chat`, { prompt: (prompt || '').slice(0, 160) });
  const extra = (typeof buildRephraseMeta === 'function' ? (buildRephraseMeta() || {}) : {});
  const llm = await agentRephrase(prompt, { mode: tool, ...extra });
  console.debug(`[tools] ${tool} ← /agent/chat ok`, { model: llm?.model });

    appendAssistant(llm.reply ?? "", { model: llm.model, grounded: true, tool });
  } catch (e: any) {
    console.error(`[tools] ${tool} failed`, e);
    appendAssistant(`Sorry, ${tool} failed: ${e?.message ?? e}`, { severity: "error", tool });
  } finally {
    setThinking(false);
  }
}

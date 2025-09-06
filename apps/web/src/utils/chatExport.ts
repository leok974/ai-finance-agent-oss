import { downloadText } from "./download";

export type BasicMsg = { role: string; content: string; createdAt?: number };
export type ExportThread = { title: string; messages: BasicMsg[]; exportedAt: string };

function pad(n: number) { return String(n).padStart(2, "0"); }
function tsISO(ms?: number) {
  const d = ms ? new Date(ms) : new Date();
  return d.toISOString();
}
function stampForFilename(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function serializeJSON(thread: ExportThread) {
  return JSON.stringify(thread, null, 2);
}

export function serializeMarkdown(thread: ExportThread) {
  const lines: string[] = [];
  lines.push(`# Chat Export — ${thread.title}`);
  lines.push(`_Exported at: ${thread.exportedAt}_`);
  lines.push("");
  for (const m of thread.messages) {
    const who = (m.role || '').toUpperCase();
    const when = tsISO(m.createdAt);
    lines.push(`## ${who} — ${when}`);
    lines.push("");
    lines.push(m.content || "");
    lines.push("");
  }
  return lines.join("\n");
}

export function exportThreadAsJSON(title: string, messages: BasicMsg[]) {
  const now = new Date();
  const payload: ExportThread = { title, messages, exportedAt: tsISO(now.getTime()) };
  const name = `${title || "chat"}-${stampForFilename(now)}.json`;
  downloadText(name, serializeJSON(payload));
}

export function exportThreadAsMarkdown(title: string, messages: BasicMsg[]) {
  const now = new Date();
  const payload: ExportThread = { title, messages, exportedAt: tsISO(now.getTime()) };
  const name = `${title || "chat"}-${stampForFilename(now)}.md`;
  downloadText(name, serializeMarkdown(payload));
}

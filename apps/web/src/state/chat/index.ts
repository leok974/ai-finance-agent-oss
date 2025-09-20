export type AssistantPayload = {
  reply: string;
  rephrased?: boolean;
  suggestions?: any[];
  meta?: Record<string, any>;
};

type PushAssistantHandler = (payload: AssistantPayload) => void;
type PushUserHandler = (content: string) => void;
type CallToolHandler = (tool: string, payload?: Record<string, any>) => Promise<any>;

type ChatHandlers = {
  pushAssistant: PushAssistantHandler;
  pushUser: PushUserHandler;
  callTool: CallToolHandler;
};

const fallbackHandlers: ChatHandlers = {
  pushAssistant() {
    console.warn("Chat assistant handler not registered.");
  },
  pushUser() {
    console.warn("Chat user handler not registered.");
  },
  async callTool() {
    throw new Error("Chat tool handler not registered.");
  },
};

let handlers: ChatHandlers = fallbackHandlers;

export function registerChatHandlers(next: ChatHandlers) {
  handlers = next;
  return () => {
    if (handlers === next) {
      handlers = fallbackHandlers;
    }
  };
}

export function pushAssistant(payload: AssistantPayload) {
  handlers.pushAssistant(payload);
}

export function pushUser(content: string) {
  handlers.pushUser(content);
}

export async function callTool(tool: string, payload?: Record<string, any>) {
  return handlers.callTool(tool, payload);
}

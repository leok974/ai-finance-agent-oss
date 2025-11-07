import { useState, useImperativeHandle, forwardRef, useRef } from "react";
import { useChatSession } from "@/state/chatSession";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { telemetry, AGENT_TOOL_EVENTS } from "@/lib/telemetry";

export interface ChatControlsRef {
  openClearModal: () => void;
  openResetModal: () => void;
  abortRequest?: () => void; // Optional abort callback set from parent
}

export const ChatControls = forwardRef<ChatControlsRef>((props, ref) => {
  const { clearChat, resetSession, isBusy } = useChatSession();
  const [open, setOpen] = useState<null | "clear" | "reset">(null);
  const { toast } = useToast();
  const abortRequestRef = useRef<(() => void) | null>(null);

  useImperativeHandle(ref, () => ({
    openClearModal: () => setOpen("clear"),
    openResetModal: () => setOpen("reset"),
    abortRequest: abortRequestRef.current || undefined,
  }));

  return (
    <div className="flex gap-2">
      <Button
        variant="pill-outline"
        onClick={() => {
          telemetry.track(AGENT_TOOL_EVENTS.CLEAR);
          setOpen("clear");
        }}
        data-testid="agent-tool-clear"
        title="Remove messages in this thread (model state unchanged)"
      >
        Clear
      </Button>
      {/* Reset removed from inline toolbar - access via Ctrl+Shift+R or Dev menu */}

      <Dialog open={!!open} onOpenChange={() => setOpen(null)}>
        <DialogContent data-testid={open === "clear" ? "modal-clear" : "modal-reset"}>
          <DialogHeader>
            <DialogTitle>
              {open === "clear" ? "Clear chat history?" : "Reset session?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {open === "clear"
              ? "This will remove the visible messages for this thread across all open tabs."
              : "This will start a fresh session and clear the assistant's memory for this chat."}
          </p>
          <DialogFooter>
            <Button
              variant="pill-outline"
              onClick={() => setOpen(null)}
              data-testid="modal-cancel"
            >
              Cancel
            </Button>
            <Button
              variant={open === "clear" ? "pill-outline" : "pill-danger"}
              disabled={isBusy}
              data-testid={open === "clear" ? "modal-clear-confirm" : "modal-reset-confirm"}
              onClick={async () => {
                if (open === "clear") {
                  // Cancel any in-flight requests before clearing
                  if (abortRequestRef.current) {
                    abortRequestRef.current();
                  }

                  clearChat(); // Now synchronous
                  toast({
                    title: "Chat cleared",
                    description: "Messages removed (thread only).",
                    duration: 3000,
                  });
                } else {
                  await resetSession();
                  toast({
                    title: "Session reset",
                    description: "Fresh start — model context cleared.",
                    duration: 3000,
                  });
                }
                setOpen(null);
              }}
            >
              {open === "clear" ? "Clear chat" : "Reset session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

ChatControls.displayName = "ChatControls";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import TransactionsPanel from "@/components/TransactionsPanel";
import { getPortalRoot } from "@/lib/portal";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function TransactionsDrawer({ open, onClose }: Props) {
  const portalContainer = React.useMemo(() => getPortalRoot(), []);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-[2px]" />
        <Dialog.Content
          className="transactions-drawer fixed right-0 top-0 h-full w-full overflow-y-auto bg-[rgb(26,28,33)] text-zinc-100 ring-1 ring-white/10 border-l border-white/5 shadow-2xl max-w-[920px] outline-none"
        >
          <header className="sticky top-0 bg-[rgb(26,28,33)]/95 backdrop-blur px-4 py-3 border-b border-white/5">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-base font-semibold">Transactions</Dialog.Title>
              <Dialog.Close asChild>
                <button className="text-sm opacity-80 hover:opacity-100" aria-label="Close">Close</button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="mt-2 text-[11px] opacity-75">
              View and manage your transactions
            </Dialog.Description>
          </header>
          <div className="px-4 py-4 space-y-3">
            <TransactionsPanel />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

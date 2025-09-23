import { Button } from "@/components/ui/button";
import { ListFilter } from "lucide-react";

type Props = { open: boolean; onOpen: () => void };

export default function TransactionsButton({ open, onOpen }: Props) {
  return (
    <Button
      variant="pill"
      size="sm"
      active={open}
      aria-pressed={open}
      onClick={onOpen}
      className="gap-2"
    >
      <ListFilter className="h-4 w-4 opacity-80" aria-hidden="true" />
      <span>Transactions</span>
      {/* optional unread/unknowns dot */}
      {/* <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-400" /> */}
    </Button>
  );
}

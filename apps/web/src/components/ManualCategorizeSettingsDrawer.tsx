import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from '@/components/ui/drawer';
import { manualCategorizeUndo, type ManualCategorizeResponse } from '@/lib/http';
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers';
import { CATEGORY_DEFS } from '@/lib/categories';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ManualCategorizeSettingsDrawer({ open, onOpenChange }: Props) {
  const [lastChange, setLastChange] = React.useState<ManualCategorizeResponse | null>(null);
  const [isUndoing, setIsUndoing] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    try {
      const raw = window.localStorage.getItem('lm:lastManualCategorize');
      if (!raw) {
        setLastChange(null);
        return;
      }
      const parsed = JSON.parse(raw) as ManualCategorizeResponse;
      setLastChange(parsed);
    } catch {
      setLastChange(null);
    }
  }, [open]);

  const handleUndo = async () => {
    if (!lastChange || !lastChange.affected.length) return;
    try {
      setIsUndoing(true);
      const res = await manualCategorizeUndo(lastChange.affected);
      if (res.reverted_count > 0) {
        emitToastSuccess(
          `Reverted ${res.reverted_count} transaction${res.reverted_count === 1 ? '' : 's'}.`
        );
      } else {
        toast.info('Nothing to revert.');
      }
      window.localStorage.removeItem('lm:lastManualCategorize');
      setLastChange(null);
    } catch (err) {
      console.error(err);
      emitToastError('Unable to undo last manual categorization.');
    } finally {
      setIsUndoing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Math.abs(amount));
  };

  const getCategoryLabel = (slug: string) => {
    return CATEGORY_DEFS[slug]?.label || slug;
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="border-slate-800 bg-slate-950">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
          <DrawerHeader className="px-0">
            <DrawerTitle>Manual categorization</DrawerTitle>
            <DrawerDescription>
              Review your last bulk categorization and undo it if needed.
            </DrawerDescription>
          </DrawerHeader>

          {!lastChange ? (
            <p className="text-sm text-slate-400">
              No manual bulk categorization found for this browser. Categorize unknown
              transactions from the Transactions → Unknowns panel to see them here.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-50">Last bulk change</p>
                <p className="text-xs text-slate-400">
                  Scope: <span className="font-mono">{lastChange.scope}</span> · Category:{' '}
                  {getCategoryLabel(lastChange.category_slug)} · Updated {lastChange.updated_count}{' '}
                  transaction
                  {lastChange.updated_count === 1 ? '' : 's'}
                </p>
              </div>

              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-slate-900/60 p-2 text-xs text-slate-300">
                {lastChange.affected.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-slate-900/80 px-2 py-1"
                  >
                    <span className="truncate">
                      {t.date} — {t.merchant}
                    </span>
                    <span className="tabular-nums">{formatCurrency(t.amount)}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-400">
                  Undo only affects transactions that still have the same category you applied in
                  that bulk change.
                </p>
                <Button
                  size="sm"
                  variant="default"
                  disabled={isUndoing}
                  onClick={handleUndo}
                  className="shrink-0"
                >
                  {isUndoing ? 'Undoing…' : 'Undo this change'}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-2 flex justify-end">
            <DrawerClose asChild>
              <Button variant="pill-ghost" size="sm">
                Close
              </Button>
            </DrawerClose>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

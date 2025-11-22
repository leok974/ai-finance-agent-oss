import React, { useEffect, useState } from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { listRules, updateRule, deleteRule, type Rule } from '@/lib/api';
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManualCategorizeSettingsDrawer } from '@/components/ManualCategorizeSettingsDrawer';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ open, onClose }) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualDrawerOpen, setManualDrawerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await listRules();
        if (!cancelled) {
          setRules((data as any).items ?? data ?? []);
        }
      } catch (err) {
        console.error('Failed to load rules', err);
        if (!cancelled) {
          emitToastError('Failed to load rules', {
            description: 'Please try again.',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleToggleActive = async (rule: Rule) => {
    try {
      const updated = await updateRule(rule.id, { enabled: !rule.enabled });

      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, ...updated } : r)));

      emitToastSuccess(updated.enabled ? 'Rule enabled' : 'Rule disabled', {
        description: `We'll ${updated.enabled ? 'apply' : 'stop applying'} "${
          (updated as any).category_label ?? (updated as any).then?.category ?? 'this category'
        }" for matching transactions.`,
      });
    } catch (err) {
      console.error('Failed to update rule', err);
      emitToastError('Failed to update rule', {
        description: 'Please try again.',
      });
    }
  };

  const handleDelete = async (rule: Rule) => {
    const confirmed = confirm(
      `Delete rule "${rule.name}"?\n\nWe'll stop auto-categorizing matches.`
    );
    if (!confirmed) return;

    try {
      await deleteRule(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));

      emitToastSuccess('Rule deleted', {
        description: `We'll stop auto-categorizing matches as "${
          (rule as any).category_label ?? (rule as any).then?.category ?? 'this category'
        }".`,
      });
    } catch (err) {
      console.error('Failed to delete rule', err);
      emitToastError('Failed to delete rule', {
        description: 'Please try again.',
      });
    }
  };

  // Extract pattern display from rule
  const getMerchantPattern = (rule: Rule) => {
    const when = (rule as any).when;
    return when?.merchant_like || when?.description_like || 'Any';
  };

  const getCategory = (rule: Rule) => {
    const then = (rule as any).then;
    return (rule as any).category_label || then?.category || 'Uncategorized';
  };

  return (
    <>
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent
        className="fixed inset-x-0 bottom-0 max-h-[85vh] flex flex-col rounded-t-2xl border-t border-slate-700/80 bg-slate-900/95 shadow-xl shadow-black/40"
        data-testid="settings-drawer"
      >
        <DrawerHeader className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex-1">
            <DrawerTitle className="text-base font-semibold text-slate-100">
              Settings
            </DrawerTitle>
            <DrawerDescription className="mt-0.5 text-xs text-slate-400">
              Auto-categorization rules
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button
              variant="pill-ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-slate-800"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </DrawerClose>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Manual categorization section */}
          <div className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Data & categorization
            </h3>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl bg-slate-900/60 px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-900 transition-colors"
              onClick={() => setManualDrawerOpen(true)}
            >
              <span>
                <span className="block">Manual categorization</span>
                <span className="block text-[11px] font-normal text-slate-400">
                  Review and undo your last bulk category change.
                </span>
              </span>
              <span className="text-xs text-slate-500">Open</span>
            </button>
          </div>

          {/* Auto-categorization rules section */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Auto-categorization rules
            </h3>
            <p className="mb-3 text-xs text-slate-400">
              Rules teach LedgerMind how to auto-label future transactions. Editing or disabling a
              rule updates how the model behaves for matching merchants and descriptions.
            </p>
          </div>

          {loading && <p className="text-xs text-slate-400">Loading rules…</p>}

          {!loading && rules.length === 0 && (
            <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-4 text-center">
              <p className="text-xs text-slate-500">
                No rules yet. Create one from the "Seed rule" button on an uncategorized
                transaction.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 transition-colors hover:border-slate-700"
                data-testid="settings-rule-row"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-xs font-semibold text-slate-100">
                      {getCategory(rule)}
                    </span>
                    <span className="truncate text-[11px] text-slate-400">
                      Pattern: {getMerchantPattern(rule)}
                    </span>
                    {rule.name && rule.name !== `${getMerchantPattern(rule)} → ${getCategory(rule)}` && (
                      <span className="truncate text-[11px] text-slate-500">
                        Name: {rule.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(rule)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        rule.enabled
                          ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/60'
                          : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:bg-slate-800'
                      }`}
                      data-testid="settings-rule-toggle"
                    >
                      {rule.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rule)}
                      className="rounded-full border border-red-800/60 px-2 py-0.5 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-950"
                      data-testid="settings-rule-delete"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>

    {/* Manual categorization drawer */}
    <ManualCategorizeSettingsDrawer
      open={manualDrawerOpen}
      onOpenChange={setManualDrawerOpen}
    />
    </>
  );
};

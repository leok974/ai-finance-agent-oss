/**
 * CategoryCell - Inline category picker for transactions
 * Single-click to edit, shows ML suggestions + searchable category list
 */
import { useState, useEffect } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { telemetry, CATEGORY_PICKER_EVENTS } from '@/lib/telemetry';

type Candidate = {
  label: string;
  confidence?: number;
};

type CategoryCellProps = {
  txnId: number;
  merchant?: string | null;
  category?: string | null;
  suggestions?: Candidate[];
  allCategories: string[];
  onSave: (params: { category: string; makeRule: boolean }) => Promise<void>;
  disabled?: boolean;
};

export function CategoryCell({
  txnId,
  merchant,
  category,
  suggestions = [],
  allCategories,
  onSave,
  disabled = false,
}: CategoryCellProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(category ?? '');
  const [search, setSearch] = useState('');
  const [makeRule, setMakeRule] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Reset value when category prop changes
  useEffect(() => {
    setValue(category ?? '');
  }, [category]);

  // Track open/close events
  useEffect(() => {
    if (open) {
      telemetry.track(CATEGORY_PICKER_EVENTS.OPENED, {
        txnId,
        merchant: merchant || 'unknown',
        currentCategory: category || 'uncategorized',
        suggestionsCount: suggestions.length,
        categoriesCount: allCategories.length,
      });
    } else if (!open && value !== (category ?? '')) {
      // Closed without saving (cancelled)
      telemetry.track(CATEGORY_PICKER_EVENTS.CLOSED, {
        txnId,
        saved: false,
      });
    }
  }, [open, txnId, merchant, category, suggestions.length, allCategories.length, value]);

  // Show "just saved" animation
  useEffect(() => {
    if (justSaved) {
      const timer = setTimeout(() => setJustSaved(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [justSaved]);

  const handleSave = async () => {
    if (!value || saving) return;

    setSaving(true);
    try {
      // Track save event with telemetry
      telemetry.track(
        makeRule ? CATEGORY_PICKER_EVENTS.SAVE_WITH_RULE : CATEGORY_PICKER_EVENTS.SAVE,
        {
          txnId,
          merchant: merchant || 'unknown',
          oldCategory: category || 'uncategorized',
          newCategory: value,
          wasFromSuggestion: suggestions.some((s) => s.label === value),
          suggestionConfidence: suggestions.find((s) => s.label === value)?.confidence,
          makeRule,
        }
      );

      await onSave({ category: value, makeRule });
      setOpen(false);
      setMakeRule(false); // Reset checkbox
      setJustSaved(true);
    } catch (error) {
      console.error('Failed to save category:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (selectedCategory: string) => {
    setValue(selectedCategory);
    setSearch('');

    // Track selection source
    const isFromSuggestion = suggestions.some((s) => s.label === selectedCategory);
    const suggestion = suggestions.find((s) => s.label === selectedCategory);

    telemetry.track(
      isFromSuggestion ? CATEGORY_PICKER_EVENTS.SELECT_SUGGESTION : CATEGORY_PICKER_EVENTS.SELECT_CATEGORY,
      {
        category: selectedCategory,
        confidence: suggestion?.confidence,
        searchQuery: search,
        txnId,
        merchant: merchant || 'unknown',
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value) {
      e.preventDefault();
      if (e.shiftKey) {
        setMakeRule(true);
        // Wait for state update then save
        setTimeout(() => handleSave(), 0);
      } else {
        handleSave();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setValue(category ?? '');
      setSearch('');
    }
  };

  // Filter categories based on search
  const filteredCategories = allCategories
    .filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 20);

  // Track search with debouncing (avoid spamming events)
  useEffect(() => {
    if (!search || search.length < 2) return;

    const timer = setTimeout(() => {
      telemetry.track(CATEGORY_PICKER_EVENTS.SEARCH, {
        query: search,
        resultsCount: filteredCategories.length,
        txnId,
      });
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [search, filteredCategories.length, txnId]);

  return (
    <div
      className={`inline-flex items-center transition-colors duration-300 ${
        justSaved ? 'animate-pulse-success' : ''
      }`}
      data-testid={`category-cell-${txnId}`}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="group inline-flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={disabled}
            aria-label={`Edit category for ${merchant || 'transaction'}`}
            data-testid={`category-button-${txnId}`}
          >
            <Badge
              variant={category ? 'secondary' : 'outline'}
              className="transition-colors group-hover:bg-white/10"
            >
              {category ?? 'uncategorized'}
            </Badge>
            <ChevronDown className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-80 p-0"
          align="start"
          onKeyDown={handleKeyDown}
          data-testid={`category-picker-${txnId}`}
        >
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search categories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/50"
                data-testid="category-search"
                autoFocus
              />
            </div>
          </div>

          <ScrollArea className="max-h-64 overflow-auto">
            {/* ML Suggestions */}
            {suggestions.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase px-2 py-1">
                  Suggested
                </div>
                {suggestions.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => handleSelect(s.label)}
                    className="w-full flex justify-between items-center px-3 py-2 rounded-md hover:bg-white/5 transition-colors cursor-pointer text-left"
                    data-testid={`suggestion-${s.label}`}
                  >
                    <span>{s.label}</span>
                    {s.confidence !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round(s.confidence * 100)}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* All Categories */}
            <div className="p-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase px-2 py-1">
                All Categories
              </div>
              {filteredCategories.length > 0 ? (
                filteredCategories.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleSelect(c)}
                    className="w-full flex justify-between items-center px-3 py-2 rounded-md hover:bg-white/5 transition-colors cursor-pointer text-left"
                    data-testid={`category-${c}`}
                  >
                    <span>{c}</span>
                    {c === category && (
                      <Check className="ml-auto h-3 w-3 text-primary" />
                    )}
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No categories found.
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer with rule checkbox and actions */}
          <div className="border-t p-3 space-y-3">
            <label className="flex items-center gap-2 text-xs cursor-pointer group">
              <input
                type="checkbox"
                checked={makeRule}
                onChange={(e) => setMakeRule(e.target.checked)}
                className="accent-primary cursor-pointer"
                data-testid="make-rule-checkbox"
              />
              <span className="group-hover:text-foreground transition-colors">
                Make rule for similar
              </span>
            </label>

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {value || 'Select a category'}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="pill-ghost"
                  onClick={() => {
                    telemetry.track(CATEGORY_PICKER_EVENTS.CANCEL, {
                      txnId,
                      hadSelectedValue: !!value,
                      selectedValue: value || null,
                    });
                    setOpen(false);
                    setValue(category ?? '');
                    setSearch('');
                    setMakeRule(false);
                  }}
                  disabled={saving}
                  data-testid="cancel-button"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!value || saving}
                  data-testid="save-button"
                >
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>

            {/* Keyboard hint */}
            <div className="text-[10px] text-muted-foreground/70 text-center">
              ⏎ Save • ⇧⏎ Save + Rule • Esc Cancel
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

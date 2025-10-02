export const DEFAULT_PLACEHOLDER = "Ask or type a command…";
export const SEARCH_PLACEHOLDER = 'Search transactions… e.g. "Starbucks this month"';

type ComposerEl = HTMLTextAreaElement | HTMLInputElement;

type ComposerControls = {
  setValue?: (value: string) => void;
  focus?: () => void;
  setPlaceholder?: (value: string) => void;
  getValue?: () => string;
};

let controls: ComposerControls = {};

function getComposerEl(): ComposerEl | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<ComposerEl>("#chat-composer");
}

export function registerComposerControls(next: ComposerControls) {
  controls = next;
  return () => {
    if (controls === next) {
      controls = {};
    }
  };
}

export function setComposer(value: string) {
  controls.setValue?.(value);

  const el = getComposerEl();
  if (el) {
    el.value = value;
    if (!controls.setValue) {
      const evt = new Event("input", { bubbles: true });
      el.dispatchEvent(evt);
    }
  }
}

export function focusComposer() {
  if (controls.focus) {
    controls.focus();
    return;
  }
  const el = getComposerEl();
  el?.focus();
}

export function setComposerPlaceholder(value: string) {
  controls.setPlaceholder?.(value);
  const el = getComposerEl();
  if (el) el.placeholder = value;
}

export function getComposerValue(): string {
  if (controls.getValue) return controls.getValue();
  const el = getComposerEl();
  return (el?.value ?? "").toString();
}

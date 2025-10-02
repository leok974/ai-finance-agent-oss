import { describe, it, expect } from 'vitest';
import { registerComposerControls, setComposer, focusComposer, setComposerPlaceholder, getComposerValue } from '../ui';

describe('composer UI controls', () => {
  it('falls back to DOM element when no control methods provided', () => {
    // Create a fake textarea element with id chat-composer
    const el = document.createElement('textarea');
    el.id = 'chat-composer';
    document.body.appendChild(el);
    // No controls registered yet
    setComposer('hello');
    expect(el.value).toBe('hello');
    setComposerPlaceholder('Type here');
    expect(el.placeholder).toBe('Type here');
    expect(getComposerValue()).toBe('hello');
    focusComposer(); // should focus underlying element without throwing
    document.body.removeChild(el);
  });

  it('uses registered control callbacks when present', () => {
    let stored = '';
    let placeholder = '';
    let focused = false;
    registerComposerControls({
      setValue(v){ stored = v; },
      setPlaceholder(v){ placeholder = v; },
      focus(){ focused = true; },
      getValue(){ return stored; }
    });
    setComposer('abc');
    setComposerPlaceholder('ph');
    focusComposer();
    expect(stored).toBe('abc');
    expect(placeholder).toBe('ph');
    expect(focused).toBe(true);
    expect(getComposerValue()).toBe('abc');
  });
});

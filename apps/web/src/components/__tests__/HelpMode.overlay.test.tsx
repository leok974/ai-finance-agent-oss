import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import HelpMode from '@/components/HelpMode';

function addExplainNode() {
  const div = document.createElement('div');
  div.setAttribute('data-explain-key', 'cards.month_summary');
  document.body.appendChild(div);
  return div;
}

describe('HelpMode overlay', () => {
  it('applies and removes rings on toggle', async () => {
    const el = addExplainNode();
    render(<HelpMode />);
    // toggle on
    fireEvent.keyDown(window, { key: '?' });
    expect(el.classList.contains('ring-2')).toBe(true);
    // toggle off
    fireEvent.keyDown(window, { key: '?' });
    expect(el.classList.contains('ring-2')).toBe(false);
    el.remove();
  });
});

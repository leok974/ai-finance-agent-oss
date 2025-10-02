import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import AppHelpMode from '@/AppHelpMode';

function addHelpNode() {
  const div = document.createElement('div');
  div.setAttribute('data-help-key', 'cards.unknowns');
  document.body.appendChild(div);
  return div;
}

describe('Help overlay container', () => {
  it('creates and removes #help-rings on toggle', async () => {
    const el = addHelpNode();
    render(<AppHelpMode />);
    // toggle on
    fireEvent.keyDown(window, { key: '?' });
    await waitFor(() => expect(document.getElementById('help-rings')).toBeTruthy());
    const ringsOn = document.getElementById('help-rings')!;
    expect(ringsOn.children.length).toBeGreaterThan(0);
    // toggle off
    fireEvent.keyDown(window, { key: '?' });
    await waitFor(() => expect(document.getElementById('help-rings')).toBeNull());
    el.remove();
  });

  it('renders one ring per [data-help-key] node', async () => {
    // Arrange: create multiple help targets
    const n = 5;
    const nodes: HTMLElement[] = [];
    for (let i = 0; i < n; i++) {
      nodes.push(addHelpNode());
    }
    render(<AppHelpMode />);

    // Act: activate help mode
    fireEvent.keyDown(window, { key: '?' });

    // Assert: wait for container, then check child count equals target count
    await waitFor(() => expect(document.getElementById('help-rings')).toBeTruthy());
    const rings = document.getElementById('help-rings')!;
    expect(rings.children.length).toBe(n);

    // Cleanup
    nodes.forEach((el) => el.remove());
  });
});

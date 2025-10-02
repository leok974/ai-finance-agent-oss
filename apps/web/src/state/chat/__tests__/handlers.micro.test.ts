import { describe, it, expect, vi } from 'vitest';
import { registerChatHandlers, pushAssistant, pushUser, callTool } from '..';

describe('chat handlers register/unregister', () => {
  it('invokes registered handlers then restores fallback', async () => {
    const pa = vi.fn();
    const pu = vi.fn();
    const ct = vi.fn(async () => 'ok');
    const undo = registerChatHandlers({ pushAssistant: pa, pushUser: pu, callTool: ct });
    pushAssistant({ reply: 'hi' });
    pushUser('yo');
    await callTool('tool.x');
    expect(pa).toHaveBeenCalledWith(expect.objectContaining({ reply: 'hi' }));
    expect(pu).toHaveBeenCalledWith('yo');
    expect(ct).toHaveBeenCalledWith('tool.x', undefined);
    undo();
    // After undo, calling callTool should reject (fallback throws)
    await expect(callTool('missing')).rejects.toThrow(/not registered/i);
  });
});

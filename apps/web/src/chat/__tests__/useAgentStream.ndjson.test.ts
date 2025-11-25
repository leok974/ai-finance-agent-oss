import { describe, it, expect } from 'vitest';

/**
 * Test NDJSON parsing logic for agent streaming.
 * This simulates the real-world scenario where multiple JSON objects
 * arrive in a single chunk, separated by newlines.
 */
describe('useAgentStream NDJSON parsing', () => {
  it('handles multiple token events in a single chunk without throwing', () => {
    // Simulate the exact error case we saw in production
    const lines = [
      `{"type":"token","data":{"text":"I"}}`,
      `{"type":"token","data":{"text":" "}}`,
      `{"type":"token","data":{"text":"d"}}`,
      `{"type":"token","data":{"text":"o"}}`,
      `{"type":"token","data":{"text":"n"}}`,
      `{"type":"token","data":{"text":"'"}}`,
      `{"type":"token","data":{"text":"t"}}`,
      `{"type":"token","data":{"text":" "}}`,
      `{"type":"token","data":{"text":"h"}}`,
      `{"type":"token","data":{"text":"a"}}`,
      `{"type":"token","data":{"text":"v"}}`,
      `{"type":"token","data":{"text":"e"}}`,
      `{"type":"done","data":{}}`,
    ];
    const ndjson = lines.join('\n');

    // Parse using the same logic as useAgentStream
    let buffer = ndjson;
    const events: any[] = [];

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const rawLine = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (!rawLine) continue;

      const event = JSON.parse(rawLine);
      events.push(event);
    }

    // Handle tail
    const tail = buffer.trim();
    if (tail.length > 0) {
      const event = JSON.parse(tail);
      events.push(event);
    }

    expect(events).toHaveLength(13);
    expect(events[0]).toEqual({ type: 'token', data: { text: 'I' } });
    expect(events[12]).toEqual({ type: 'done', data: {} });
  });

  it('handles partial JSON across multiple chunks', () => {
    const chunk1 = `{"type":"token","data":{"text":"H"}}
{"type":"token","data":{"te`;
    const chunk2 = `xt":"i"}}
{"type":"done","data":{}}`;

    let buffer = '';
    const events: any[] = [];

    // Process chunk 1
    buffer += chunk1;
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const rawLine = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!rawLine) continue;
      events.push(JSON.parse(rawLine));
    }

    // Buffer should contain the partial JSON
    expect(buffer).toBe(`{"type":"token","data":{"te`);

    // Process chunk 2
    buffer += chunk2;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const rawLine = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!rawLine) continue;
      events.push(JSON.parse(rawLine));
    }

    // Handle tail
    const tail = buffer.trim();
    if (tail) events.push(JSON.parse(tail));

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'token', data: { text: 'H' } });
    expect(events[1]).toEqual({ type: 'token', data: { text: 'i' } });
    expect(events[2]).toEqual({ type: 'done', data: {} });
  });

  it('handles empty lines gracefully', () => {
    const ndjson = `{"type":"start","data":{}}

{"type":"token","data":{"text":"X"}}

{"type":"done","data":{}}`;

    let buffer = ndjson;
    const events: any[] = [];

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const rawLine = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!rawLine) continue;
      events.push(JSON.parse(rawLine));
    }

    const tail = buffer.trim();
    if (tail) events.push(JSON.parse(tail));

    expect(events).toHaveLength(3);
  });
});

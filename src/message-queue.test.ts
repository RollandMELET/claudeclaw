import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { MessageQueue } from './message-queue.js';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

describe('MessageQueue', () => {
  let q: MessageQueue;

  beforeEach(() => {
    q = new MessageQueue();
  });

  it('runs a single handler to completion', async () => {
    let ran = false;
    q.enqueue('chat-1', async () => {
      ran = true;
    });
    await flush();
    await flush();
    expect(ran).toBe(true);
    expect(q.activeChats).toBe(0);
    expect(q.queuedFor('chat-1')).toBe(0);
  });

  it('runs handlers for the same chat in FIFO order', async () => {
    const order: number[] = [];
    const gates = [deferred(), deferred(), deferred()];

    q.enqueue('chat-A', async () => {
      await gates[0].promise;
      order.push(1);
    });
    q.enqueue('chat-A', async () => {
      await gates[1].promise;
      order.push(2);
    });
    q.enqueue('chat-A', async () => {
      await gates[2].promise;
      order.push(3);
    });

    expect(q.queuedFor('chat-A')).toBe(3);

    gates[0].resolve();
    await flush();
    expect(order).toEqual([1]);

    gates[1].resolve();
    await flush();
    expect(order).toEqual([1, 2]);

    gates[2].resolve();
    await flush();
    await flush();
    expect(order).toEqual([1, 2, 3]);
    expect(q.queuedFor('chat-A')).toBe(0);
    expect(q.activeChats).toBe(0);
  });

  it('runs different chats in parallel (no head-of-line blocking)', async () => {
    const gateA = deferred();
    let bRan = false;

    q.enqueue('chat-A', async () => {
      await gateA.promise;
    });
    q.enqueue('chat-B', async () => {
      bRan = true;
    });

    await flush();
    await flush();
    expect(bRan).toBe(true);
    expect(q.activeChats).toBe(1);

    gateA.resolve();
    await flush();
    await flush();
    expect(q.activeChats).toBe(0);
  });

  it('continues the chain when a handler throws', async () => {
    const order: string[] = [];

    q.enqueue('chat-X', async () => {
      order.push('first');
      throw new Error('boom');
    });
    q.enqueue('chat-X', async () => {
      order.push('second');
    });

    await flush();
    await flush();
    await flush();
    expect(order).toEqual(['first', 'second']);
    expect(q.activeChats).toBe(0);
  });

  it('cleans up state once the chain drains', async () => {
    const gate = deferred();
    q.enqueue('chat-Z', async () => {
      await gate.promise;
    });
    expect(q.activeChats).toBe(1);
    expect(q.queuedFor('chat-Z')).toBe(1);

    gate.resolve();
    await flush();
    await flush();
    expect(q.activeChats).toBe(0);
    expect(q.queuedFor('chat-Z')).toBe(0);
  });
});

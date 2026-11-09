import { describe, expect, it } from 'vitest';
import type { SessionStateSnapshot, UUID } from '@quiz/contracts/domain';
import { createSessionStateClient } from '../../apps/web/src/services/session-state-client.js';

class FakeSocket {
  connected = false;
  emitted: Array<{ event: string; payload: unknown }> = [];
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  on(event: string, listener: (...args: unknown[]) => void) { const set = this.listeners.get(event) ?? new Set(); set.add(listener); this.listeners.set(event, set); return this; }
  off(event: string, listener: (...args: unknown[]) => void) { this.listeners.get(event)?.delete(listener); return this; }
  emit(event: string, payload?: unknown) { this.emitted.push({ event, payload }); return this; }
  serverEmit(event: string, payload?: unknown) { for (const listener of this.listeners.get(event) ?? []) listener(payload); }
  disconnect() { this.connected = false; }
}

const sid = '00000000-0000-4000-8000-000000000001' as UUID;
const snapshot = (stateVersion: number, phase: 'Waiting' | 'Active' = 'Waiting'): SessionStateSnapshot => phase === 'Waiting'
  ? { sessionId: sid, phase, currentRoundId: null, target: null, stateVersion, changedAt: '2026-11-09T01:00:00.000Z' }
  : { sessionId: sid, phase, currentRoundId: '00000000-0000-4000-8000-000000000060' as UUID, target: { kind: 'question', questionId: '00000000-0000-4000-8000-000000000020' as UUID }, stateVersion, changedAt: '2026-11-09T01:00:00.000Z' };

describe('session state client adapter', () => {
  it('watches on connect, stores snapshots and ignores stale or foreign states', () => {
    const socket = new FakeSocket();
    const client = createSessionStateClient(sid, { socket: socket as never });
    const updates: number[] = [];
    client.subscribe((state) => updates.push(state.stateVersion));
    socket.connected = true;
    socket.serverEmit('connect');
    expect(socket.emitted).toEqual([{ event: 'session:watch', payload: { sessionId: sid } }]);
    socket.serverEmit('session:state', snapshot(2));
    socket.serverEmit('session:state:changed', snapshot(1));
    socket.serverEmit('session:state:changed', { ...snapshot(3), sessionId: '00000000-0000-4000-8000-000000000002' });
    expect(client.getSnapshot()?.stateVersion).toBe(2);
    expect(updates).toEqual([2]);
    client.dispose();
  });

  it('re-subscribes after reconnect and accepts a newer authoritative snapshot', () => {
    const socket = new FakeSocket();
    const client = createSessionStateClient(sid, { socket: socket as never });
    socket.serverEmit('session:state', snapshot(3));
    socket.serverEmit('connect');
    socket.serverEmit('connect');
    expect(socket.emitted.filter(({ event }) => event === 'session:watch')).toHaveLength(2);
    socket.serverEmit('session:state', snapshot(4, 'Active'));
    expect(client.getSnapshot()).toMatchObject({ stateVersion: 4, phase: 'Active' });
    client.dispose();
  });
});

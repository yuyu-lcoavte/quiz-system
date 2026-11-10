import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { parseUUID, type SessionStateSnapshot, type UUID } from '@quiz/contracts/domain';
import type { ClientToServerEvents, ServerToClientEvents } from '@quiz/contracts/realtime';
import { createSessionStateClient, type SessionStateClient } from '../../services/session-state-client.js';

/** Student supplies its Cookie-authenticated scope, while Foundation owns state reconciliation. */
export function createStudentSessionState(sessionId: UUID, options: { url?: string; socket?: Socket<ServerToClientEvents, ClientToServerEvents> } = {}): SessionStateClient {
  const socket = options.socket ?? io(options.url ?? '/', { auth: { sessionId }, withCredentials: true });
  const client = createSessionStateClient(sessionId, { socket });
  return { ...client, dispose() { client.dispose(); if (!options.socket) socket.disconnect(); } };
}

export function useStudentSessionState(sessionId: string | undefined): SessionStateSnapshot | null {
  const [state, setState] = useState<SessionStateSnapshot | null>(null);
  useEffect(() => {
    setState(null);
    const id = parseUUID(sessionId);
    if (!id) return;
    const client = createStudentSessionState(id);
    const unsubscribe = client.subscribe(setState);
    return () => { unsubscribe(); client.dispose(); };
  }, [sessionId]);
  return state?.sessionId === sessionId ? state : null;
}

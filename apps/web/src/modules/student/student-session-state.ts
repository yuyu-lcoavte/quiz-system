import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createStudentSocket } from './student-socket.js';
import { parseUUID, type SessionStateSnapshot, type UUID } from '@quiz/contracts/domain';
import type { ClientToServerEvents, ServerToClientEvents } from '@quiz/contracts/realtime';
import { parseSessionStateSnapshot } from '@quiz/contracts/realtime';
import { parseStudentMembershipChangedPayload, type StudentClientToServerEvents, type StudentServerToClientEvents } from '@quiz/contracts';
import { createSessionStateClient, type SessionStateClient } from '../../services/session-state-client.js';

/** Student supplies its Cookie-authenticated scope, while Foundation owns state reconciliation. */
export function createStudentSessionState(sessionId: UUID, options: { url?: string; socket?: Socket<ServerToClientEvents, ClientToServerEvents> } = {}): SessionStateClient {
  const socket = options.socket ?? createStudentSocket(sessionId, { url: options.url });
  const client = createSessionStateClient(sessionId, { socket });
  return { ...client, dispose() { client.dispose(); if (!options.socket) socket.disconnect(); } };
}

export function useStudentSessionStatus(sessionId: string | undefined, refreshMembership?: () => void) {
  const [state, setState] = useState<SessionStateSnapshot | null>(null);
  const [connected,setConnected]=useState(false);
  const refresh = useRef(refreshMembership);
  const requestSnapshot = useRef<(() => void) | null>(null);
  const refreshSnapshot = useCallback(() => requestSnapshot.current?.(), []);
  refresh.current = refreshMembership;
  useEffect(() => {
    setState(null);setConnected(false);
    const id = parseUUID(sessionId);
    if (!id) return;
    const socket: Socket<StudentServerToClientEvents, StudentClientToServerEvents> = createStudentSocket(id,{autoConnect:false});
    requestSnapshot.current = () => { if (socket.connected) socket.emit('session:watch', { sessionId: id }); };
    socket.on('connect',()=>{setConnected(false);refresh.current?.();});
    const client = createStudentSessionState(id,{socket});
    socket.on('disconnect',()=>setConnected(false));socket.on('connect_error',()=>setConnected(false));socket.on('session:error',()=>setConnected(false));
    socket.on('student:membership:changed', value => {
      if (parseStudentMembershipChangedPayload(value)?.sessionId === id) refresh.current?.();
    });
    const ready=(value:unknown)=>{const next=parseSessionStateSnapshot(value);if(next?.sessionId===id&&next.stateVersion>=(client.getSnapshot()?.stateVersion??-1))setConnected(socket.connected);};
    socket.on('session:state',ready);socket.on('session:state:changed',ready);
    const unsubscribe = client.subscribe(setState);
    socket.connect();return () => { requestSnapshot.current = null; unsubscribe(); client.dispose();socket.removeAllListeners();socket.disconnect(); };
  }, [sessionId]);
  return {snapshot:state?.sessionId===sessionId?state:null,connected,refreshSnapshot};
}
export function useStudentSessionState(sessionId:string|undefined):SessionStateSnapshot|null{return useStudentSessionStatus(sessionId).snapshot;}

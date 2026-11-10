import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createStudentSocket } from './student-socket.js';
import { parseUUID, type SessionStateSnapshot, type UUID } from '@quiz/contracts/domain';
import type { ClientToServerEvents, ServerToClientEvents } from '@quiz/contracts/realtime';
import { parseSessionStateSnapshot } from '@quiz/contracts/realtime';
import { createSessionStateClient, type SessionStateClient } from '../../services/session-state-client.js';

/** Student supplies its Cookie-authenticated scope, while Foundation owns state reconciliation. */
export function createStudentSessionState(sessionId: UUID, options: { url?: string; socket?: Socket<ServerToClientEvents, ClientToServerEvents> } = {}): SessionStateClient {
  const socket = options.socket ?? createStudentSocket(sessionId, { url: options.url });
  const client = createSessionStateClient(sessionId, { socket });
  return { ...client, dispose() { client.dispose(); if (!options.socket) socket.disconnect(); } };
}

export function useStudentSessionStatus(sessionId: string | undefined): {snapshot:SessionStateSnapshot|null;connected:boolean} {
  const [state, setState] = useState<SessionStateSnapshot | null>(null);
  const [connected,setConnected]=useState(false);
  useEffect(() => {
    setState(null);setConnected(false);
    const id = parseUUID(sessionId);
    if (!id) return;
    const socket=createStudentSocket(id,{autoConnect:false});
    const client = createStudentSessionState(id,{socket});
    socket.on('connect',()=>setConnected(false));socket.on('disconnect',()=>setConnected(false));socket.on('connect_error',()=>setConnected(false));socket.on('session:error',()=>setConnected(false));
    const ready=(value:unknown)=>{const next=parseSessionStateSnapshot(value);if(next?.sessionId===id&&next.stateVersion>=(client.getSnapshot()?.stateVersion??-1))setConnected(socket.connected);};
    socket.on('session:state',ready);socket.on('session:state:changed',ready);
    const unsubscribe = client.subscribe(setState);
    socket.connect();return () => { unsubscribe(); client.dispose();socket.removeAllListeners();socket.disconnect(); };
  }, [sessionId]);
  return {snapshot:state?.sessionId===sessionId?state:null,connected};
}
export function useStudentSessionState(sessionId:string|undefined):SessionStateSnapshot|null{return useStudentSessionStatus(sessionId).snapshot;}

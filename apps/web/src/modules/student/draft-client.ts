import type { Socket } from 'socket.io-client';
import { parseStudentDraftSnapshotPayload,parseStudentDraftChangedPayload,parseStudentDraftLockedPayload,type StudentDraftSnapshotPayload,type StudentDraftChangedPayload,type StudentClientToServerEvents,type StudentServerToClientEvents } from '@quiz/contracts';
import type { UUID } from '@quiz/contracts/domain';

/** Keeps only authoritative, scoped versions; cookies are handled by the browser. */
export class DraftClient {
 snapshot:StudentDraftSnapshotPayload|null=null;
 private active=false;
 private readonly listeners=new Set<(snapshot:StudentDraftSnapshotPayload)=>void>();
 constructor(private readonly scope:{sessionId:UUID;roundId:UUID},private readonly socket:Socket<StudentServerToClientEvents,StudentClientToServerEvents>,private readonly options:{csrfToken:()=>string;fetchSnapshot?:()=>Promise<unknown>;onError?:(error:unknown)=>void}){}
 private matches(value:{sessionId:UUID;roundId:UUID}){return value.sessionId===this.scope.sessionId&&value.roundId===this.scope.roundId;}
 private notify(){if(this.snapshot)for(const listener of this.listeners)listener(this.snapshot);}
 private receiveSnapshot=(value:unknown)=>{
  const snapshot=parseStudentDraftSnapshotPayload(value);
  if(!this.active||!snapshot||!this.matches(snapshot)||snapshot.version<=(this.snapshot?.version??-1))return;
  this.snapshot=snapshot;this.notify();
 };
 acceptHttpChange=(value:unknown)=>{
  const change=parseStudentDraftChangedPayload(value);if(!this.active||!change||!this.matches(change)||change.version<=(this.snapshot?.version??-1))return;
  if(!this.snapshot||change.version!==this.snapshot.version+1){void this.refresh();return;}
  this.snapshot={...this.snapshot,version:change.version,answers:[...this.snapshot.answers.filter(a=>a.blankId!==change.answer.blankId),change.answer]};this.notify();
 };
 private reconnect=()=>{this.socket.emit('student:draft:watch',this.scope);void this.refresh();};
 private receiveLock=(value:unknown)=>{
  const lock=parseStudentDraftLockedPayload(value);
  if(!this.active||!lock||!this.matches(lock)||lock.version<=(this.snapshot?.version??-1))return;
  if(!this.snapshot||lock.version!==this.snapshot.version+1){void this.refresh();return;}
  this.snapshot={...this.snapshot,version:lock.version,status:'locked'};this.notify();
 };
 start(){if(this.active)return;this.active=true;this.socket.on('connect',this.reconnect);this.socket.on('student:draft:snapshot',this.receiveSnapshot);this.socket.on('student:draft:changed',this.acceptHttpChange);this.socket.on('student:draft:locked',this.receiveLock);if(this.socket.connected)this.reconnect();}
 stop(){this.active=false;this.socket.off('connect',this.reconnect);this.socket.off('student:draft:snapshot',this.receiveSnapshot);this.socket.off('student:draft:changed',this.acceptHttpChange);this.socket.off('student:draft:locked',this.receiveLock);}
 subscribe(listener:(snapshot:StudentDraftSnapshotPayload)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
 async refresh(){try{
  const value=this.options.fetchSnapshot?await this.options.fetchSnapshot():await fetch(`/api/v1/student/sessions/${this.scope.sessionId}/rounds/${this.scope.roundId}/draft`,{credentials:'same-origin'}).then(async response=>{if(!response.ok)throw Error('Unable to restore draft.');return (await response.json()).data;});
  this.receiveSnapshot(value);
 }catch(error){if(this.active)this.options.onError?.(error);}}
 edit(blankId:UUID,value:string,clientMutationId:UUID=crypto.randomUUID() as UUID){
  if(!this.active||this.snapshot?.status==='locked')return;
  this.socket.emit('student:draft:edit',{...this.scope,blankId,value,clientMutationId,baseVersion:this.snapshot?.version??0,csrfToken:this.options.csrfToken()});
 }
}

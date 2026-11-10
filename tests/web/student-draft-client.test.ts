import { it,expect } from 'vitest';
import { DraftClient } from '../../apps/web/src/modules/student/draft-client.js';
import { ids } from '../helpers/foundation.js';
it('ignores stale versions and requests an authoritative snapshot on gaps and reconnect',async()=>{
 const callbacks=new Map<string,Function>();let refreshes=0;
 const socket={on:(event:string,handler:Function)=>{callbacks.set(event,handler);},off:(event:string)=>callbacks.delete(event),emit:()=>{}};
 const scope={sessionId:ids.session1,roundId:ids.round1};
 const client=new DraftClient(scope,socket as never,{csrfToken:()=>'',fetchSnapshot:async()=>{refreshes++;return {...scope,version:5,status:'editable' as const,answers:[]};}});
 client.start();callbacks.get('student:draft:snapshot')!({...scope,version:2,status:'editable',answers:[]});
 callbacks.get('student:draft:snapshot')!({...scope,version:1,status:'editable',answers:[]});expect(client.snapshot?.version).toBe(2);
 callbacks.get('student:draft:snapshot')!({...scope,sessionId:ids.session2,version:99,status:'editable',answers:[]});expect(client.snapshot?.version).toBe(2);
 callbacks.get('student:draft:changed')!({...scope,version:4,answer:{blankId:ids.blank1,value:'gap',revision:4},clientMutationId:ids.submission1});await Promise.resolve();expect(client.snapshot?.version).toBe(5);
 callbacks.get('connect')!();await Promise.resolve();expect(refreshes).toBeGreaterThanOrEqual(2);client.stop();expect(callbacks.size).toBe(0);
});
it('makes the local draft read-only on a newer lock notification',()=>{
 const callbacks=new Map<string,Function>();let edits=0;
 const socket={on:(event:string,handler:Function)=>callbacks.set(event,handler),off:(event:string)=>callbacks.delete(event),emit:()=>{edits++;}};
 const scope={sessionId:ids.session1,roundId:ids.round1};const client=new DraftClient(scope,socket as never,{csrfToken:()=>''});client.start();
 callbacks.get('student:draft:snapshot')!({...scope,version:2,status:'editable',answers:[]});callbacks.get('student:draft:locked')!({...scope,version:3,status:'locked'});
 expect(client.snapshot?.status).toBe('locked');client.edit(ids.blank1,'not sent',ids.submission1);expect(edits).toBe(0);client.stop();
});

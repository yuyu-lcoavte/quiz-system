import { it,expect } from 'vitest';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import request from 'supertest';
import { createHttpServer } from '../../apps/server/src/app.js';
import { draftFixture } from '../helpers/student-draft.js';
import { cookieOf } from '../helpers/student.js';
import { ids } from '../helpers/foundation.js';
it('delivers committed edits to same-Team clients within 2 seconds, isolates others and recovers on reconnect',async()=>{
 const f=await draftFixture();const server=createHttpServer({database:f.database,studentSecurity:{secret:'test-secret-'.repeat(4),allowedOrigins:['http://127.0.0.1:5173']}});
 server.httpServer.listen(0,'127.0.0.1');await once(server.httpServer,'listening');const address=server.httpServer.address();if(!address||typeof address==='string')throw Error('No port');
 const clients=[f.a,f.b,f.other].map(r=>io(`http://127.0.0.1:${address.port}`,{autoConnect:false,transports:['websocket'],reconnection:false,auth:{sessionId:ids.session1},extraHeaders:{Cookie:cookieOf(r),Origin:'http://127.0.0.1:5173'}}));
 const scope={sessionId:ids.session1,roundId:ids.round1};
 try{
  for(const client of clients){const connected=new Promise<void>((resolve,reject)=>{client.once('connect',()=>resolve());client.once('connect_error',reject);});client.connect();await connected;const snapshot=new Promise<any>(resolve=>client.once('student:draft:snapshot',resolve));client.emit('student:draft:watch',scope);expect((await snapshot).version).toBe(0);}
  let leaked=false;clients[2].on('student:draft:changed',()=>{leaked=true;});
  const received=new Promise<any>(resolve=>clients[1].once('student:draft:changed',resolve));const started=Date.now();
  const result=await request(server.app).put(`${f.path}/answers/${ids.blank1}`).set('Cookie',cookieOf(f.a)).set('Origin','http://127.0.0.1:5173').set('X-CSRF-Token',f.a.body.data.csrfToken).send({value:'committed',baseVersion:0,clientMutationId:ids.submission1});
  expect(result.status).toBe(200);expect((await received).answer.value).toBe('committed');expect(Date.now()-started).toBeLessThan(2000);
  clients[1].disconnect();const connected=new Promise<void>(resolve=>clients[1].once('connect',()=>resolve()));clients[1].connect();await connected;
  const restored=new Promise<any>(resolve=>clients[1].once('student:draft:snapshot',resolve));clients[1].emit('student:draft:watch',scope);expect((await restored).answers[0].value).toBe('committed');
  const error=new Promise<any>(resolve=>clients[0].once('student:draft:error',resolve));clients[0].emit('student:draft:edit',{...scope,blankId:ids.blank1,value:'bad',baseVersion:1,clientMutationId:ids.submission2,csrfToken:'wrong'});expect((await error).code).toBe('FORBIDDEN');
  expect(leaked).toBe(false);
  const crossSession=new Promise<any>(resolve=>clients[0].once('student:draft:error',resolve));
  clients[0].emit('student:draft:watch',{sessionId:ids.session2,roundId:ids.round1});
  expect((await crossSession).code).toBe('UNAUTHENTICATED');
  const forged=new Promise<any>(resolve=>clients[0].once('student:draft:error',resolve));
  clients[0].emit('student:draft:edit',{...scope,teamId:ids.team2,blankId:ids.blank1,value:'forged',baseVersion:1,clientMutationId:ids.submission2,csrfToken:f.a.body.data.csrfToken});
  expect((await forged).code).toBe('INVALID_INPUT');
 }finally{clients.forEach(c=>c.disconnect());await new Promise<void>(resolve=>server.socketServer.close(()=>resolve()));}
});

import request from 'supertest';
import { it, expect } from 'vitest';
import { studentFixture,cookieOf } from '../helpers/student.js';
import { createHttpServer } from '../../apps/server/src/app.js';
import { StudentIdentityService } from '../../apps/server/src/modules/student/application/student-identity-service.js';
import { createStudentRepositories } from '../../apps/server/src/modules/student/persistence/index.js';
import { io } from 'socket.io-client';
import { once } from 'node:events';
import { ids } from '../helpers/foundation.js';
it('retains the original leader across independent restored requests',async()=>{
 const f=studentFixture(); const a=await f.join('Leader'); await f.join('Member');
 for(let i=0;i<2;i++){const r=await request(f.app).get(`${f.base}/me`).set('Cookie',cookieOf(a)); expect(r.body.data.isLeader).toBe(true); expect(r.body.data.participantId).toBe(a.body.data.participantId);}
});
it('retains leader membership after a real Socket disconnect and reconnect',async()=>{
 const f=studentFixture();const a=await f.join('Leader');const cookie=cookieOf(a);
 const identity=new StudentIdentityService(createStudentRepositories(f.database));
 const server=createHttpServer({database:f.database,studentSocket:{allowedOrigins:['http://127.0.0.1:5173'],resolveIdentity:(header,id)=>identity.resolve(header,id)}});
 server.httpServer.listen(0,'127.0.0.1');await once(server.httpServer,'listening');const address=server.httpServer.address();if(!address||typeof address==='string')throw Error('No port');
 try{for(let i=0;i<2;i++){
 const client=io(`http://127.0.0.1:${address.port}`,{transports:['websocket'],reconnection:false,auth:{sessionId:ids.session1},extraHeaders:{Cookie:cookie,Origin:'http://127.0.0.1:5173'}});
 try{await new Promise<void>((resolve,reject)=>{client.once('connect',()=>resolve());client.once('connect_error',reject);});}finally{client.disconnect();}
 const me=await request(f.app).get(`${f.base}/me`).set('Cookie',cookie);expect(me.body.data.isLeader).toBe(true);expect(me.body.data.participantId).toBe(a.body.data.participantId);
 }}finally{await new Promise<void>(resolve=>server.socketServer.close(()=>resolve()));}
});

// @vitest-environment node
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer as createViteServer,loadConfigFromFile,type ProxyOptions } from 'vite';
import { io,type Socket } from 'socket.io-client';
import { it,expect } from 'vitest';
import { studentFixture } from '../helpers/student.js';
import { ids,question,questionGroup,blank,round } from '../helpers/foundation.js';
import { createHttpServer } from '../../apps/server/src/app.js';
import { createStudentSocket } from '../../apps/web/src/modules/student/student-socket.js';
import { createStudentSessionState } from '../../apps/web/src/modules/student/student-session-state.js';

function event<T>(socket:Socket,name:string):Promise<T>{return new Promise((resolveEvent,reject)=>{const timer=setTimeout(()=>reject(Error(`Missing ${name}`)),3000);socket.once(name,(value:T)=>{clearTimeout(timer);resolveEvent(value);});});}

it('reproduces originless same-origin polling and restores Active state/target through the real Vite proxy with WebSocket',async()=>{
 const f=studentFixture();f.repositories.questionGroups.create(questionGroup());
 for(const [index,qid] of [ids.question1,ids.question2].entries()){
  f.repositories.questions.create(question(qid,ids.session1,{questionGroupId:ids.group1,position:index}));
  for(let b=0;b<2;b++)f.repositories.blanks.create(blank(([ids.blank1,ids.blank2,ids.blankOther,ids.result2] as const)[index*2+b],qid,b));
 }
 f.repositories.rounds.create({...round(ids.round1,ids.session1,{questionGroupId:ids.group1}),phase:'Active',startedAt:new Date().toISOString()});f.database.prepare('UPDATE sessions SET current_round_id=? WHERE id=?').run(ids.round1,ids.session1);
 const origins:string[]=[];const backend=createHttpServer({database:f.database,studentSecurity:{secret:'proxy-regression-secret-'.repeat(2),allowedOrigins:origins}});
 const observed:{origin:string|undefined;host:string|undefined;kind:string}[]=[];
 backend.httpServer.prependListener('request',req=>{if(req.url?.startsWith('/socket.io/'))observed.push({origin:req.headers.origin,host:req.headers.host,kind:'polling'});});
 backend.httpServer.prependListener('upgrade',req=>observed.push({origin:req.headers.origin,host:req.headers.host,kind:'websocket'}));
 backend.httpServer.listen(0,'127.0.0.1');await once(backend.httpServer,'listening');const backendUrl=`http://127.0.0.1:${(backend.httpServer.address() as AddressInfo).port}`;
 const loaded=await loadConfigFromFile({command:'serve',mode:'development'},resolve('apps/web/vite.config.ts'));if(!loaded)throw Error('Missing Vite config');
 const socketProxy=loaded.config.server!.proxy!['/socket.io'] as ProxyOptions;
 const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const proxyPort=(reservation.address() as AddressInfo).port;await new Promise<void>(resolveClose=>reservation.close(()=>resolveClose()));
 const vite=await createViteServer({...loaded.config,configFile:false,root:resolve('apps/web'),cacheDir:resolve(f.directory,'vite-cache'),optimizeDeps:{noDiscovery:true,include:[]},server:{...loaded.config.server,host:'127.0.0.1',port:proxyPort,strictPort:true,watch:null,proxy:{'/api':{target:backendUrl},'/socket.io':{...socketProxy,target:backendUrl}}}});
 const clients:Socket[]=[];
 try{
  await vite.listen();const origin=`http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`;origins.push(origin);
  const joined=await fetch(`${origin}/api/v1/student/sessions/${ids.session1}/enrollments`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({teamId:ids.team1,displayName:'Proxy student'})});expect(joined.status).toBe(200);const cookie=joined.headers.get('set-cookie')!.split(';')[0];
  // Browser same-origin polling GET has no mandatory Origin; the old default client took this path.
  const polling=io(origin,{autoConnect:false,transports:['polling'],upgrade:false,reconnection:false,auth:{sessionId:ids.session1},extraHeaders:{Cookie:cookie}});clients.push(polling);const rejected=event<Error>(polling,'connect_error');polling.connect();expect((await rejected).message).toBe('UNAUTHORIZED_STUDENT_ORIGIN');polling.disconnect();
  expect(observed.some(r=>r.kind==='polling'&&r.origin===undefined&&r.host===new URL(origin).host)).toBe(true);
  const socket=createStudentSocket(ids.session1,{url:origin,autoConnect:false});clients.push(socket);
  // A browser WebSocket supplies Origin and HttpOnly Cookie automatically; Node models those headers explicitly.
  socket.io.opts.extraHeaders={Origin:origin,cookie};const state=createStudentSessionState(ids.session1,{socket});
  const connected=new Promise<void>((resolveConnected,reject)=>{socket.once('connect',()=>resolveConnected());socket.once('connect_error',error=>reject(Error(`${error.message}; headers=${JSON.stringify(observed)}`)));}),snapshot=event<any>(socket,'session:state');const ready=Promise.all([connected,snapshot]);socket.connect();const [,received]=await ready;expect(received.phase).toBe('Active');expect(state.getSnapshot()?.currentRoundId).toBe(ids.round1);expect(socket.io.engine.transport.name).toBe('websocket');
  expect(observed.some(r=>r.kind==='websocket'&&r.origin===origin&&r.host===new URL(origin).host)).toBe(true);
  const target=await fetch(`${origin}/api/v1/sessions/${ids.session1}/current-target`,{headers:{Cookie:cookie}}).then(r=>r.json());expect(target.data.roundId).toBe(ids.round1);expect(target.data.target.questionGroup.questions).toHaveLength(2);expect(target.data.target.questionGroup.questions.flatMap((q:any)=>q.blanks)).toHaveLength(4);
  const wrong=io(origin,{autoConnect:false,transports:['websocket'],reconnection:false,auth:{sessionId:ids.session1},extraHeaders:{Origin:'https://untrusted.example',Cookie:cookie}});clients.push(wrong);const denied=event<Error>(wrong,'connect_error');wrong.connect();expect((await denied).message).toBe('UNAUTHORIZED_STUDENT_ORIGIN');wrong.disconnect();
  const anonymous=io(origin,{autoConnect:false,transports:['websocket'],reconnection:false,auth:{sessionId:ids.session1},extraHeaders:{Origin:origin}});clients.push(anonymous);const noCookie=event<Error>(anonymous,'connect_error');anonymous.connect();expect((await noCookie).message).toBe('UNAUTHENTICATED_STUDENT');anonymous.disconnect();state.dispose();
 }finally{clients.forEach(c=>c.disconnect());await vite.close();await new Promise<void>(resolveClose=>backend.socketServer.close(()=>resolveClose()));}
},20000);

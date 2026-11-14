import { render,screen } from '@testing-library/react';
import { MemoryRouter,Routes,Route } from 'react-router-dom';
import { it,expect,vi,afterEach } from 'vitest';
import { ids } from '../helpers/foundation.js';
const status=vi.hoisted(()=>({value:{snapshot:{sessionId:'00000000-0000-4000-8000-000000000001',phase:'Waiting',currentRoundId:'00000000-0000-4000-8000-000000000060',stateVersion:1},connected:true}}));
vi.mock('../../apps/web/src/modules/student/student-session-state.js',()=>({useStudentSessionStatus:()=>status.value}));
vi.mock('../../apps/web/src/modules/student/StudentDraftPanel.js',()=>({StudentDraftPanel:()=> <p>共同草稿</p>}));
import { StudentSessionPlaceholder } from '../../apps/web/src/pages/StudentSessionPlaceholder.js';
afterEach(()=>vi.unstubAllGlobals());
function page(){return <MemoryRouter initialEntries={[`/student/session/${ids.session1}`]}><Routes><Route path="/student/session/:sessionId" element={<StudentSessionPlaceholder/>}/></Routes></MemoryRouter>;}
it('restores membership, gates targets/results by phase and clears old results for a new Round',async()=>{
 const fetcher=vi.fn(async(url:unknown)=>({ok:true,json:async()=>({data:String(url).includes('/me')?{sessionId:ids.session1,participantId:ids.participant1,team:{teamId:ids.team1,name:'Team A'},isLeader:false}:String(url).includes('csrf-token')?{csrfToken:'csrf'}:{roundId:ids.round1,winner:{teamName:'Winner',answers:[{blankId:ids.blank1,label:'空格一',value:'winning answer'}]}}})}));vi.stubGlobal('fetch',fetcher);
 const view=render(page());expect(await screen.findByText('等待老師開始')).toBeTruthy();expect(fetcher.mock.calls.some(call=>String(call[0]).includes('/result'))).toBe(false);
 status.value={...status.value,connected:false};view.rerender(page());expect(await screen.findByText(/連線中斷/)).toBeTruthy();
 status.value={snapshot:{...status.value.snapshot,phase:'Ended',stateVersion:2},connected:true};view.rerender(page());expect(await screen.findByText('winning answer')).toBeTruthy();
 status.value={snapshot:{...status.value.snapshot,phase:'Waiting',currentRoundId:ids.round2,stateVersion:3},connected:true};view.rerender(page());expect(screen.queryByText('winning answer')).toBeNull();
});
it('shows no-winner and failed identity recovery without exposing a result',async()=>{
 status.value={snapshot:{...status.value.snapshot,phase:'Ended',stateVersion:4},connected:true};
 vi.stubGlobal('fetch',vi.fn(async(url:unknown)=>({ok:!String(url).includes('/me'),status:401,json:async()=>({error:{code:'UNAUTHENTICATED',message:'身分已失效'}})})));render(page());
 expect(await screen.findByRole('alert')).toHaveTextContent('身分已失效');expect(screen.queryByText('winning answer')).toBeNull();
});
it('loads Active target through Foundation and displays an explicit no-winner result only after Ended',async()=>{
 status.value={snapshot:{...status.value.snapshot,phase:'Active',stateVersion:5,currentRoundId:ids.round1},connected:true};
 const fetcher=vi.fn(async(url:unknown)=>({ok:true,json:async()=>({data:String(url).includes('/me')?{sessionId:ids.session1,participantId:ids.participant1,team:{teamId:ids.team1,name:'Team A'},isLeader:true}:String(url).includes('csrf-token')?{csrfToken:'csrf'}:String(url).includes('current-target')?{roundId:ids.round1,target:{kind:'question',question:{id:ids.question1,blanks:[]}}}:{roundId:ids.round1,winner:null}})}));vi.stubGlobal('fetch',fetcher);
 const view=render(page());expect(await screen.findByText('共同草稿')).toBeTruthy();expect(fetcher.mock.calls.some(call=>String(call[0]).includes('/result'))).toBe(false);
 status.value={...status.value,snapshot:{...status.value.snapshot,phase:'Ended',stateVersion:6}};view.rerender(page());expect(await screen.findByText('本輪無勝出組別。')).toBeTruthy();expect(screen.queryByText('共同草稿')).toBeNull();
});

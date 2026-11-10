import type { StudentMembershipView,StudentEnrollmentResponse } from '@quiz/contracts';
import type { UUID,RoundPhase,CurrentTargetView } from '@quiz/contracts/domain';
export class StudentApiError extends Error {constructor(readonly code:string,message:string,readonly status:number){super(message);}}
export async function studentRequest<T>(path:string,options:RequestInit={}):Promise<T>{
 const response=await fetch(path,{...options,credentials:'same-origin',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
 const body=await response.json();if(!response.ok)throw new StudentApiError(body.error?.code??'NETWORK_ERROR',body.error?.message??'無法完成請求',response.status);return body.data as T;
}
export interface JoinOptions {sessionId:UUID;phase:RoundPhase;teams:{teamId:UUID;name:string}[];}
export interface StudentIdentity {membership:StudentMembershipView;csrfToken:string;}
export async function recoverStudentIdentity(sessionId:UUID):Promise<StudentIdentity>{
 const membership=await studentRequest<StudentMembershipView>(`/api/v1/student/sessions/${sessionId}/me`);
 const {csrfToken}=await studentRequest<{csrfToken:string}>(`/api/v1/student/sessions/${sessionId}/csrf-token`);return {membership,csrfToken};
}
export async function lookupStudentActivity(code:string):Promise<JoinOptions>{const encoded=encodeURIComponent(code.trim());await studentRequest(`/api/v1/sessions/by-code/${encoded}`);return studentRequest(`/api/v1/student/join-options/${encoded}`);}
export async function enrollStudent(sessionId:UUID,teamId:string,displayName:string):Promise<StudentEnrollmentResponse>{
 let csrfToken:string|undefined;try{csrfToken=(await studentRequest<{csrfToken:string}>(`/api/v1/student/sessions/${sessionId}/csrf-token`)).csrfToken;}
 catch(error){if(!(error instanceof StudentApiError)||error.status!==401)throw error;}
 return studentRequest(`/api/v1/student/sessions/${sessionId}/enrollments`,{method:'POST',headers:csrfToken?{'X-CSRF-Token':csrfToken}:{},body:JSON.stringify({teamId,displayName:displayName.trim()})});
}
export function targetQuestions(target:CurrentTargetView){return target.target.kind==='question'?[target.target.question]:target.target.questionGroup.questions;}
export function studentError(error:unknown){return error instanceof Error?error.message:'網路連線失敗，請稍後重試。';}

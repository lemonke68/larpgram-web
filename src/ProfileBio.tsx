import {useEffect,useState} from 'react';
import {Method,type MatrixClient} from 'matrix-js-sdk';

const field='ru.mangokokos.about';
const profilePath=(id:string)=>'/profile/'+encodeURIComponent(id)+'/'+field;
const options={prefix:'/_matrix/client/v3'};

export function useProfileBio(client:MatrixClient,id:string){
 const [attempt,setAttempt]=useState(0);
 const [failed,setFailed]=useState(false);
 const [bio,setBio]=useState<{id:string;value:string}|null>(null);
 useEffect(()=>{
  let active=true;
  setFailed(false);
  void client.http.authedRequest<Record<string,unknown>>(Method.Get,profilePath(id),undefined,undefined,options)
   .then(response=>{if(active)setBio({id,value:typeof response[field]==='string'?response[field]:''})})
   .catch(error=>{if(active){if(error.httpStatus===404)setBio({id,value:''});else setFailed(true)}});
  return ()=>{active=false};
 },[client,id,attempt]);
 const status=failed?'error':bio?.id===id?'ready':'loading';
 return {status,retry:()=>setAttempt(value=>value+1),value:bio?.id===id?bio.value:null,update:async(value:string)=>{
  try{
   await client.http.authedRequest(value?Method.Put:Method.Delete,profilePath(id),undefined,value?{[field]:value}:undefined,options);
  }catch(error){if(value||(error as {httpStatus?:number}).httpStatus!==404)throw error}
  setBio({id,value});
 }};
}

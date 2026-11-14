import {useEffect,useState} from 'react';
import type {MatrixClient} from 'matrix-js-sdk';
import {Avatar} from './Avatar';

export function UserDirectory({client,query,choose}:{client:MatrixClient;query:string;choose:(id:string)=>void}){
 const term=query.trim();
 const [state,setState]=useState<{term:string;items?:{user_id:string;display_name?:string;avatar_url?:string}[];failed?:boolean}|null>(null);
 useEffect(()=>{
  if(term.length<2)return;
  let live=true;
  const timer=setTimeout(()=>{
   void client.searchUserDirectory({term,limit:12}).then(
    result=>{if(live)setState({term,items:result.results.filter(user=>user.user_id!==client.getUserId())})},
    ()=>{if(live)setState({term,failed:true})},
   );
  },350);
  return ()=>{live=false;clearTimeout(timer)};
 },[client,term]);
 if(term.length<2)return null;
 const result=state?.term===term?state:null;
 return <div className="directory-results">
  {!result?<small role="status">Ищем пользователей…</small>:result.failed?<small role="status">Поиск пользователей недоступен</small>:
   result.items?.length===0?<small role="status">Пользователи не найдены</small>:result.items?.map(user=>
    <button type="button" key={user.user_id} className="person-row" onClick={()=>choose(user.user_id)}>
     <Avatar name={user.display_name||user.user_id} mxc={user.avatar_url} identity={user.user_id}/><span><strong>{user.display_name||user.user_id}</strong><small>{user.user_id}</small></span>
    </button>)}
 </div>;
}

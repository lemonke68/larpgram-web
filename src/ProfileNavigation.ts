import {useEffect,useRef,useState} from 'react';

export type ProfilePage='profile'|'edit'|'account'|'email'|'password'|'chats-settings'|'privacy'|'blocked'|'encryption'|'recovery'|'notifications'|'devices';
type Entry={page:ProfilePage;trigger?:string};
const key='larpgramProfile';

export function useProfileNavigation(){
 const [stack,setStack]=useState<Entry[]>([]);
 const busy=useRef(false);
 const transition=useRef(false);
 const current=useRef<Entry[]>([]);
 function apply(next:Entry[]){
  const previous=current.current;
  current.current=next;setStack(next);
  requestAnimationFrame(()=>{
   const target=next.length<previous.length?previous[next.length]?.trigger:undefined;
   (target&&document.getElementById(target)||document.querySelector<HTMLElement>('.profile-heading h2'))?.focus({preventScroll:true});
  });
 }
 useEffect(()=>{
  history.replaceState({...history.state,[key]:[]},'');
  const pop=(event:PopStateEvent)=>{
   transition.current=false;
   const next=(event.state?.[key]??[]) as Entry[];
   if(busy.current){history.pushState({...history.state,[key]:current.current},'');return}
   apply(next);
  };
  const escape=(event:KeyboardEvent)=>{
   if(event.key!=='Escape'||event.defaultPrevented||document.querySelector('dialog[open]')||!current.current.length)return;
   event.preventDefault();back();
  };
  addEventListener('popstate',pop);addEventListener('keydown',escape);
  return ()=>{removeEventListener('popstate',pop);removeEventListener('keydown',escape)};
 },[]);
 function open(page:ProfilePage,trigger?:string){
  if(busy.current||transition.current||current.current.at(-1)?.page===page)return;
  if(page==='profile'&&current.current.length>1){
   transition.current=true;history.go(1-current.current.length);return;
  }
  const next=[...current.current,{page,trigger}];
  history.pushState({...history.state,[key]:next},'');apply(next);
 }
 function back(){
  if(busy.current||transition.current||!current.current.length)return;
  transition.current=true;history.back();
 }
 function close(){
  if(!current.current.length||transition.current)return;
  const depth=current.current.length;
  transition.current=true;history.go(-depth);apply([]);
 }
 return {page:stack.at(-1)?.page,open,back,close,setBusy:(value:boolean)=>{busy.current=value}};
}

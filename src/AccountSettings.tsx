import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {MatrixClient} from 'matrix-js-sdk';
import {Button,PasswordInput} from './Controls';
import {api,type Session} from './session';
import {openEscrow,sealEscrow,type LockedKey} from './escrow';

const messages:Record<string,string>={
 wrong_code:'Неверный код из письма.',code_expired:'Код истёк. Запросите новый.',
 too_many_attempts:'Попытки исчерпаны. Запросите новый код.',email_taken:'Почта уже используется.',
 email_invalid:'Проверьте адрес почты.',mail_failed:'Не удалось отправить письмо.',
 password_weak:'Выберите более надёжный пароль.',too_many_requests:'Слишком много запросов. Попробуйте позже.',
};
export function AccountSettings({mode,client,session,onBusy}:{mode:'email'|'password';client:MatrixClient;session:Session;onBusy:(busy:boolean)=>void}){
 const emailMode=mode==='email';
 const [address,setAddress]=useState<string|null>();
 const [lookupFailed,setLookupFailed]=useState(false);
 const [newEmail,setEmail]=useState('');
 const [ticket,setTicket]=useState('');
 const [code,setCode]=useState('');
 const [verified,setVerified]=useState(false);
 const [password,setPassword]=useState('');
 const [repeat,setRepeat]=useState('');
 const [old,setOld]=useState('');
 const [done,setDone]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [until,setUntil]=useState(0);
 const [now,setNow]=useState(Date.now);
 const remaining=Math.max(0,Math.ceil((until-now)/1000));
 const pending=useRef<LockedKey|null>(null);
 const [locked,setLocked]=useState<boolean>();
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;
  setLookupFailed(false);
  void client.getThreePids().then(value=>{if(active)setAddress(value.threepids.find(pid=>pid.medium==='email')?.address??null)},()=>{if(active)setLookupFailed(true)});
  if(!emailMode)void api('/escrow/v2/state',undefined,session.accessToken).then(value=>{if(active)setLocked(Boolean(value.blob))},()=>{if(active)setLocked(undefined)});
  return ()=>{active=false};
 },[client,session.accessToken,emailMode,attempt]);
 useEffect(()=>{if(!until)return;const timer=setInterval(()=>setNow(Date.now()),500);return ()=>clearInterval(timer)},[until]);
 async function run(action:()=>Promise<void>){
  if(busy)return;
  setBusy(true);onBusy(true);setError('');
  try{await action()}catch(cause){
   const key=cause instanceof Error?cause.message:'';
   if(['code_expired','too_many_attempts'].includes(key)){setTicket('');setVerified(false);setCode('')}
   setError(messages[key]??(key.startsWith('Проверьте')?key:'Запрос не выполнен. Попробуйте ещё раз.'));
  }finally{setBusy(false);onBusy(false)}
 }
 function countdown(seconds:number){
  const time=Date.now();setNow(time);setUntil(time+seconds*1000);
 }
 async function upload(){
  const response=await fetch('/escrow/v2/blob',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.accessToken},body:JSON.stringify({blob:pending.current})}).catch(()=>null);
  if(!response?.ok)throw Error('Проверьте подключение. Пароль изменён, но защита истории ещё не обновилась.');
  pending.current=null;
 }
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  void run(async()=>{
   if(!ticket){
    const result=emailMode?await api('/account/email/start',{email:newEmail.trim()},session.accessToken,true):
     await api('/account/password/forgot',{login:session.userId.slice(1).split(':')[0]},undefined,true);
    setTicket(result.ticket);countdown(result.resend_after);
   }else if(emailMode){
    const result=await api('/account/email/confirm',{ticket,code},session.accessToken,true);
    setAddress(result.email);setDone(true);
   }else if(!verified){
    await api('/account/code/check',{ticket,code},undefined,true);setVerified(true);
   }else{
    if(password!==repeat)throw Error('Проверьте: пароли не совпадают.');
    let blob:LockedKey|null=null;
    {
     const state=await api('/escrow/v2/state',undefined,session.accessToken);
     if(state.blob){
      if(!old){setLocked(true);throw Error('Проверьте поле текущего пароля для защиты истории.')}
      const existing=await api('/escrow/v2/blob',undefined,session.accessToken);
      let key:string;
      try{key=await openEscrow(existing.blob,old,session.userId)}catch{throw Error('Проверьте текущий пароль: не удалось открыть защиту истории.')}
      blob=await sealEscrow(key,password,session.userId);
     }
    }
    await api('/account/password/reset',{ticket,code,password},undefined,true);
    setDone(true);setOld('');setPassword('');setRepeat('');
    if(blob){pending.current=blob;await upload()}
   }
  });
 }
 return <div className="profile-inner settings-form">
  <p>{address===undefined?(lookupFailed?'Не удалось узнать привязанную почту.':'Проверяем привязанную почту…'):address??'Почта не привязана'}</p>
  {lookupFailed&&<Button onClick={()=>setAttempt(value=>value+1)}>Повторить проверку</Button>}
  {error&&<p role="alert">{error}</p>}
  {done?<><p role="status">{emailMode?'Почта обновлена.':'Пароль изменён.'}</p>{pending.current&&<Button busy={busy} onClick={()=>void run(upload)}>Повторить обновление защиты истории</Button>}</>:
  <form onSubmit={submit}>
   {!ticket&&emailMode&&<label>Новая почта<input required type="email" autoComplete="email" disabled={busy} value={newEmail} onChange={event=>setEmail(event.target.value)}/></label>}
   {!ticket&&!emailMode&&<p>Для смены пароля понадобится код из письма.</p>}
   {ticket&&!verified&&<label>Код из письма<input required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" disabled={busy} value={code} onChange={event=>setCode(event.target.value)}/></label>}
   {verified&&<>
    {locked!==false&&<PasswordInput label="Текущий пароль для защиты истории" required={locked===true} autoComplete="current-password" value={old} onChange={setOld} disabled={busy}/>}
    <PasswordInput label="Новый пароль" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={setPassword} disabled={busy}/>
    <PasswordInput label="Повторите новый пароль" required autoComplete="new-password" value={repeat} onChange={setRepeat} disabled={busy}/>
   </>}
   <Button type="submit" variant="primary" busy={busy} disabled={!emailMode&&!ticket&&!address}>{busy?'Подождите…':verified?'Сохранить пароль':ticket?'Подтвердить код':'Получить код'}</Button>
   {ticket&&!verified&&<Button busy={busy} disabled={remaining>0} onClick={()=>void run(async()=>{
    const result=await api('/account/code/resend',{ticket},undefined,true);setCode('');countdown(result.resend_after);
   })}>{remaining?`Повтор через ${remaining} с`:'Отправить код снова'}</Button>}
  </form>}
 </div>;
}

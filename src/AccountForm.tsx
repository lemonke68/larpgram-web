import {useState,type FormEvent} from 'react';
import {api} from './session';

const errors: Record<string,string> = {
  wrong_code: 'Неверный код из письма.',
  code_expired: 'Срок действия кода истёк. Запросите новый.',
  too_many_attempts: 'Слишком много попыток. Запросите новый код.',
  password_weak: 'Выберите более надёжный пароль.',
  password_too_short: 'Пароль слишком короткий.',
  password_too_long: 'Пароль слишком длинный.',
  username_taken: 'Этот ник уже занят.',
  email_taken: 'Эта почта уже используется.',
  username_invalid: 'Проверьте формат ника.',
  email_invalid: 'Проверьте адрес почты.',
};

export function AccountForm({mode,onBack,onDone}:{
  mode:'register'|'reset';
  onBack:()=>void;
  onDone:(username:string)=>void;
}){
  const [login,setLogin]=useState('');
  const [email,setEmail]=useState('');
  const [ticket,setTicket]=useState('');
  const [code,setCode]=useState('');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const registering=mode==='register';

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    setBusy(true);
    setError('');
    try{
      if(ticket){
        const result=await api(registering?'/account/register/confirm':'/account/password/reset',{ticket,code,password},undefined,true);
        onDone(result.username);
      }else{
        const result=await api(
          registering?'/account/register/start':'/account/password/forgot',
          registering?{username:login.trim(),email:email.trim()}:{login:login.trim()},
          undefined,true,
        );
        setTicket(result.ticket);
      }
    }catch(cause){
      const errorCode=cause instanceof Error?cause.message:'';
      setError(Object.hasOwn(errors,errorCode)?errors[errorCode]:'Не удалось выполнить запрос. Попробуйте ещё раз.');
    }finally{
      setBusy(false);
    }
  }

  return <>
    <h2>{registering?'Регистрация':'Сброс пароля'}</h2>
    <form onSubmit={submit}>
      {ticket?<fieldset disabled={busy}>
        <p>Введите код из письма и задайте пароль.</p>
        <label>Код из письма<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required value={code} onChange={event=>setCode(event.target.value)}/></label>
        <label>Новый пароль<input autoComplete="new-password" type="password" required value={password} onChange={event=>setPassword(event.target.value)}/></label>
      </fieldset>:<fieldset disabled={busy}>
        <label>{registering?'Ник':'Ник или почта'}<input autoComplete="username" required value={login} onChange={event=>setLogin(event.target.value)}/></label>
        {registering&&<label>Почта<input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label>}
      </fieldset>}
      {error&&<p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy?'Подождите…':ticket?'Подтвердить':'Получить код'}</button>
      <button type="button" disabled={busy} onClick={()=>{
        if(!ticket){onBack();return}
        setTicket('');setCode('');setPassword('');setError('');
      }}>{ticket?'Назад':'Ко входу'}</button>
    </form>
  </>;
}

import React,{lazy,Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import * as sdk from 'matrix-js-sdk';
import {encryptAttachment,decryptAttachment} from 'matrix-encrypt-attachment';
import {api,login,start,recover,logout,savedSession,type Session} from './session';
import './style.css';
import {VoiceRecorder} from './VoiceRecorder';
import {formatDuration,voiceDetails,waveformBars} from './voice';
import {activeCall,intentFor,type CallIntent} from './callUtils';
const CallOverlay=lazy(()=>import('./Call').then(m=>({default:m.CallOverlay})));
function Attachment({event,client}:{event:sdk.MatrixEvent;client:sdk.MatrixClient}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url]);
 const content=event.getContent();
 const voice=content.msgtype==='m.audio'?voiceDetails(content as Record<string,unknown>):null;
 return <div>{voice&&<div className="voice-details">{voice.waveform.length>0&&<div className="waveform" aria-hidden="true">{waveformBars(voice.waveform).map((h,i)=><i key={i} style={{height:Math.max(2,Math.round(h*24))+'px'}}/>)}</div>}{voice.duration!==undefined&&<small>{formatDuration(voice.duration)}</small>}</div>}{url?<>{event.getContent().msgtype==='m.audio'&&<><audio controls src={url}/><select aria-label="Скорость воспроизведения" defaultValue="1" onChange={e=>{const audio=e.currentTarget.parentElement?.querySelector('audio');if(audio)audio.playbackRate=Number(e.target.value)}}>{[1,1.5,2].map(v=><option key={v} value={v}>{v}×</option>)}</select></>}<a href={url} download={event.getContent().body}>Скачать файл</a></>:<button onClick={async()=>{try{const f=event.getContent().file;const mxc=f.url as string;const parts=mxc.slice(6).split('/');if(!mxc.startsWith('mxc://')||parts.length!==2)throw Error();const r=await fetch('/_matrix/client/v1/media/download/'+parts.map(encodeURIComponent).join('/'),{headers:{Authorization:'Bearer '+client.getAccessToken()}});if(!r.ok)throw Error();const data=await decryptAttachment(await r.arrayBuffer(),f);setUrl(URL.createObjectURL(new Blob([data],{type:event.getContent().msgtype==='m.audio'&&/^audio\/(ogg|webm|mp4|mpeg|aac|wav)(;|$)/i.test(event.getContent().info?.mimetype??'')?event.getContent().info.mimetype:'application/octet-stream'})))}catch{setError('Не удалось скачать или расшифровать файл')}}}>{event.getContent().msgtype==='m.audio'?'Загрузить аудио':'Скачать вложение'}</button>}{error&&<p role="alert">{error}</p>}</div>
}
function App(){
 const [session,setSession]=useState<Session|null>(null),[client,setClient]=useState<sdk.MatrixClient|null>(null),[owned,setOwned]=useState(false);
 const [status,setStatus]=useState('Подключение…'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[tick,refresh]=useState(0);
 const [ticket,setTicket]=useState(''),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[manual,setManual]=useState(''),[roomId,setRoomId]=useState(''),[text,setText]=useState(''),[call,setCall]=useState<{roomId:string;intent:CallIntent}|null>(null);
 useEffect(()=>{if(!navigator.locks){setError('Для безопасной работы нужен браузер с Web Locks');return}
 let release:()=>void;let stopped=false;
 navigator.locks.request('larpgram-web-session',{ifAvailable:true},async lock=>{
 if(!lock){setError('Larpgram уже открыт в другой вкладке. Закройте её и обновите эту.');return}
 setOwned(true);try{const s=savedSession();setSession(s)}catch{setError('Не удалось прочитать локальную сессию')}
 await new Promise<void>(r=>{release=r;if(stopped)r()});
 });return()=>{stopped=true;release?.()};},[]);
 useEffect(()=>{if(!session||!owned)return;let disposed=false;let c:sdk.MatrixClient|undefined;
 start(session,()=>refresh(x=>x+1)).then(v=>{c=v;if(disposed)v.stopClient();else{setClient(v);setStatus('Синхронизация')}}).catch(()=>setError('Не удалось открыть сессию. Проверьте сеть и доступность хранилища.'));
 return()=>{disposed=true;c?.stopClient()};},[session,owned]);
 async function run(task:()=>Promise<void>){setError('');setBusy(true);try{await task()}catch(e){setError(e instanceof Error?e.message:'Ошибка операции')}finally{setBusy(false)}}
 const rooms=client?.getRooms().sort((a,b)=>b.getLastActiveTimestamp()-a.getLastActiveTimestamp())??[];
 const room=client?.getRoom(roomId);const events=room?.getLiveTimeline().getEvents().slice(-100)??[];
 return <div className="app"><aside><h1>larpgram</h1><span className="tag">Web · технический прототип</span>{session&&<><p>{session.userId}</p><small>{client?.getSyncState()??status}</small><nav>{rooms.map(r=><button className={roomId===r.roomId?'selected':''} key={r.roomId} onClick={()=>setRoomId(r.roomId)}>{r.name}<small>{r.getJoinedMemberCount()} участников{client&&activeCall(client,r)?' · идёт звонок':''}</small></button>)}</nav><button disabled={busy||!client} onClick={()=>run(async()=>{await logout(client!,session);setClient(null);setSession(null)})}>Завершить сессию</button></>}</aside>
 <main>{error&&<div role="alert" className="error">{error}</div>}{!session?<section className="auth"><h2>Добро пожаловать</h2><p>Введите ник или почту и пароль</p><form onSubmit={e=>{e.preventDefault();run(async()=>{
 let name=username;if(ticket){name=(await api('/account/login/confirm',{ticket,code})).username}else{const r=await api('/account/login/start',{login:username,password});name=r.username;if(r.code_required){setTicket(r.ticket);return}}
 setSession(await login(name,password));setPassword('');setTicket('');setCode('');
 })}}><label>Ник или почта<input autoComplete="username" required disabled={!!ticket} value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Пароль<input autoComplete="current-password" type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{ticket&&<label>Код из письма<input required inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={e=>setCode(e.target.value)}/></label>}<button disabled={!owned||busy}>{busy?'Подождите…':ticket?'Подтвердить':'Войти'}</button>{ticket&&<button type="button" onClick={()=>{setTicket('');setCode('')}}>Назад</button>}</form></section>:<>
 <details className="recovery"><summary>Восстановить зашифрованную историю</summary><p>Пароль открывает ключ из escrow. Можно ввести ключ восстановления вручную.</p><form onSubmit={e=>{e.preventDefault();run(async()=>{if(!client)return;const result=await recover(client,session,password,manual);setStatus(`Восстановлено ключей: ${result.imported}. Веб-устройство подтверждено подписью аккаунта.`);setPassword('');setManual('');refresh(tick+1)})}}><input aria-label="Пароль для восстановления" type="password" placeholder="Пароль аккаунта" value={password} onChange={e=>setPassword(e.target.value)}/><input aria-label="Ключ восстановления" placeholder="Или ключ восстановления" value={manual} onChange={e=>setManual(e.target.value)}/><button disabled={busy||!client||(!password&&!manual)}>Восстановить</button></form><p role="status">{status}</p></details>
 <header><h2>{room?.name??'Выберите чат'}</h2>{room&&<small>{room.hasEncryptionStateEvent()?'Зашифрованный чат':'Чат без шифрования'}</small>}{room&&client&&<div className="call-buttons">{activeCall(client,room)&&<small className="call-active">В чате идёт звонок</small>}<button type="button" onClick={()=>setCall({roomId,intent:intentFor(room.getJoinedMemberCount()===2,false,activeCall(client,room))})}>Аудио</button><button type="button" onClick={()=>setCall({roomId,intent:intentFor(room.getJoinedMemberCount()===2,true,activeCall(client,room))})}>Видео</button></div>}</header>
 <div className="timeline">{events.map(ev=><article key={ev.getId()} className={ev.getSender()===session.userId?'own':''}><small>{ev.getSender()} · {new Date(ev.getTs()).toLocaleTimeString()}</small><p>{ev.isDecryptionFailure()?'Сообщение пока не расшифровано':ev.getContent().body??`[${ev.getType()}]`}</p>{ev.getContent().file&&<Attachment event={ev} client={client!}/>}</article>)}</div>
 {room&&<form className="composer" onSubmit={e=>{e.preventDefault();run(async()=>{if(!text.trim())return;await client!.sendTextMessage(roomId,text);setText('')})}}><input aria-label="Сообщение" placeholder="Сообщение" value={text} onChange={e=>setText(e.target.value)}/><label className="attach">Файл<input type="file" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)run(async()=>{const encrypted=room.hasEncryptionStateEvent();if(!encrypted)throw Error('В прототипе файлы отправляются только в зашифрованные чаты');const result=await encryptAttachment(await file.arrayBuffer());const upload=await client!.uploadContent(new Blob([result.data]),{type:'application/octet-stream',includeFilename:false});await client!.sendMessage(roomId,{msgtype:sdk.MsgType.File,body:file.name,file:{...result.info,v:'v2',hashes:{sha256:result.info.hashes!.sha256!},url:upload.content_uri},info:{size:file.size,mimetype:file.type}})})}}/></label><button disabled={busy||!text.trim()}>Отправить</button></form>}
 {room&&client&&<VoiceRecorder key={roomId} client={client} roomId={roomId} encrypted={room.hasEncryptionStateEvent()}/>}
 {call&&client&&<Suspense fallback={<div className="call-overlay"><p>Загрузка звонка…</p></div>}><CallOverlay client={client} roomId={call.roomId} intent={call.intent} onClose={()=>setCall(null)}/></Suspense>}
 </>}</main></div>
}
createRoot(document.getElementById('root')!).render(<App/>);

import {useEffect,useState,type ReactNode} from 'react';
import * as sdk from 'matrix-js-sdk';
import {AccountSettings} from './AccountSettings';
import {Avatar} from './Avatar';
import {Button,Confirm,IconButton,PasswordInput,SettingsRow} from './Controls';
import {Devices} from './Devices';
import {OwnProfile,ProfileEditor,type ProfilePatch} from './OwnProfile';
import {useProfileBio} from './ProfileBio';
import {openSavedMessages} from './savedMessages';
import type {Session} from './session';
import type {useProfileNavigation,ProfilePage} from './ProfileNavigation';
import {Icon,type IconName} from './Icon';

const sections=[
 ['account','Аккаунт','account','#7C5CE6'],
 ['chats-settings','Настройки чатов','chat','#F0A030'],
 ['privacy','Конфиденциальность','lock','#3DB46D'],
 ['encryption','Шифрование и ключи','shield','#9B6BF0'],
 ['notifications','Уведомления','bell','#EF5A5A'],
 ['devices','Устройства','devices','#2DB7A3'],
] as const;
const titles:Partial<Record<ProfilePage,string>>={profile:'Профиль',email:'Почта',password:'Пароль',blocked:'Заблокированные пользователи',recovery:'Восстановление истории'};
const id=(page:string)=>'profile-row-'+page;
const Group=({children}:{children:ReactNode})=><div className="settings-group glass">{children}</div>;

export function ProfileWorkspace({client,session,nav,name,mxc,onUpdate,chooseRoom,logout,theme,setTheme,wallpaper,setWallpaper,mutedRooms,recovering,recoveryStatus,restore,onMatrixUpdate}:{
 client:sdk.MatrixClient;session:Session;nav:ReturnType<typeof useProfileNavigation>;name:string;mxc?:string|null;
 onUpdate:(patch:ProfilePatch)=>void;chooseRoom:(id:string)=>void;logout:()=>Promise<void>;theme:'dark'|'light';setTheme:(theme:'dark'|'light')=>void;
 wallpaper:boolean;setWallpaper:(wallpaper:boolean)=>void;mutedRooms:sdk.Room[];recovering:boolean;recoveryStatus:string;restore:(password:string,key:string)=>Promise<void>;onMatrixUpdate:()=>void;
}){
 const page=nav.page;
 const bio=useProfileBio(client,session.userId);
 const [initialFile,setInitialFile]=useState<File|null>(null);
 const [dialog,setDialog]=useState<'logout'|string|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [method,setMethod]=useState<'password'|'key'>('password');
 const [secret,setSecret]=useState('');
 const [key,setKey]=useState('');
 const [keyState,setKeyState]=useState<{ready:boolean;backup:boolean;verified:boolean|null}|null>();
 const [keyAttempt,setKeyAttempt]=useState(0);
 const [pushAttempt,setPushAttempt]=useState(0);
 const [pushLoading,setPushLoading]=useState(false);
 const master=client.pushRules?.global.override?.find(rule=>rule.rule_id===sdk.RuleId.Master);
 useEffect(()=>{setError('');setDialog(null);setSecret('');setKey('');document.querySelector('.profile-workspace')?.scrollTo(0,0);if(page!=='edit')setInitialFile(null)},[page]);
 useEffect(()=>{
  if(page!=='profile'&&page!=='encryption')return;
  const crypto=client.getCrypto();
  if(!crypto){setKeyState(null);return}
  let active=true;
  setKeyState(undefined);
  void Promise.all([crypto.isCrossSigningReady(),crypto.getKeyBackupInfo(),crypto.getDeviceVerificationStatus(session.userId,session.deviceId)]).then(([ready,backup,device])=>{
   if(active)setKeyState({ready,backup:!!backup,verified:device?.crossSigningVerified??null});
  },()=>{if(active)setKeyState(null)});
  return ()=>{active=false};
 },[client,page,keyAttempt,recovering]);
 useEffect(()=>{
  if(page!=='notifications'||master)return;
  let active=true;
  setPushLoading(true);
  void client.getPushRules().then(()=>{if(active)onMatrixUpdate()},()=>{}).finally(()=>{if(active)setPushLoading(false)});
  return ()=>{active=false};
 },[client,page,pushAttempt]);
 async function run(action:()=>Promise<void>,failure:string){
  if(busy)return;
  setBusy(true);nav.setBusy(true);setError('');
  try{await action()}catch{setError(failure)}finally{setBusy(false);nav.setBusy(false)}
 }
 const row=(next:ProfilePage,label:string,icon:IconName,detail?:ReactNode,color?:string)=><SettingsRow key={next} id={id(next)} icon={icon} detail={detail} color={color} onClick={()=>{if(next==='edit')setInitialFile(null);nav.open(next,id(next))}}>{label}</SettingsRow>;
 const ignored=client.getIgnoredUsers();
 const title=page&&(titles[page]??sections.find(section=>section[0]===page)?.[1]);
 return <section className="area profile-area profile-workspace" aria-label={title??'Изменить профиль'}>
 {page==='edit'?<ProfileEditor client={client} userId={session.userId} name={name} mxc={mxc} bio={bio} initialFile={initialFile} onUpdate={onUpdate}
  onDone={()=>{setNotice('Профиль обновлён');nav.setBusy(false);nav.back()}} onCancel={nav.back} onBusy={nav.setBusy}/>:<>
  <header className="area-heading profile-heading"><IconButton icon="arrowBack" label="Назад" disabled={busy} onClick={nav.back}/><h2 tabIndex={-1}>{title}</h2></header>
  <div className="profile-inner">
   {error&&<p className="error" role="alert">{error}</p>}
   {page==='profile'&&<>
    <OwnProfile userId={session.userId} name={name} mxc={mxc} bio={bio}
     onEdit={()=>{setNotice('');setInitialFile(null);nav.open('edit','profile-identity')}}
     onPhoto={file=>{setNotice('');setInitialFile(file);nav.open('edit','profile-camera')}}/>
    {notice&&<p role="status">{notice}</p>}
    <Group>
     <SettingsRow icon="bookmark" color="#5B8DEF" disabled={busy} onClick={()=>void run(async()=>chooseRoom(await openSavedMessages(client)),'Не удалось открыть Избранное. Повторите попытку.')}>Избранное</SettingsRow>
     {sections.map(([next,label,icon,color])=>row(next,label,icon,next==='encryption'&&keyState?(keyState.backup?'Резервная копия найдена':'Резервной копии нет'):undefined,color))}
    </Group>
   </>}
   {page==='account'&&<>
    <Group>{row('edit','Изменить профиль','editSolid')}{row('email','Почта','email')}{row('password','Пароль','lock')}</Group>
    <Group><Button variant="danger" onClick={()=>setDialog('logout')}><Icon name="signOut" size={18}/> Выйти</Button></Group>
   </>}
   {(page==='email'||page==='password')&&<AccountSettings key={page} mode={page} client={client} session={session} onBusy={nav.setBusy}/>}
   {page==='chats-settings'&&<>
    <h3>Тема</h3><div className="preview-options">
     {(['light','dark'] as const).map(value=><Button key={value} aria-pressed={theme===value} onClick={()=>setTheme(value)}><span className="theme-sample" data-sample={value}><i/><i/></span>{value==='light'?'Светлая':'Тёмная'}</Button>)}
    </div>
    <h3>Фон переписки</h3><div className="preview-options">
     {[true,false].map(value=><Button key={String(value)} aria-pressed={wallpaper===value} onClick={()=>setWallpaper(value)}><span className="theme-sample wallpaper-sample" data-dots={value}><i/><i/></span>{value?'Узор':'Однотонный'}</Button>)}
    </div><p>Оформление сохраняется в этом браузере.</p>
   </>}
   {page==='privacy'&&<Group>{row('blocked','Заблокированные пользователи','ban',ignored.length?String(ignored.length):'Нет')}</Group>}
   {page==='blocked'&&<Group>{!client.isInitialSyncComplete()?<p role="status">Синхронизация…</p>:ignored.length?ignored.map(userId=>{
    const user=client.getUser(userId);
    return <div className="device-row" key={userId}><Avatar name={user?.displayName??userId} mxc={user?.avatarUrl} identity={userId}/><strong>{user?.displayName??userId}</strong><Button disabled={busy} onClick={()=>setDialog(userId)}>Разблокировать</Button></div>;
   }):<p>Заблокированных пользователей нет.</p>}</Group>}
   {page==='encryption'&&<Group><div className="profile-bio">
    {keyState===undefined?<p role="status">Проверяем состояние ключей…</p>:keyState===null?<p>Состояние ключей недоступно. <Button onClick={()=>setKeyAttempt(value=>value+1)}>Повторить</Button></p>:<>
     <p>{keyState.backup?'Резервная копия ключей найдена':'Резервная копия ключей не найдена'}</p>
     <p>{keyState.verified===null?'Статус подтверждения браузера недоступен':keyState.verified?'Этот браузер подтверждён':'Этот браузер не подтверждён'}</p>
     <p>{keyState.ready?'Ключи перекрёстной подписи доступны':'Ключи перекрёстной подписи недоступны'}</p>
    </>}
    {recoveryStatus&&<p role="status">{recoveryStatus}</p>}
   </div>{row('recovery','Восстановить историю','key')}</Group>}
   {page==='recovery'&&<div className="settings-form">
    <p>Выберите способ восстановления зашифрованной истории.</p>
    <div className="room-detail-actions">
     <Button aria-pressed={method==='password'} disabled={recovering} onClick={()=>{setMethod('password');setKey('')}}>Пароль</Button>
     <Button aria-pressed={method==='key'} disabled={recovering} onClick={()=>{setMethod('key');setSecret('')}}>Ключ</Button>
    </div>
    <form onSubmit={event=>{event.preventDefault();if(!recovering)void restore(secret,key)}}>
     {method==='password'?<PasswordInput label="Пароль аккаунта" value={secret} onChange={setSecret} required disabled={recovering}/>:
      <label>Ключ восстановления<input autoComplete="off" required value={key} onChange={event=>setKey(event.target.value)} disabled={recovering}/></label>}
     <Button type="submit" variant="primary" busy={recovering}>{recovering?'Восстанавливаем…':'Восстановить'}</Button>
    </form>
    {recoveryStatus&&<p role="status">{recoveryStatus}</p>}
   </div>}
   {page==='notifications'&&<Group>
    <div className="profile-bio">
     {master?<Button variant="plain" className="notification-switch" role="switch" aria-checked={!master.enabled} busy={busy} onClick={()=>void run(async()=>{
      await client.setPushRuleEnabled('global',sdk.PushRuleKind.Override,sdk.RuleId.Master,!master.enabled);
      await client.getPushRules();onMatrixUpdate();
     },'Не удалось изменить уведомления аккаунта.')}>Уведомления аккаунта <strong>{master.enabled?'Выключены':'Включены'}</strong><span className="toggle-thumb" aria-hidden="true"/></Button>:
      pushLoading?<p role="status">Загружаем правила…</p>:<p>Правила уведомлений недоступны. <Button onClick={()=>setPushAttempt(value=>value+1)}>Повторить</Button></p>}
     <p>Эта настройка применяется к аккаунту Matrix. Фоновая доставка в браузере не поддерживается.</p>
    </div>
    <div className="profile-bio"><h3>Приглушённые чаты{master?` · ${mutedRooms.length}`:''}</h3>{master?(mutedRooms.length?<ul>{mutedRooms.map(room=><li key={room.roomId}>{room.name}</li>)}</ul>:<p>Нет приглушённых чатов</p>):<p>Нет данных</p>}</div>
   </Group>}
   {page==='devices'&&<Devices client={client} session={session}/>}
  </div>
 </>}
 {dialog&&<Confirm title={dialog==='logout'?'Выйти из аккаунта?':'Разблокировать пользователя?'} action={dialog==='logout'?'Выйти':'Разблокировать'} busy={busy} onCancel={()=>setDialog(null)} onConfirm={()=>void run(async()=>{
  if(dialog==='logout')await logout();
  else{await client.setIgnoredUsers(ignored.filter(user=>user!==dialog));onMatrixUpdate()}
  setDialog(null);
 },dialog==='logout'?'Не удалось завершить сеанс.':'Не удалось разблокировать пользователя.')}>
  {dialog!=='logout'&&<p>{dialog}</p>}{error&&<p role="alert">{error}</p>}
 </Confirm>}
 </section>;
}

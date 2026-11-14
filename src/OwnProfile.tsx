import {useEffect,useRef,useState} from 'react';
import type {MatrixClient} from 'matrix-js-sdk';
import {Icon} from './Icon';
import {Avatar} from './Avatar';
import {userHandle} from './roomPresentation';
import {useProfileBio} from './ProfileBio';
import {CopyId} from './ConversationDetails';

export function OwnProfile({client,userId,name,mxc,onUpdate,onSettings,onSaved}:{client:MatrixClient;userId:string;name:string;mxc?:string|null;onSettings:()=>void;onSaved?:()=>void;onUpdate:(patch:{name?:string;mxc?:string})=>void}){
 const [editing,setEditing]=useState<'profile'|'photo'|null>(null);
 const {value:bio,update:updateBio}=useProfileBio(client,userId);
 const [draftBio,setDraftBio]=useState<string|null>(null);
 function begin(mode:'profile'|'photo'){
  setEditing(mode);setDraft(name);setDraftBio(null);setNotice('');setError('');
 }
 const [draft,setDraft]=useState('');
 const [file,setFile]=useState<File|null>(null);
 const [preview,setPreview]=useState('');
 const upload=useRef<{file:File;url:string}|null>(null);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!file)return;
  const url=URL.createObjectURL(file);
  setPreview(url);
  return ()=>URL.revokeObjectURL(url);
 },[file]);

 return <>
  <div className="profile-card"><Avatar name={name} mxc={mxc} identity={userId}/><h3>{name}</h3><small>{userHandle(userId)}</small></div>
  {!editing&&<div className="profile-tiles">
   <button type="button" onClick={()=>begin('photo')}><Icon name="photo"/>Выбрать фото</button>
   <button type="button" onClick={()=>begin('profile')}><Icon name="edit"/>Изменить</button>
   <button type="button" onClick={onSettings}><Icon name="settings"/>Настройки</button>
  </div>}
  <div className="settings-group glass">
   <div className="profile-info"><CopyId id={userId}/><small>Matrix ID</small></div>
   <button type="button" className="settings-row" onClick={()=>begin('profile')}><span><strong>{bio||'Расскажите о себе'}</strong><small>О себе</small></span><Icon name="chevron"/></button>
  </div>
  <div className="settings-group glass">
   {onSaved&&<button type="button" className="settings-row" onClick={onSaved}><span className="settings-icon" data-color="blue"><Icon name="bookmark"/></span><strong>Избранное</strong><Icon name="chevron"/></button>}
   <button type="button" className="settings-row" onClick={onSettings}><span className="settings-icon"><Icon name="settings"/></span><strong>Настройки аккаунта</strong><Icon name="chevron"/></button>
  </div>
  {editing?<form className="profile-editor glass" onSubmit={event=>{
   event.preventDefault();
   if(saving||!draft.trim())return;
   setSaving(true);setError('');setNotice('');
   void (async()=>{
    try{
     if(draft.trim()!==name){await client.setDisplayName(draft.trim());onUpdate({name:draft.trim()})}
     if(draftBio!==null&&draftBio.trim()!==bio)await updateBio(draftBio.trim());
     if(file){
      if(upload.current?.file!==file){
       const uploaded=await client.uploadContent(file,{includeFilename:false});
       upload.current={file,url:uploaded.content_uri};
      }
      await client.setAvatarUrl(upload.current.url);
      onUpdate({mxc:upload.current.url});
      upload.current=null;
     }
     setFile(null);setEditing(null);setNotice('Профиль обновлён');
    }catch{setError('Не удалось сохранить профиль. Можно повторить.')}
    finally{setSaving(false)}
   })();
  }}>
   {editing==='profile'&&<>
    <label>Отображаемое имя<input autoFocus required maxLength={255} value={draft} disabled={saving} onChange={event=>setDraft(event.target.value)}/></label>
    <label>О себе<textarea maxLength={255} value={draftBio??bio??''} disabled={saving} onChange={event=>setDraftBio(event.target.value)}/></label>
   </>}
   <label>Фото профиля<input autoFocus={editing==='photo'} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={saving} onChange={event=>{
    const selected=event.target.files?.[0];
    setPreview('');
    if(selected&&!/^image\/(png|jpeg|webp|gif|avif)$/.test(selected.type)){setError('Выберите изображение PNG, JPEG, WebP, GIF или AVIF');setFile(null);return}
    setError('');setFile(selected??null);
   }}/></label>
   {file&&preview&&<img src={preview} alt="Предпросмотр фото профиля"/>}
   <div className="room-detail-actions"><button type="button" disabled={saving} onClick={()=>{setEditing(null);setFile(null);setError('')}}>Отмена</button><button disabled={saving||!draft.trim()||editing==='photo'&&!file}>{saving?'Сохраняем…':'Сохранить'}</button></div>
  </form>:null}
  {notice&&<p role="status">{notice}</p>}
  {error&&<p role="alert">{error}</p>}
 </>;
}

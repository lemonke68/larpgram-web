import {useEffect,useRef,useState} from 'react';
import type {MatrixClient} from 'matrix-js-sdk';
import {Icon} from './Icon';
import {Avatar} from './Avatar';
import {Button,IconButton} from './Controls';
import {userHandle} from './roomPresentation';
import {useProfileBio} from './ProfileBio';

type Profile={client:MatrixClient;userId:string;name:string;mxc?:string|null};
export type ProfilePatch={name?:string;mxc?:string};
const accept='image/png,image/jpeg,image/webp,image/gif,image/avif';
export function OwnProfile({userId,name,mxc,bio,onEdit,onPhoto}:{userId:string;name:string;mxc?:string|null;bio:ReturnType<typeof useProfileBio>;onEdit:()=>void;onPhoto:(file:File)=>void}){
 const picker=useRef<HTMLInputElement>(null);
 const [copied,setCopied]=useState('');
 const [photoError,setPhotoError]=useState('');
 return <>
  <div className="own-hero">
   <div className="own-photo"><Avatar own name={name} mxc={mxc} identity={userId}/>
    <IconButton id="profile-camera" className="camera-button" icon="photo" size={18} label="Выбрать фото" onClick={()=>picker.current?.click()}/>
    <input ref={picker} type="file" accept={accept} hidden onChange={event=>{
     const file=event.target.files?.[0];event.target.value='';
     if(file&&accept.split(',').includes(file.type)){setPhotoError('');onPhoto(file)}
     else if(file)setPhotoError('Выберите изображение PNG, JPEG, WebP, GIF или AVIF.');
    }}/>
   </div>
   <Button variant="plain" className="own-name" onClick={onEdit} id="profile-identity"><strong>{name}</strong><small>{userHandle(userId)}</small></Button>
   {photoError&&<p role="alert">{photoError}</p>}
  </div>
  <div className="settings-group glass own-info">
   <Button variant="plain" className="settings-row" aria-label="Копировать Matrix ID" onClick={()=>void (async()=>{try{await navigator.clipboard.writeText(userId);setCopied('Matrix ID скопирован')}catch{setCopied('Не удалось скопировать Matrix ID')}})()}>
    <span className="settings-label"><strong>{userId}</strong><small>Matrix ID</small></span><Icon name="copy" size={18}/>
   </Button>
   <p className="profile-copy-status" role="status">{copied}</p>
   <div className="profile-bio"><small>О себе</small>
    {bio.status==='error'?<p role="alert">Не удалось загрузить описание. <Button onClick={bio.retry}>Повторить</Button></p>:
     bio.status==='loading'?<p role="status">Загрузка…</p>:<p>{bio.value||'Не указано'}</p>}
   </div>
  </div>
 </>;
}

export function ProfileEditor({client,userId,name,mxc,bio,initialFile,onUpdate,onDone,onCancel,onBusy}:Profile&{
 bio:ReturnType<typeof useProfileBio>;initialFile:File|null;onUpdate:(patch:ProfilePatch)=>void;onDone:()=>void;onCancel:()=>void;onBusy:(busy:boolean)=>void;
}){
 const picker=useRef<HTMLInputElement>(null);
 const upload=useRef<{file:File;url:string}|null>(null);
 const [draft,setDraft]=useState(name);
 const [draftBio,setDraftBio]=useState<string|null>(null);
 const [file,setFile]=useState(initialFile);
 const [preview,setPreview]=useState('');
 const [imgInvalid,setImgInvalid]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const saved=useRef(new Set<string>());
 useEffect(()=>{
  if(!file){setPreview('');return}
  const url=URL.createObjectURL(file);
  setPreview(url);
  return ()=>URL.revokeObjectURL(url);
 },[file]);
 const dirtyName=draft.trim()!==name;
 const dirtyBio=bio.status==='ready'&&draftBio!==null&&draftBio.trim()!==bio.value;
 const valid=!!draft.trim()&&!imgInvalid&&(dirtyName||dirtyBio||!!file);
 return <>
  <header className="area-heading profile-heading">
   <IconButton icon="arrowBack" label="Назад" disabled={saving} onClick={onCancel}/>
   <h2 tabIndex={-1}>Изменить профиль</h2>
   <Button variant="primary" type="submit" form="profile-editor" busy={saving} disabled={!valid}>{saving?'Сохранение…':'Сохранить'}</Button>
  </header>
  <form id="profile-editor" className="profile-editor profile-inner" aria-busy={saving} onSubmit={event=>{
   event.preventDefault();
   if(saving||!valid)return;
   setSaving(true);onBusy(true);setError('');
   void (async()=>{
    try{
     if(dirtyName){await client.setDisplayName(draft.trim());onUpdate({name:draft.trim()});saved.current.add('имя')}
     if(dirtyBio){await bio.update(draftBio!.trim());saved.current.add('описание')}
     if(file){
      if(upload.current?.file!==file)upload.current={file,url:(await client.uploadContent(file,{includeFilename:false})).content_uri};
      await client.setAvatarUrl(upload.current.url);
      onUpdate({mxc:upload.current.url});
     }
     onDone();
    }catch{
     const partial=[...saved.current];
     setError(partial.length?`Сохранено: ${partial.join(', ')}. Остальные изменения не сохранены. Можно повторить.`:'Не удалось сохранить профиль. Проверьте подключение и повторите.');
    }finally{setSaving(false);onBusy(false)}
   })();
  }}>
   <div className="own-photo"><Avatar own name={draft} mxc={mxc} identity={userId}/>
    {file&&preview&&<img className="own-photo-preview" src={preview} alt="Предпросмотр фото профиля" onError={()=>setImgInvalid(true)}/>}
    <IconButton className="camera-button" icon="photo" size={18} label={file?'Сменить выбранное фото':'Выбрать фото'} disabled={saving} onClick={()=>picker.current?.click()}/>
    <input ref={picker} hidden type="file" disabled={saving} accept={accept} onChange={event=>{
     const selected=event.target.files?.[0];event.target.value='';
     if(!selected)return;
     if(!accept.split(',').includes(selected.type)){setError('Выберите изображение PNG, JPEG, WebP, GIF или AVIF.');return}
     setImgInvalid(false);setError('');setFile(selected);
    }}/>
   </div>
   {file&&<Button disabled={saving} onClick={()=>{setFile(null);setImgInvalid(false)}}>Отменить выбор фото</Button>}
   <label>Имя<input required maxLength={255} value={draft} disabled={saving} onChange={event=>setDraft(event.target.value)}/></label>
   <label htmlFor="profile-editor-about">О себе</label><textarea id="profile-editor-about" maxLength={255} value={draftBio??bio.value??''} disabled={saving||bio.status!=='ready'} onChange={event=>setDraftBio(event.target.value)}/>
   {bio.status==='error'&&<p role="alert">Не удалось загрузить описание. <Button onClick={bio.retry}>Повторить</Button></p>}
   {imgInvalid&&<p role="alert">Не удалось прочитать изображение. Выберите другое фото.</p>}
   {error&&<p role="alert">{error}</p>}
  </form>
 </>;
}

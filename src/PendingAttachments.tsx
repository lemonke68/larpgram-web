import {useEffect,useRef,useState} from 'react';
import {MsgType,type MatrixClient,type MatrixEvent,type Room} from 'matrix-js-sdk';
import {encryptAttachment} from 'matrix-encrypt-attachment';
import {albumName} from './albums';
import {Icon} from './Icon';

export type PendingFile={id:string;file:File;caption:string;album?:{id:string;index:number;count:number}};

function FilePreview({file}:{file:File}){
 const [url,setUrl]=useState('');
 const image=/^image\/(avif|gif|jpeg|png|webp)$/.test(file.type);
 const video=/^video\/(mp4|webm)$/.test(file.type);
 useEffect(()=>{
  if(!image&&!video)return;
  const preview=URL.createObjectURL(file);
  setUrl(preview);
  return ()=>URL.revokeObjectURL(preview);
 },[file,image,video]);
 return !url?null:image?<img src={url} alt="Предпросмотр вложения"/>:<video src={url} controls playsInline/>;
}

export function PendingAttachments({client,room,items,busy,reply,update,remove,onBusy,consumeReply}:{client:MatrixClient;room:Room;items:PendingFile[];
 busy:boolean;reply?:MatrixEvent;update:(id:string,caption:string)=>void;remove:(id:string)=>void;onBusy:(value:boolean)=>void;consumeReply:()=>void;
}){
 const [progress,setProgress]=useState<{index:number;total:number;percent:number;canCancel:boolean}|null>(null);
 const [error,setError]=useState('');
 const operation=useRef<AbortController|null>(null);
 const alive=useRef(true);
 const retry=useRef<{id:string;event:MatrixEvent}|null>(null);
 useEffect(()=>{alive.current=true;return ()=>{alive.current=false;operation.current?.abort()}},[]);

 async function send(){
  if(operation.current||!items.length)return;
  const controller=new AbortController();
  operation.current=controller;
  setError('');
  onBusy(true);
  let replied=false;
  try{
   for(const [index,item] of items.entries()){
    controller.signal.throwIfAborted();
    const {file,caption,album}=item;
    const state={index:index+1,total:items.length,percent:0,canCancel:true};
    setProgress(state);

    if(retry.current?.id===item.id){
     await client.resendEvent(retry.current.event,room);
     retry.current=null;
    }else{
     const msgtype=file.type.startsWith('image/')?MsgType.Image:file.type.startsWith('video/')?MsgType.Video:
      file.type.startsWith('audio/')?MsgType.Audio:MsgType.File;
     const encrypted=room.hasEncryptionStateEvent()?await encryptAttachment(await file.arrayBuffer()):null;
     controller.signal.throwIfAborted();
     const upload=await client.uploadContent(encrypted?new Blob([encrypted.data]):file,{
      type:encrypted?'application/octet-stream':file.type||'application/octet-stream',
      includeFilename:false,abortController:controller,
      progressHandler:({loaded,total})=>{if(alive.current)setProgress({...state,percent:total?Math.round(100*loaded/total):0})},
     });
     controller.signal.throwIfAborted();
     const remote=encrypted?{file:{...encrypted.info,v:'v2',hashes:{sha256:encrypted.info.hashes!.sha256!},url:upload.content_uri}}:{url:upload.content_uri};
     const replyId=!replied&&reply?.getId();
     const pendingBefore=new Set(room.getLiveTimeline().getEvents());
     const filename=album?albumName(album.id,album.index,album.count,file.name):file.name;
     const body=caption.trim()||filename;
     setProgress({...state,percent:100,canCancel:false});
     try{
      await client.sendMessage(room.roomId,{
       ...remote,msgtype,filename,body,info:{size:file.size,mimetype:file.type},
       ...(replyId?{'m.relates_to':{'m.in_reply_to':{event_id:replyId}}}:{}),
      });
     }catch(error){
      const pending=room.getLiveTimeline().getEvents().find(event=>{
       const content=event.getContent();
       return !pendingBefore.has(event)&&(content.file?.url??content.url)===upload.content_uri&&event.status==='not_sent';
      });
      if(pending)retry.current={id:item.id,event:pending};
      throw error;
     }
    }
    if(reply&&!replied){consumeReply();replied=true}
    remove(item.id);
   }
  }catch{
   if(alive.current)setError(controller.signal.aborted?'Отправка остановлена. Остальные файлы остались в списке.':'Не удалось отправить вложение. Можно повторить.');
  }finally{
   operation.current=null;
   onBusy(false);
   if(alive.current)setProgress(null);
  }
 }
 if(!items.length)return null;
 return <section className="pending-attachments glass" aria-label="Вложения перед отправкой">
  <div className="pending-files">{items.map(item=><div key={item.id} className="attachment-review">
   <FilePreview file={item.file}/>
   <div><strong title={item.file.name}>{item.file.name}</strong><small>{Math.max(1,Math.round(item.file.size/1024))} КБ</small>
    <input aria-label={`Подпись к ${item.file.name}`} placeholder="Подпись" value={item.caption} disabled={busy||retry.current?.id===item.id} onChange={event=>update(item.id,event.target.value)}/>
   </div>
   <button type="button" className="icon-button" disabled={busy} aria-label={`Убрать ${item.file.name}`} onClick={()=>{if(retry.current?.id===item.id){client.cancelPendingEvent(retry.current.event);retry.current=null}remove(item.id)}}><Icon name="close"/></button>
  </div>)}</div>
  <div className="room-detail-actions">
   <button type="button" disabled={busy} onClick={()=>void send()}>{error?'Повторить отправку':'Отправить вложения'} · {items.length}</button>
   {progress&&<><progress aria-label="Загрузка файла" max={100} value={progress.percent}/><small>{progress.index} / {progress.total}</small>
    <button type="button" disabled={!progress.canCancel} onClick={()=>operation.current?.abort()}>Отменить загрузку</button></>}
  </div>
  {error&&<small role="alert">{error}</small>}
 </section>;
}

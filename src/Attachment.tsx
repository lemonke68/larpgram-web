import {useEffect,useRef,useState} from 'react';
import type {MatrixClient,MatrixEvent} from 'matrix-js-sdk';
import {decryptAttachment} from 'matrix-encrypt-attachment';
import {Icon} from './Icon';
import {formatDuration,voiceDetails,waveformBars} from './voice';

const imageType=/^image\/(avif|gif|jpeg|png|webp)$/i;
const videoType=/^video\/(mp4|webm)$/i;
const mediaDate=new Intl.DateTimeFormat('ru',{dateStyle:'short'});
const audioType=/^audio\/(ogg|webm|mp4|mpeg|aac|wav)$/i;

export const stickerPackField='ru.mangokokos.larpgram.pack';
export function isSticker(event:MatrixEvent){
  const {msgtype}=event.getContent();
  return event.getType()==='m.sticker'||msgtype==='m.sticker'||msgtype==='org.matrix.msc1767.sticker';
}

export function mediaKind(event:MatrixEvent){
  const {msgtype,file,url}=event.getContent();
  if(event.isRedacted()||(!file?.url&&!url))return null;
  if(msgtype==='m.image'||isSticker(event))return 'image';
  if(msgtype==='m.video')return 'video';
  if(msgtype==='m.audio')return 'audio';
  if(msgtype==='m.file')return 'file';
  return null;
}

export function Attachment({event,client,gallery=false,jump,sender}:{event:MatrixEvent;client:MatrixClient;gallery?:boolean;jump?:()=>void;sender?:string}){
  const content=event.getContent();
  const sticker=isSticker(event);
  const kind=mediaKind(event);
  const mxc=content.file?.url??content.url;
  const token=client.getAccessToken();
  const [requested,setRequested]=useState(false);
  const [placeholder,setPlaceholder]=useState<HTMLDivElement|null>(null);
  const [attempt,setAttempt]=useState(0);
  const [result,setResult]=useState<{mxc:string;url?:string;error?:boolean;playable?:boolean}|null>(null);
  const [unsupported,setUnsupported]=useState(false);
  const [preview,setPreview]=useState(false);
  const [dialog,setDialog]=useState<HTMLDialogElement|null>(null);
  const viewerTrigger=useRef<HTMLElement|null>(null);
  const audio=useRef<HTMLAudioElement>(null);
  const [playing,setPlaying]=useState(false);
  const [playError,setPlayError]=useState(false);
  const [position,setPosition]=useState(0);
  const [duration,setDuration]=useState(0);
  const [speed,setSpeed]=useState(1);
  useEffect(()=>{
    if(!placeholder||requested||(kind!=='image'&&!(gallery&&kind!=='file')))return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))setRequested(true)},{rootMargin:'220px'});
    observer.observe(placeholder);
    return ()=>observer.disconnect();
  },[placeholder,requested,kind,gallery]);
  useEffect(()=>{if(dialog&&!dialog.open)dialog.showModal()},[dialog]);
  useEffect(()=>{
    if(!requested||typeof mxc!=='string'||!kind||!token)return;
    const signal=new AbortController();
    let objectUrl:string|undefined;
    void (async()=>{
      try{
        const parts=/^mxc:\/\/([^/]+)\/([^/]+)$/.exec(mxc);
        if(!parts)throw Error();
        const response=await fetch('/_matrix/client/v1/media/download/'+parts.slice(1).map(encodeURIComponent).join('/'),{
          headers:{Authorization:'Bearer '+token},signal:signal.signal,
        });
        if(!response.ok)throw Error();
        const bytes=await response.arrayBuffer();
        const data=content.file?await decryptAttachment(bytes,content.file):bytes;
        if(signal.signal.aborted)return;
        const type=String(content.info?.mimetype??response.headers.get('content-type')??'').split(';')[0];
        const servedType=String(response.headers.get('content-type')??'').split(';')[0];
        const mime=sticker&&!content.file&&!imageType.test(type)&&imageType.test(servedType)?servedType:type;
        const playable=(kind==='image'&&imageType.test(mime))||(kind==='video'&&videoType.test(type))||(kind==='audio'&&audioType.test(type));
        objectUrl=URL.createObjectURL(new Blob([data],{type:playable?mime:'application/octet-stream'}));
        setUnsupported(false);
        setResult({mxc,url:objectUrl,playable});
      }catch{if(!signal.signal.aborted)setResult({mxc,error:true})}
    })();
    return ()=>{signal.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)};
  },[mxc,requested,attempt,kind,token,content,sticker]);
  if(!kind)return null;
  const state=result?.mxc===mxc?result:null;
  const url=state?.url;
  const title=String(content.filename??content.body??'Вложение');
  const circle=kind==='video'&&title.startsWith('larpgram-circle');
  const playable=url&&state?.playable&&!unsupported;
  const dimensions=Number(content.info?.w)>0&&Number(content.info?.h)>0?{width:Number(content.info.w),height:Number(content.info.h)}:undefined;
  const voice=kind==='audio'?voiceDetails(content)??(('m.voice' in content||'org.matrix.msc3245.voice' in content)?{waveform:[],duration:undefined}:null):null;
  const date=gallery?mediaDate.format(event.getTs()):'';
  const tile=gallery&&!circle&&(kind==='image'||kind==='video');
  const retry=()=>{setResult(null);setUnsupported(false);setAttempt(value=>value+1)};
  const open=(event:{currentTarget:HTMLElement})=>{
    viewerTrigger.current=event.currentTarget;
    if(state?.error)retry();else setRequested(true);
    setPreview(true);
  };
  const closePreview=()=>{
    dialog?.close();
    setPreview(false);
    viewerTrigger.current?.focus({preventScroll:true});
  };
  const download=url&&<a className="media-action" href={url} download={title} title="Скачать" aria-label="Скачать"><Icon name="download"/></a>;
  const waveform=voice&&voice.waveform.length>0&&<span className="waveform" aria-hidden="true">{waveformBars(voice.waveform).map((height,i)=><i key={i} style={{height:Math.max(2,Math.round(height*24))+'px'}}/>)}</span>;
  const audioControls=kind==='audio'&&playable?<div className="audio-track">
    <audio ref={audio} preload="metadata" src={url} onError={()=>setUnsupported(true)}
      onLoadedMetadata={e=>setDuration(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:0)}
      onTimeUpdate={e=>setPosition(e.currentTarget.currentTime)}
      onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)}/>
    <button type="button" className="track-play icon-button" aria-label={playing?'Пауза':'Воспроизвести'} onClick={()=>{
      if(!audio.current)return;
      setPlayError(false);
      if(playing)audio.current.pause();
      else void audio.current.play().catch(()=>setPlayError(true));
    }}><Icon name={playing?'pause':'play'}/></button>
    <div className="track-body">
      {(!voice||gallery)&&<strong title={voice?sender:title}>{voice?sender:title}</strong>}
      <label className="track-seek" data-wave={!!waveform}>{waveform}
        <input aria-label="Позиция воспроизведения" type="range" min="0" max={duration||1} step=".1" disabled={!duration} value={Math.min(position,duration)} onChange={e=>{if(audio.current)audio.current.currentTime=Number(e.target.value)}}/>
      </label>
      <small>{gallery&&date+' · '}{formatDuration(position>0?position*1000:duration?duration*1000:voice?.duration??0)}</small>
      {playError&&<small role="alert">Не удалось воспроизвести аудио</small>}
    </div>
    {voice&&<button className="track-speed" type="button" aria-label={`Скорость воспроизведения ${speed}×`} onClick={()=>{
      const next=speed===1?1.5:speed===1.5?2:1;
      if(audio.current)audio.current.playbackRate=next;
      setSpeed(next);
    }}>{speed}×</button>}
    <button type="button" className="icon-button" title="Действия с аудио" aria-label="Действия с аудио" onClick={open}><Icon name="file"/></button>
  </div>:null;
  if(sticker)return <div ref={setPlaceholder} className="sticker-content" aria-busy={requested&&!state}>
    {playable?<img src={url} alt={title} {...dimensions} onError={()=>setUnsupported(true)}/>:
     state?.error||unsupported?<button type="button" className="icon-button" aria-label="Повторить загрузку стикера" onClick={retry}><Icon name="retry"/></button>:<span role="status" className="sr-only">Загрузка стикера</span>}
  </div>;
  return <div ref={setPlaceholder} className="event-attachment" data-tile={tile} data-circle={circle}>
    {tile?<button type="button" className="media-tile" aria-label={`Открыть: ${title}`} onClick={open} aria-busy={requested&&!state}>
      {playable&&kind==='image'?<img src={url} alt="" loading="lazy" onError={()=>setUnsupported(true)}/>:
       playable&&kind==='video'?<video src={url+'#t=0.1'} muted playsInline preload="metadata" aria-hidden="true" onError={()=>setUnsupported(true)}/>:
       <span className="tile-placeholder"><Icon name={state?.error?'retry':kind==='video'?'camera':'image'}/>{(state?.error||unsupported)&&<span>Недоступно</span>}</span>}
      {kind==='video'&&playable&&<span className="tile-play"><Icon name="play"/>{Number(content.info?.duration)>0&&formatDuration(Number(content.info.duration))}</span>}
    </button>:gallery&&circle?<button type="button" className="attachment-file circle-row" onClick={open}>
      <span className="circle-thumb">{playable?<video src={url+'#t=0.1'} muted playsInline preload="metadata" aria-hidden="true"/>:<Icon name={state?.error?'retry':'videoNote'}/>}</span>
      <span><strong>{sender}</strong><small>Видеосообщение · {date}{Number(content.info?.duration)>0&&' · '+formatDuration(Number(content.info.duration))}</small></span>
    </button>:audioControls??(playable&&kind==='image'?<button type="button" className="image-trigger" onClick={open} aria-label="Открыть изображение"><img className="message-image" src={url} alt={title} loading="lazy" {...dimensions} onError={()=>setUnsupported(true)}/></button>:
      playable&&kind==='video'?<div className="video-player"><video className={circle?'message-video circle-video':'message-video'} controls playsInline preload="metadata" src={url} onError={()=>setUnsupported(true)}/><button type="button" className="icon-button" title="Открыть видео" aria-label="Открыть видео" onClick={open}><Icon name="maximize"/></button></div>:
      <button type="button" className="attachment-file" onClick={event=>{if(!url&&kind!=='file'){if(state?.error)retry();else setRequested(true)}else open(event)}}>
        <Icon name={state?.error?'retry':kind==='audio'?'music':kind==='video'?'camera':kind==='image'?'image':'file'}/>
        <span><strong>{voice?(gallery?sender:'Голосовое сообщение'):circle?'Видеосообщение':title}</strong>
        <small role={state?.error?'alert':requested&&!state?'status':undefined}>{state?.error?'Недоступно · повторить':requested&&!state?'Загрузка…':url?'Открыть файл':voice&&gallery?date:undefined}</small></span>
      </button>)}
    {preview&&<dialog className="media-viewer" ref={setDialog} aria-label="Просмотр вложения" onCancel={event=>{event.preventDefault();closePreview()}}
      onPointerDown={event=>{if(event.target===event.currentTarget)closePreview()}}
      onKeyDown={event=>{if(event.key==='Escape')event.stopPropagation()}}>
      <header className="viewer-toolbar">
        <strong title={title}>{title}</strong>
        {download}
        {jump&&<button type="button" className="icon-button" aria-label="К сообщению" title="К сообщению" onClick={()=>{setPreview(false);jump()}}><Icon name="chat"/></button>}
        <button type="button" className="icon-button" onClick={closePreview} autoFocus aria-label="Закрыть просмотр" title="Закрыть"><Icon name="close"/></button>
      </header>
      {playable&&kind==='image'?<img src={url} alt={title} onError={()=>setUnsupported(true)}/>:
       playable&&kind==='video'?<video src={url} controls autoPlay playsInline onError={()=>setUnsupported(true)}/>:
       state?.error?<div className="viewer-state"><p role="alert">Вложение недоступно</p><button type="button" onClick={retry}>Повторить</button></div>:
       !url?<p className="viewer-state" role="status">Загрузка…</p>:
       (!playable||kind!=='audio')&&<p className="viewer-state">{kind==='file'?'Файл готов к скачиванию':'Доступно скачивание оригинала'}</p>}
    </dialog>}
  </div>;
}

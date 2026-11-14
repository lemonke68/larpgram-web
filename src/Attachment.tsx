import {MusicContext} from './musicContext';
import {IconButton} from './Controls';
import {useContext,useEffect,useRef,useState,type CSSProperties} from 'react';
import type {MatrixClient,MatrixEvent} from 'matrix-js-sdk';
import {decryptAttachment} from 'matrix-encrypt-attachment';
import {Icon} from './Icon';
import {formatDuration,voiceDetails,waveformBars} from './voice';

const imageType=/^image\/(avif|gif|jpeg|png|webp)$/i;
const videoType=/^video\/(mp4|webm)$/i;
const mediaDate=new Intl.DateTimeFormat('ru',{dateStyle:'short'});
const audioType=/^audio\/(ogg|opus|webm|mp4|mpeg|aac|flac|x-flac|wav|x-wav|wave|aiff|x-aiff)$/i;
const audioTypesByExtension:Record<string,string>={aac:'audio/aac',aif:'audio/aiff',aiff:'audio/aiff',flac:'audio/flac',m4a:'audio/mp4',mp3:'audio/mpeg',oga:'audio/ogg',ogg:'audio/ogg',opus:'audio/ogg',wav:'audio/wav'};

function audioTypeFromFilename(content:ReturnType<MatrixEvent['getContent']>){
  const filename=typeof content.filename==='string'?content.filename:content.body;
  const extension=typeof filename==='string'?/\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase():undefined;
  return extension&&Object.hasOwn(audioTypesByExtension,extension)?audioTypesByExtension[extension]:undefined;
}

export const stickerPackField='ru.mangokokos.larpgram.pack';
export function isSticker(event:MatrixEvent){
  const {msgtype}=event.getContent();
  return event.getType()==='m.sticker'||msgtype==='m.sticker'||msgtype==='org.matrix.msc1767.sticker';
}

export function mediaKind(event:MatrixEvent){
  const content=event.getContent();
  const {msgtype,file,url}=content;
  if(event.isRedacted()||(!file?.url&&!url))return null;
  if(msgtype==='m.image'||isSticker(event))return 'image';
  if(msgtype==='m.video')return 'video';
  if(msgtype==='m.audio')return 'audio';
  if(msgtype==='m.file'){
    const type=String(content.info?.mimetype??'').split(';')[0].trim().toLowerCase();
    return type.startsWith('audio/')||((!type||type==='application/octet-stream')&&audioTypeFromFilename(content))?'audio':'file';
  }
  return null;
}

export function musicTitle(event:MatrixEvent){
  const {filename,body}=event.getContent();
  const name=String(filename??body??'Аудиофайл');
  return name.replace(/\.[a-z0-9]+$/i,'').trim().replace(/^\d{1,3}\s*[-._)]\s*/,'').trim()||name;
}

function voiceInfo(content:ReturnType<MatrixEvent['getContent']>){
  return voiceDetails(content)??(('m.voice' in content||'org.matrix.msc3245.voice' in content)?{waveform:[],duration:undefined}:null);
}

export function isMusic(event:MatrixEvent){
  return mediaKind(event)==='audio'&&!voiceInfo(event.getContent());
}

export async function loadAttachment(
  content:ReturnType<MatrixEvent['getContent']>,kind:NonNullable<ReturnType<typeof mediaKind>>,token:string,signal:AbortSignal,
){
  const mxc=content.file?.url??content.url;
  const parts=/^mxc:\/\/([^/]+)\/([^/]+)$/.exec(mxc);
  if(!parts)throw Error();
  const response=await fetch('/_matrix/client/v1/media/download/'+parts.slice(1).map(encodeURIComponent).join('/'),{
    headers:{Authorization:'Bearer '+token},signal,
  });
  if(!response.ok)throw Error();
  const bytes=await response.arrayBuffer();
  const data=content.file?await decryptAttachment(bytes,content.file):bytes;
  signal.throwIfAborted();
  const type=String(content.info?.mimetype??response.headers.get('content-type')??'').split(';')[0];
  const servedType=String(response.headers.get('content-type')??'').split(';')[0];
  const supportedType=kind==='image'?imageType:kind==='video'?videoType:audioType;
  const resolvedType=!content.file&&!supportedType.test(type)&&supportedType.test(servedType)?servedType:type;
  const mime=kind==='audio'&&!audioType.test(resolvedType)?audioTypeFromFilename(content)??resolvedType:resolvedType;
  const playable=(kind==='image'&&imageType.test(mime))||(kind==='video'&&videoType.test(mime))||(kind==='audio'&&audioType.test(mime));
  return {blob:new Blob([data],{type:playable?mime:'application/octet-stream'}),playable};
}

export function Attachment({event,client,gallery=false,jump,sender,openStickerPack}:{openStickerPack?:()=>void;event:MatrixEvent;client:MatrixClient;gallery?:boolean;jump?:()=>void;sender?:string}){
  const music=useContext(MusicContext);
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
  const [inlineWidth,setInlineWidth]=useState<{url:string;width:number}>();
  const [dialog,setDialog]=useState<HTMLDialogElement|null>(null);
  const viewerTrigger=useRef<HTMLElement|null>(null);
  const audio=useRef<HTMLAudioElement>(null);
  const playOnLoad=useRef(false);
  const [playing,setPlaying]=useState(false);
  const [playError,setPlayError]=useState(false);
  const [position,setPosition]=useState(0);
  const [duration,setDuration]=useState(0);
  const [speed,setSpeed]=useState(1);
  useEffect(()=>{
    if(!placeholder||requested||(kind!=='image'&&kind!=='video'&&!(gallery&&kind!=='file')))return;
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
        const {blob,playable}=await loadAttachment(content,kind,token,signal.signal);
        if(signal.signal.aborted)return;
        objectUrl=URL.createObjectURL(blob);
        setUnsupported(false);
        setResult({mxc,url:objectUrl,playable});
      }catch{if(!signal.signal.aborted)setResult({mxc,error:true})}
    })();
    return ()=>{signal.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)};
  },[mxc,requested,attempt,kind,token,content]);
  if(!kind)return null;
  const state=result?.mxc===mxc?result:null;
  const url=state?.url;
  const title=String(content.filename??content.body??'Вложение');
  const circle=kind==='video'&&title.startsWith('larpgram-circle');
  const playable=url&&state?.playable&&!unsupported;
  const dimensions=Number(content.info?.w)>0&&Number(content.info?.h)>0?{width:Number(content.info.w),height:Number(content.info.h)}:undefined;
  const voice=kind==='audio'?voiceInfo(content):null;
  const shared=kind==='audio'&&!voice?music:null;
  const current=shared?.event?.getId()===event.getId()?shared:null;
  const isPlaying=shared?!!current?.playing:playing;
  const isLoading=shared?!!current?.loading:requested&&!state;
  const elapsed=shared?current?.position??0:position;
  const trackDuration=shared?current?.duration??0:duration;
  const trackName=musicTitle(event);
  const audioDuration=trackDuration*1000||(voice?.duration??(Number(content.info?.duration)||0));
  const fileSize=Number(content.info?.size);
  const sizeLabel=fileSize>0
    ?new Intl.NumberFormat('ru',{style:'unit',unit:fileSize>=1048576?'megabyte':'kilobyte',maximumFractionDigits:1}).format(fileSize/(fileSize>=1048576?1048576:1024))
    :null;

  const date=gallery?mediaDate.format(event.getTs()):'';
  const tile=gallery&&!circle&&(kind==='image'||kind==='video');
  const inlineStyle=inlineWidth&&inlineWidth.url===url?{'--inline-media-width':inlineWidth.width+'px'} as CSSProperties:undefined;
  const sizeInline=(width:number,height:number)=>{
    if(url&&width>0&&height>0)setInlineWidth({url,width:Math.min(320,width,300*width/height)});
  };
  const retry=()=>{playOnLoad.current=false;setResult(null);setUnsupported(false);setAttempt(value=>value+1)};
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
  const audioControls=kind==='audio'&&(shared||!state||playable)?<div className="audio-track" data-kind={voice?'voice':'music'} aria-busy={isLoading}>
    {!shared&&<audio ref={audio} preload={playOnLoad.current?'auto':'metadata'} src={url} onError={()=>{playOnLoad.current=false;setUnsupported(true)}}
      onLoadedData={event=>{
        if(!playOnLoad.current)return;
        playOnLoad.current=false;
        void event.currentTarget.play().catch(()=>setPlayError(true));
      }}
      onLoadedMetadata={e=>setDuration(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:0)}
      onTimeUpdate={e=>setPosition(e.currentTarget.currentTime)}
      onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)}/>}
    <button type="button" className="track-play icon-button" aria-label={isPlaying?'Пауза':'Воспроизвести'} disabled={isLoading} onClick={()=>{
      if(shared){shared.play(event);return}
      setPlayError(false);
      if(!url){playOnLoad.current=true;setRequested(true);return}
      if(!audio.current)return;
      if(playing)audio.current.pause();
      else void audio.current.play().catch(()=>setPlayError(true));
    }}>{isLoading?<span className="track-loading" aria-hidden="true"/>:<Icon name={isPlaying?'pause':'play'} size={22}/>}</button>
    <div className="track-body">
      {!voice?<strong title={trackName}>{trackName}</strong>:gallery&&<strong title={sender}>{sender}</strong>}
      {voice&&<label className="track-seek" data-wave={!!waveform}>{waveform}
        <input aria-label="Позиция воспроизведения" type="range" min="0" max={duration||1} step=".1" disabled={!duration} value={Math.min(position,duration)} onChange={e=>{if(audio.current)audio.current.currentTime=Number(e.target.value)}}/>
      </label>}
      <small className="track-detail" role={isLoading?'status':undefined}>{isLoading?'Загрузка…':[
        gallery?date:null,
        current&&trackDuration?formatDuration(elapsed*1000)+' / '+formatDuration(audioDuration):
          (elapsed>0||audioDuration>0||voice)?formatDuration(elapsed>0?elapsed*1000:audioDuration):null,
        voice?sizeLabel:null,
      ].filter(Boolean).join(voice?', ':' · ')}</small>
      {(shared?current?.error:playError)&&<small role="alert">Не удалось воспроизвести аудио</small>}
    </div>
    {voice&&(playing||position>0||gallery)&&<button className="track-speed" type="button" aria-label={`Скорость воспроизведения ${speed}×`} onClick={()=>{
      const next=speed===1?1.5:speed===1.5?2:1;
      if(audio.current)audio.current.playbackRate=next;
      setSpeed(next);
    }}>{speed}×</button>}
    <IconButton icon="overflow" className="track-actions" type="button" title="Действия с аудио" label="Действия с аудио" onClick={open}/>
  </div>:null;
  const stickerImage=playable?<img src={url} alt={openStickerPack?'':title} {...dimensions} onError={()=>setUnsupported(true)}/>:null;
  if(sticker)return <div ref={setPlaceholder} className="sticker-content" aria-busy={requested&&!state}>
    {stickerImage?(openStickerPack?<button className="sticker-trigger" type="button" aria-label="Открыть набор стикеров" onClick={openStickerPack}>{stickerImage}</button>:stickerImage):
     state?.error||unsupported?<IconButton icon="retry" type="button" label="Повторить загрузку стикера" onClick={retry}/>:<span role="status" className="sr-only">Загрузка стикера</span>}
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
    </button>:audioControls??(playable&&kind==='image'?<button type="button" className="image-trigger" style={inlineStyle} onClick={open} aria-label="Открыть изображение"><img className="message-image" src={url} alt={title} loading="lazy" {...dimensions} onLoad={event=>{const {naturalWidth,naturalHeight}=event.currentTarget;sizeInline(naturalWidth,naturalHeight)}} onError={()=>setUnsupported(true)}/></button>:
      playable&&kind==='video'?<div className="video-player" style={circle?undefined:inlineStyle}><video className={circle?'message-video circle-video':'message-video'} controls playsInline preload="auto" src={url+'#t=0.1'} onLoadedMetadata={event=>sizeInline(event.currentTarget.videoWidth,event.currentTarget.videoHeight)} onError={()=>setUnsupported(true)}/><IconButton icon="maximize" type="button" title="Открыть видео" label="Открыть видео" onClick={open}/></div>:
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
        <IconButton icon="close" type="button" onClick={closePreview} autoFocus label="Закрыть просмотр" title="Закрыть"/>
      </header>
      {playable&&kind==='image'?<img src={url} alt={title} onError={()=>setUnsupported(true)}/>:
       playable&&kind==='video'?<video src={url} controls autoPlay playsInline onError={()=>setUnsupported(true)}/>:
       state?.error?<div className="viewer-state"><p role="alert">Вложение недоступно</p><button type="button" onClick={retry}>Повторить</button></div>:
       !url?<p className="viewer-state" role="status">Загрузка…</p>:
       (!playable||kind!=='audio')&&<p className="viewer-state">{kind==='file'?'Файл готов к скачиванию':'Доступно скачивание оригинала'}</p>}
    </dialog>}
  </div>;
}

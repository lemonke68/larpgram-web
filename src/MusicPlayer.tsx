import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {MatrixClient,MatrixEvent} from 'matrix-js-sdk';
import {isMusic,loadAttachment,musicTitle} from './Attachment';
import {MusicContext} from './musicContext';
import {IconButton} from './Controls';
import {Icon} from './Icon';
import {formatDuration} from './voice';

export function MusicPlayer({client,children}:{client:MatrixClient|null;children:ReactNode}){
 const audio=useRef<HTMLAudioElement>(null);
 const playlist=useRef<HTMLDialogElement>(null);
 const [track,setTrack]=useState<MatrixEvent|null>(null);
 const [attempt,setAttempt]=useState(0);
 const [playing,setPlaying]=useState(false);
 const [position,setPosition]=useState(0);
 const [duration,setDuration]=useState(0);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState(false);
 const [open,setOpen]=useState(false);

 const roomId=track?.getRoomId();
 const room=roomId?client?.getRoom(roomId):undefined;
 const loaded=room?.getLiveTimeline().getEvents().filter(isMusic)??[];
 const queue=track&&!loaded.some(item=>item.getId()===track.getId())?[track,...loaded]:loaded;
 const index=queue.findIndex(item=>item.getId()===track?.getId());
 const toggle=()=>{
  const element=audio.current;
  if(!element||loading)return;
  if(error){setAttempt(value=>value+1);return}
  if(element.paused)void element.play().catch(()=>setError(true));
  else element.pause();
 };
 const play=(event:MatrixEvent)=>{
  if(track?.getId()===event.getId()){toggle();return}
  setTrack(event);
 };
 const close=()=>{setOpen(false);setTrack(null)};

 useEffect(()=>{
  const element=audio.current;
  const token=client?.getAccessToken();
  if(!track||!element||!token)return;
  const request=new AbortController();
  let url:string|undefined;
  setLoading(true);setError(false);setPlaying(false);setDuration(0);setPosition(0);
  void loadAttachment(track.getContent(),'audio',token,request.signal).then(async result=>{
   if(request.signal.aborted)return;
   if(!result.playable)throw Error();
   url=URL.createObjectURL(result.blob);
   element.src=url;
   await element.play();
  }).catch(()=>{if(!request.signal.aborted)setError(true)}).finally(()=>{
   if(!request.signal.aborted)setLoading(false);
  });
  return ()=>{
   request.abort();
   element.pause();
   element.removeAttribute('src');
   element.load();
   if(url)URL.revokeObjectURL(url);
  };
 },[client,track,attempt]);

 useEffect(()=>{
  const dialog=playlist.current;
  if(open&&!dialog?.open)dialog?.showModal();
 },[open]);

 return <MusicContext.Provider value={{event:track,playing,loading,error,position,duration,play}}>
  <audio ref={audio} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
   onLoadedMetadata={event=>setDuration(Number.isFinite(event.currentTarget.duration)?event.currentTarget.duration:0)}
   onTimeUpdate={event=>setPosition(event.currentTarget.currentTime)} onEnded={()=>{
    setPlaying(false);
    if(queue[index+1])setTrack(queue[index+1]);
   }} />
  {track&&<section className="music-player" aria-label="Музыкальный плеер">
   <div className="music-player-controls">
    <IconButton icon="arrowBack" size={17} label="Предыдущий трек" disabled={index<1} onClick={()=>setTrack(queue[index-1])}/>
    <IconButton icon={playing?'pause':'play'} size={19} label={playing?'Пауза':'Воспроизвести трек'} disabled={loading} onClick={toggle}/>
    <IconButton icon="arrowNext" size={17} label="Следующий трек" disabled={index<0||index>=queue.length-1} onClick={()=>setTrack(queue[index+1])}/>
    <button type="button" className="music-queue-trigger" onClick={()=>setOpen(true)} aria-haspopup="dialog" title="Открыть плейлист">{musicTitle(track)}</button>
    <small role={error?'alert':undefined}>{error?'Не удалось запустить трек':loading?'Загрузка…':formatDuration(position*1000)}</small>
    <IconButton icon="close" size={18} label="Закрыть плеер" onClick={close}/>
   </div>
   <input type="range" className="music-seek" aria-label="Перемотка трека" min="0" max={duration||1} step=".1" disabled={!duration}
    value={Math.min(position,duration)} onChange={event=>{if(audio.current)audio.current.currentTime=Number(event.target.value)}}/>
  </section>}
  {track&&open&&<dialog ref={playlist} className="message-dialog music-queue" aria-label="Плейлист" onClose={()=>setOpen(false)}>
   <header><h3>Плейлист</h3><IconButton icon="close" label="Закрыть плейлист" onClick={()=>playlist.current?.close()}/></header>
   <div className="music-queue-items">
    {queue.map(item=><button type="button" key={item.getId()} aria-current={item.getId()===track.getId()} onClick={()=>play(item)}>
     <Icon name={item.getId()===track.getId()&&playing?'pause':'play'} size={19}/><span>{musicTitle(item)}</span>
    </button>)}
   </div>
  </dialog>}
  {children}
 </MusicContext.Provider>;
}

import {IconButton} from './Controls';
import {useEffect,useRef,useState} from 'react';
import {MsgType,type MatrixClient} from 'matrix-js-sdk';
import {encryptAttachment} from 'matrix-encrypt-attachment';
import {Icon} from './Icon';

export function VideoNote({client,roomId,close}:{client:MatrixClient;roomId:string;close:()=>void}){
  const stream=useRef<MediaStream|null>(null);
  const recorder=useRef<MediaRecorder|null>(null);
  const preview=useRef<HTMLVideoElement>(null);
  const [draft,setDraft]=useState<Blob|null>(null);
  const [url,setUrl]=useState('');
  const [error,setError]=useState('');
  const [recording,setRecording]=useState(false);
  const [sending,setSending]=useState(false);

  useEffect(()=>{
    let active=true;
    let timeout:ReturnType<typeof setTimeout>|undefined;
    void (async()=>{
      try{
        const media=await navigator.mediaDevices.getUserMedia({audio:true,video:{width:480,height:480}});
        if(!active){media.getTracks().forEach(track=>track.stop());return;}
        stream.current=media;
        if(preview.current)preview.current.srcObject=media;
        const type=['video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(value=>MediaRecorder.isTypeSupported(value));
        const record=new MediaRecorder(media,type?{mimeType:type}:undefined);
        recorder.current=record;
        const chunks:Blob[]=[];
        record.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
        record.onerror=()=>{
          media.getTracks().forEach(track=>track.stop());
          if(active){setRecording(false);setError('Не удалось записать видео.');}
        };
        record.onstop=()=>{
          clearTimeout(timeout);
          media.getTracks().forEach(track=>track.stop());
          if(!active)return;
          setRecording(false);
          const blob=new Blob(chunks,{type:record.mimeType});
          if(blob.size)setDraft(blob);
          else setError('Видео не записалось.');
        };
        record.start();
        timeout=setTimeout(()=>{if(record.state==='recording')record.stop();},60000);
        setRecording(true);
      }catch{
        stream.current?.getTracks().forEach(track=>track.stop());
        if(active)setError('Камера или микрофон недоступны.');
      }
    })();
    return ()=>{
      active=false;
      clearTimeout(timeout);
      if(recorder.current?.state==='recording')recorder.current.stop();
      stream.current?.getTracks().forEach(track=>track.stop());
    };
  },[]);

  useEffect(()=>{
    if(!draft)return;
    const objectUrl=URL.createObjectURL(draft);
    setUrl(objectUrl);
    return ()=>URL.revokeObjectURL(objectUrl);
  },[draft]);

  useEffect(()=>{
    if(!recording&&!draft)return;
    const warn=(event:BeforeUnloadEvent)=>event.preventDefault();
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[recording,draft]);

  async function send(){
    if(!draft||sending)return;
    setSending(true);
    setError('');
    try{
      const encrypted=await encryptAttachment(await draft.arrayBuffer());
      const upload=await client.uploadContent(new Blob([encrypted.data]),{type:'application/octet-stream',includeFilename:false});
      await client.sendMessage(roomId,{
        msgtype:MsgType.Video,body:draft.type.includes('mp4')?'larpgram-circle.mp4':'larpgram-circle.webm',
        file:{...encrypted.info,v:'v2',hashes:{sha256:encrypted.info.hashes!.sha256!},url:upload.content_uri},
        info:{mimetype:draft.type,size:draft.size},
      });
      close();
    }catch{
      setError('Не удалось отправить видео.');
      setSending(false);
    }
  }

  return <section className="video-note glass" aria-label="Видеосообщение">
    {draft?<video src={url} controls playsInline/>:<video ref={preview} muted autoPlay playsInline/>}
    <div className="composer-tools">
      {recording&&<button type="button" className="icon-button" aria-label="Остановить запись видео" title="Остановить запись видео" onClick={()=>recorder.current?.stop()}><Icon name="stop"/></button>}
      {draft&&<IconButton icon="send" type="button" disabled={sending} label="Отправить видео" title="Отправить видео" onClick={send}/>}
      <IconButton icon="close" type="button" disabled={sending} label="Закрыть запись видео" title="Закрыть запись видео" onClick={close}/>
    </div>
    {error&&<p role="alert">{error}</p>}
  </section>;
}

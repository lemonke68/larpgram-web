import {useEffect,useRef,useState} from 'react';
import {MsgType,type MatrixClient} from 'matrix-js-sdk';
import {encryptAttachment} from 'matrix-encrypt-attachment';
import {chooseRecordingType,normalizeWaveform,voiceMetadata,waveformBars} from './voice';

type Draft={blob:Blob;url:string;duration:number;waveform:number[]};
export function VoiceRecorder({client,roomId,encrypted}:{client:MatrixClient;roomId:string;encrypted:boolean}){
 const [state,setState]=useState<'idle'|'starting'|'recording'|'preview'|'sending'>('idle');
 const [draft,setDraft]=useState<Draft|null>(null),[error,setError]=useState(''),[seconds,setSeconds]=useState(0);
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),context=useRef<AudioContext|null>(null);
 const timer=useRef<ReturnType<typeof setInterval>|null>(null),alive=useRef(true),cancelled=useRef(false),draftRef=useRef<Draft|null>(null);
 function release(){if(timer.current)clearInterval(timer.current);timer.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;void context.current?.close();context.current=null}
 function discard(){cancelled.current=true;if(recorder.current?.state==='recording')recorder.current.stop();release();if(draftRef.current)URL.revokeObjectURL(draftRef.current.url);draftRef.current=null;setDraft(null);setState('idle')}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;cancelled.current=true;if(recorder.current?.state==='recording')recorder.current.stop();release();if(draftRef.current)URL.revokeObjectURL(draftRef.current.url)}},[]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(state!=='idle'){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[state]);
 async function begin(){
 setError('');setState('starting');cancelled.current=false;
 try{
 if(!encrypted)throw Error('В прототипе голосовые доступны в зашифрованных чатах');
 if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Запись микрофона недоступна в этом браузере');
 const mimeType=chooseRecordingType(t=>MediaRecorder.isTypeSupported(t));
 const mic=await navigator.mediaDevices.getUserMedia({audio:true});
 if(!alive.current||cancelled.current){mic.getTracks().forEach(t=>t.stop());return}
 stream.current=mic;const audio=new AudioContext();context.current=audio;await audio.resume();
 if(!alive.current||cancelled.current){release();return}
 const analyser=audio.createAnalyser();analyser.fftSize=2048;audio.createMediaStreamSource(mic).connect(analyser);
 const frame=new Float32Array(analyser.fftSize),samples:number[]=[],chunks:Blob[]=[];
 const r=new MediaRecorder(mic,{mimeType});recorder.current=r;const started=performance.now();
 r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
 r.onerror=()=>{cancelled.current=true;release();if(alive.current){setError('Не удалось завершить запись');setState('idle')}};
 r.onstop=()=>{
 const duration=performance.now()-started;release();recorder.current=null;
 if(cancelled.current||!alive.current)return;
 const blob=new Blob(chunks,{type:r.mimeType});
 if(blob.size===0){setError('Микрофон не записал звук');setState('idle');return}
 const d={blob,url:URL.createObjectURL(blob),duration,waveform:samples};draftRef.current=d;setDraft(d);setState('preview');
 };
 mic.getAudioTracks()[0].onended=()=>{if(r.state==='recording'){setError('Микрофон отключён — запись остановлена');r.stop()}};
 r.start(250);setSeconds(0);setState('recording');
 timer.current=setInterval(()=>{analyser.getFloatTimeDomainData(frame);samples.push(Math.sqrt(frame.reduce((s,v)=>s+v*v,0)/frame.length));setSeconds(Math.floor((performance.now()-started)/1000));if(performance.now()-started>=300000&&r.state==='recording')r.stop()},100);
 }catch(e){release();if(alive.current){setError(e instanceof DOMException&&e.name==='NotAllowedError'?'Нет разрешения на микрофон':e instanceof Error?e.message:'Не удалось включить микрофон');setState('idle')}}
 }
 async function send(){if(!draft)return;setError('');setState('sending');try{
 const result=await encryptAttachment(await draft.blob.arrayBuffer());
 const uploaded=await client.uploadContent(new Blob([result.data]),{type:'application/octet-stream',includeFilename:false});
 const extension=draft.blob.type.includes('ogg')?'ogg':draft.blob.type.includes('mp4')?'m4a':'webm';
 await client.sendMessage(roomId,{msgtype:MsgType.Audio,body:`Voice message.${extension}`,file:{...result.info,v:'v2',hashes:{sha256:result.info.hashes!.sha256!},url:uploaded.content_uri},info:{mimetype:draft.blob.type,size:draft.blob.size,duration:Math.round(draft.duration)},...voiceMetadata(draft.duration,draft.waveform)});
 discard();
 }catch{if(alive.current){setError('Не удалось отправить голосовое. Запись сохранена для повторной отправки.');setState('preview')}}}
 return <section className="voice-recorder" aria-label="Голосовое сообщение">{state==='idle'&&<button type="button" onClick={begin}>Записать голосовое</button>}{state==='starting'&&<><span>Ожидание микрофона…</span><button type="button" onClick={discard}>Отмена</button></>}{state==='recording'&&<><span role="status">Запись · {seconds} с</span><button type="button" onClick={()=>recorder.current?.stop()}>Остановить</button><button type="button" onClick={discard}>Отмена</button></>}{draft&&<><audio controls src={draft.url}/><div className="waveform" aria-hidden="true">{waveformBars(normalizeWaveform(draft.waveform)).map((h,i)=><i key={i} style={{height:Math.max(2,Math.round(h*24))+'px'}}/>)}</div><span>{Math.round(draft.duration/1000)} с</span><button type="button" disabled={state==='sending'} onClick={send}>{state==='sending'?'Отправка…':'Отправить голосовое'}</button><button type="button" disabled={state==='sending'} onClick={discard}>Удалить запись</button></>}{error&&<p role="alert">{error}</p>}</section>
}

import {useEffect,useRef,useState} from 'react';
import type {MatrixClient} from 'matrix-js-sdk';
import {ElementCall,initializeElementCall,UserIntent,type ElementCallHandle,type ElementCallHostBridge} from '@element-hq/element-call-component';
import '@element-hq/element-call-component/style.css';
import type {CallIntent} from './callUtils';

let pending:Promise<void>|null=null;
const init=()=>pending??=initializeElementCall({});

export function CallOverlay({client,roomId,intent,onClose}:{client:MatrixClient;roomId:string;intent:CallIntent;onClose:()=>void}){
 const [ready,setReady]=useState(false),[error,setError]=useState('');
 const handle=useRef<ElementCallHandle>(null);
 useEffect(()=>{let alive=true;init().then(()=>{if(alive)setReady(true)}).catch(()=>{if(alive)setError('Не удалось подготовить звонок')});return()=>{alive=false}},[]);
 const bridge:ElementCallHostBridge={close:async()=>{onClose()}};
 return <div className="call-overlay" role="dialog" aria-label="Звонок">
  {error?<p role="alert">{error}</p>:ready?<ElementCall ref={handle} client={client} roomId={roomId} intent={intent as unknown as UserIntent} hostBridge={bridge} theme="dark"/>:<p>Подготовка звонка…</p>}
  <button type="button" className="call-leave" onClick={()=>{handle.current?.hangUp().catch(()=>{});onClose()}}>Завершить</button>
 </div>;
}

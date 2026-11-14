import {Component,useEffect,useRef,useState,type ReactNode} from 'react';
import type {MatrixClient} from 'matrix-js-sdk';
import {ElementCall,initializeElementCall,UserIntent,type ElementCallHandle,type ElementCallHostBridge} from '@element-hq/element-call-component';
import '@element-hq/element-call-component/style.css';
import type {CallIntent} from './callUtils';
import {Icon} from './Icon';
import {Button,IconButton} from './Controls';

let pending:Promise<void>|null=null;
const init=()=>pending??=initializeElementCall({}).catch(error=>{pending=null;throw error});

class CallContentBoundary extends Component<{children:ReactNode;onRetry:()=>void},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 render(){
  return this.state.failed?<div className="viewer-state"><p role="alert">Не удалось открыть интерфейс звонка.</p>
   <Button onClick={this.props.onRetry}>Повторить</Button></div>:this.props.children;
 }
}

export function CallOverlay({client,roomId,intent,theme,onClose}:{client:MatrixClient;roomId:string;intent:CallIntent;theme:'dark'|'light';onClose:()=>void}){
 const [ready,setReady]=useState(false);
 const [error,setError]=useState('');
 const [collapsed,setCollapsed]=useState(false);
 const [joined,setJoined]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const handle=useRef<ElementCallHandle>(null);
 useEffect(()=>{
  let alive=true;
  init().then(()=>{if(alive)setReady(true)}).catch(()=>{if(alive)setError('Не удалось подготовить звонок')});
  return ()=>{alive=false};
 },[attempt]);
 const bridge:ElementCallHostBridge={
  close:async()=>{onClose()},
  notifyJoined:async()=>{setJoined(true)},
  notifyHungUp:async()=>{onClose()},
 };
 return <section className="call-overlay" data-collapsed={collapsed} aria-label="Звонок">
  <header className="call-toolbar">
   <Icon name="phone"/><strong>{client.getRoom(roomId)?.name??'Звонок'}</strong>
   {collapsed&&!joined&&!error&&<small role="status">Подключение…</small>}
   <IconButton icon={collapsed?'maximize':'minimize'} label={collapsed?'Развернуть':'Свернуть'} onClick={()=>setCollapsed(value=>!value)}/>
   <IconButton icon="hangup" label="Завершить звонок" className="call-leave" onClick={()=>{void handle.current?.hangUp().catch(()=>{});onClose()}}/>
  </header>
  <div className="call-content" inert={collapsed} aria-hidden={collapsed||undefined}>
   {error?<div className="viewer-state"><p role="alert">{error}</p><Button onClick={()=>{setError('');setAttempt(value=>value+1)}}>Повторить</Button></div>:ready?<CallContentBoundary key={attempt} onRetry={()=>setAttempt(value=>value+1)}><ElementCall ref={handle} client={client} roomId={roomId} intent={intent as unknown as UserIntent} hostBridge={bridge} theme={theme}/></CallContentBoundary>:<p role="status">Подготовка звонка…</p>}
  </div>
 </section>;
}

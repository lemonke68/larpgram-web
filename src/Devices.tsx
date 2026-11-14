import {useEffect,useState} from 'react';
import type {MatrixClient} from 'matrix-js-sdk';
import {api,type Session} from './session';
import {Button,Confirm} from './Controls';
import {Icon} from './Icon';

type Device=Awaited<ReturnType<MatrixClient['getDevices']>>['devices'][number];

export function Devices({client,session}:{client:MatrixClient;session:Session}){
 const [devices,setDevices]=useState<Device[]|null>(null);
 const [target,setTarget]=useState<Device|null>(null);
 const [attempt,setAttempt]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  setDevices(null);setError('');
  void client.getDevices().then(result=>{if(active)setDevices(result.devices)},()=>{if(active)setError('Не удалось загрузить устройства.')});
  return ()=>{active=false};
 },[client,attempt]);

 async function endSession(){
  if(!target||busy)return;
  setBusy(true);setError('');
  try{
   await api('/account/sessions/end',{device_id:target.device_id},session.accessToken);
   setDevices(current=>current?.filter(device=>device.device_id!==target.device_id)??null);
   setTarget(null);
  }catch{setError('Не удалось завершить сеанс устройства.')}
  finally{setBusy(false)}
 }
 const row=(device:Device,current:boolean)=><div className="device-row" key={device.device_id}>
  <Icon name={current?'maximize':'devices'} size={18}/><div><strong>{device.display_name||device.device_id}</strong>
  {device.last_seen_ts&&<small>{new Date(device.last_seen_ts).toLocaleString('ru')}</small>}</div>
  {!current&&<Button onClick={()=>{setError('');setTarget(device)}}>Завершить сеанс</Button>}
 </div>;
 const own=devices?.find(device=>device.device_id===session.deviceId);
 const others=devices?.filter(device=>device.device_id!==session.deviceId)??[];
 return <div className="device-list">
  {!devices&&(error?<p role="alert">{error} <Button onClick={()=>setAttempt(value=>value+1)}>Повторить</Button></p>:<p role="status">Загружаем устройства…</p>)}
  {devices&&<>
   <h3>Этот браузер</h3><div className="settings-group glass">{row(own??{device_id:session.deviceId,display_name:'Larpgram Web'},true)}</div>
   <h3>Другие сеансы</h3><div className="settings-group glass">{others.length?others.map(device=>row(device,false)):<p>Других сеансов нет.</p>}</div>
  </>}
  {target&&<Confirm title="Завершить сеанс?" action="Завершить сеанс" busy={busy} onCancel={()=>setTarget(null)} onConfirm={()=>void endSession()}><p>{target.display_name||target.device_id}</p>{error&&<p role="alert">{error}</p>}</Confirm>}
 </div>;
}

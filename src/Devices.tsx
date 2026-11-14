import {useEffect,useState} from 'react';
import type {MatrixClient} from 'matrix-js-sdk';
import {api,type Session} from './session';

type Device = Awaited<ReturnType<MatrixClient['getDevices']>>['devices'][number];

export function Devices({client,session}:{client:MatrixClient;session:Session}){
  const [devices,setDevices]=useState<Device[]>([]);
  const [target,setTarget]=useState<Device|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    void client.getDevices().then(result=>{
      if(active)setDevices(result.devices);
    }).catch(()=>{
      if(active)setError('Не удалось загрузить устройства.');
    }).finally(()=>{
      if(active)setLoading(false);
    });
    return ()=>{active=false};
  },[client]);

  async function endSession(){
    if(!target||busy)return;
    setBusy(true);
    setError('');
    try{
      await api('/account/sessions/end',{device_id:target.device_id},session.accessToken);
      setDevices(current=>current.filter(device=>device.device_id!==target.device_id));
      setTarget(null);
    }catch{
      setError('Не удалось завершить сеанс устройства.');
    }finally{
      setBusy(false);
    }
  }

  return <div className="device-list">
    {loading&&<p role="status">Загружаем устройства…</p>}
    {error&&<p role="alert">{error}</p>}
    {devices.map(device=><div className="device-row" key={device.device_id}>
      <div><strong>{device.display_name||device.device_id}</strong>
      {device.device_id===session.deviceId&&<small>Текущий браузер</small>}</div>
      {device.device_id!==session.deviceId&&<button type="button" disabled={busy} onClick={()=>setTarget(device)}>Завершить сеанс</button>}
    </div>)}
    {target&&<div className="device-confirm">
      <p>Завершить сеанс устройства {target.display_name||target.device_id}?</p>
      <button type="button" disabled={busy} onClick={()=>setTarget(null)}>Отмена</button>
      <button type="button" disabled={busy} onClick={()=>void endSession()}>Подтвердить</button>
    </div>}
  </div>;
}

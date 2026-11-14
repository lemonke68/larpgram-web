import * as sdk from 'matrix-js-sdk';
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key';
import { openEscrow } from './escrow';
import { verifyOwnDevice } from './verification';
export interface Session {userId:string;deviceId:string;accessToken:string}
const recoveryKeys=new WeakMap<sdk.MatrixClient,Uint8Array<ArrayBuffer>>();
const KEY='larpgram.session.v1';
export const savedSession=():Session|null=>{const s=localStorage.getItem(KEY);if(!s)return null;const v=JSON.parse(s);if(!v.userId||!v.deviceId||!v.accessToken)throw Error('Повреждена сохранённая сессия');return v};
export async function api(path:string,body?:unknown,token?:string,includeErrorCode=false){
 const r=await fetch(path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 if(!r.ok){
  if(includeErrorCode){
   const payload=await r.json().catch(()=>null);
   if(typeof payload?.error==='string')throw Error(payload.error);
  }
  throw Error(`Запрос не выполнен (${r.status})`);
 }return r.status===204?null:r.json();
}
export async function login(username:string,password:string):Promise<Session>{
 const r=await api('/_matrix/client/v3/login',{type:'m.login.password',identifier:{type:'m.id.user',user:username},password,initial_device_display_name:'Larpgram Web'});
 const s={userId:r.user_id,deviceId:r.device_id,accessToken:r.access_token};localStorage.setItem(KEY,JSON.stringify(s));return s;
}
export async function start(s:Session,onChange:()=>void){
 const c=sdk.createClient({timelineSupport:true,baseUrl:location.origin,userId:s.userId,deviceId:s.deviceId,accessToken:s.accessToken,cryptoCallbacks:{getSecretStorageKey:async ({keys})=>{const raw=recoveryKeys.get(c);const id=await c.secretStorage.getDefaultKeyId();return raw&&id&&keys[id]?[id,raw]:null}}});
 await c.initRustCrypto({cryptoDatabasePrefix:`larpgram-${s.deviceId}`});
 c.on(sdk.ClientEvent.Sync,onChange);c.on(sdk.RoomEvent.Timeline,onChange);c.on(sdk.MatrixEventEvent.Decrypted,onChange);
 c.on(sdk.MatrixEventEvent.Replaced,onChange);
 c.on(sdk.RoomEvent.LocalEchoUpdated,onChange);
 c.on(sdk.RoomEvent.Redaction,onChange);
 c.on(sdk.RoomEvent.MyMembership,onChange);
 c.on(sdk.RoomEvent.Tags,onChange);
 c.on(sdk.RoomEvent.Receipt,onChange);
 c.on(sdk.RoomStateEvent.Events,onChange);
 c.on(sdk.ClientEvent.AccountData,onChange);
 c.on(sdk.UserEvent.AvatarUrl,onChange);
 c.on(sdk.UserEvent.DisplayName,onChange);
 await c.startClient({initialSyncLimit:40});return c;
}
export function waitForInitialSync(client:sdk.MatrixClient,signal:AbortSignal):Promise<void>{
 if(signal.aborted)return Promise.reject(signal.reason);
 if(client.isInitialSyncComplete())return Promise.resolve();

 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>finish(Error('Истекло время ожидания синхронизации')),30000);
  function finish(error?:unknown){
   clearTimeout(timeout);
   client.off(sdk.ClientEvent.Sync,onSync);
   signal.removeEventListener('abort',onAbort);
   if(error)reject(error);
   else resolve();
  }
  function onSync(state:sdk.SyncState){
   if(state===sdk.SyncState.Prepared||state===sdk.SyncState.Syncing)finish();
  }
  function onAbort(){finish(signal.reason)}
  client.on(sdk.ClientEvent.Sync,onSync);
  signal.addEventListener('abort',onAbort,{once:true});
 });
}

export async function recover(c:sdk.MatrixClient,s:Session,password:string,manual:string,signal?:AbortSignal){
 signal?.throwIfAborted();
 let key=manual.trim();
 if(!key){const r=await api('/escrow/v2/blob',undefined,s.accessToken);key=await openEscrow(r.blob,password,s.userId)}
 password='';
 signal?.throwIfAborted();
 const raw=decodeRecoveryKey(key);
 key='';
 try {
 const crypto=c.getCrypto()!;
 // The escrow key protects Matrix secret storage, not the backup directly.
 recoveryKeys.set(c,raw);
 await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
 signal?.throwIfAborted();
 await crypto.checkKeyBackupAndEnable();
 const result = await crypto.restoreKeyBackup();
 signal?.throwIfAborted();
 try{
  await verifyOwnDevice(c);
  return {imported:result.imported,verified:true};
 }catch{
  return {imported:result.imported,verified:false};
 }
 }finally{raw.fill(0);recoveryKeys.delete(c)}
}
export async function logout(c:sdk.MatrixClient,s:Session){
 await api('/account/sessions/end',{device_id:s.deviceId},s.accessToken);
 c.stopClient();await c.clearStores();localStorage.removeItem(KEY);
}

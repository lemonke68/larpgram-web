import {EventType,HistoryVisibility,Method,Preset,Visibility,type MatrixClient} from 'matrix-js-sdk';
import icons from './androidIcons.json';

const type='ru.mangokokos.larpgram.saved_messages';
declare module 'matrix-js-sdk/lib/@types/event' {
 interface AccountDataEvents { 'ru.mangokokos.larpgram.saved_messages':{room_id:string} }
}
const pending=new WeakMap<MatrixClient,string>();
const opening=new WeakMap<MatrixClient,Promise<string>>();

export function savedMessagesId(client:MatrixClient){
 return client.getAccountData(type)?.getContent().room_id;
}

async function makeAvatar(){
 const canvas=document.createElement('canvas');
 canvas.width=canvas.height=512;
 const ctx=canvas.getContext('2d')!;
 const gradient=ctx.createLinearGradient(0,0,0,512);
 gradient.addColorStop(0,'#69bffa');gradient.addColorStop(1,'#3d9de0');
 ctx.fillStyle=gradient;ctx.fillRect(0,0,512,512);
 ctx.translate(512*.275,512*.275);ctx.scale(512*.45/24,512*.45/24);
 ctx.fillStyle='#fff';ctx.fill(new Path2D(icons.bookmark.nodes[0].d));
 return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG недоступен'))));
}

export function openSavedMessages(client:MatrixClient){
 const active=opening.get(client);
 if(active)return active;
 const request=readOrCreate(client).finally(()=>opening.delete(client));
 opening.set(client,request);
 return request;
}
async function readOrCreate(client:MatrixClient){
 // Read server account data before any creation; the sync cache can be empty on startup.
 let data:{room_id?:string}|undefined;
 try{
  data=await client.http.authedRequest(Method.Get,`/user/${encodeURIComponent(client.getSafeUserId())}/account_data/${type}`,undefined,undefined,{prefix:'/_matrix/client/v3'});
 }catch(error){
  if((error as {errcode?:string}).errcode!=='M_NOT_FOUND')throw error;
 }
 const stored=data?.room_id;
 if(stored&&/^![^\s]+$/.test(stored)&&!['leave','ban'].includes(client.getRoom(stored)?.getMyMembership()??''))return stored;
 let id=pending.get(client);
 if(!id){
  id=(await client.createRoom({name:'Избранное',is_direct:false,visibility:Visibility.Private,preset:Preset.PrivateChat,
   initial_state:[
    {type:EventType.RoomEncryption,state_key:'',content:{algorithm:'m.megolm.v1.aes-sha2'}},
    {type:EventType.RoomHistoryVisibility,state_key:'',content:{history_visibility:HistoryVisibility.Shared}},
   ],
  })).room_id;
  pending.set(client,id);
 }
 await client.setAccountData(type,{room_id:id});
 pending.delete(client);
 try{
  const uploaded=await client.uploadContent(await makeAvatar(),{includeFilename:false});
  await client.sendStateEvent(id,EventType.RoomAvatar,{url:uploaded.content_uri},'');
 }catch{/* The room and account-data link are already usable. */}
 return id;
}

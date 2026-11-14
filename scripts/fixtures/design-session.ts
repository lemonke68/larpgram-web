// Used only by a temporary local copy in browser acceptance. No production imports.
import {EventType,MatrixEvent,Room,User,createClient,type MatrixClient} from 'matrix-js-sdk';

const session={userId:'@mila-fixture-with-a-long-matrix-identifier:example.invalid',deviceId:'DEMO_BROWSER',accessToken:'fixture-only'};
const ids={direct:'!direct:example.invalid',group:'!group:example.invalid',channel:'!channel:example.invalid',saved:'!saved:example.invalid'};
const remote='@toluze-fixture:example.invalid';
const read=(key:string,fallback:string)=>localStorage.getItem('fixture-'+key)??fallback;
const write=(key:string,value:string)=>localStorage.setItem('fixture-'+key,value);
const failures=new Set<string>();
Object.assign(window,{fixtureFailures:failures});
export const savedSession=()=>location.search.includes('signed-out')?null:session;
export async function start(_session:unknown,onChange:()=>void){
 const client=createClient({baseUrl:location.origin,userId:session.userId,deviceId:session.deviceId,accessToken:session.accessToken,timelineSupport:true});
 const own=new User(session.userId);own.setDisplayName(read('name','Мила Орлова — длинное отображаемое имя для проверки'));own.setAvatarUrl(read('avatar',''));client.store.storeUser(own);
 const peer=new User(remote);peer.setDisplayName('Toluze · фикстура');client.store.storeUser(peer);
 let seq=0;
 const add=(r:Room,type:string,sender:string,content:object,state_key?:string,ts=Date.now())=>new MatrixEvent({room_id:r.roomId,event_id:'$fixture'+ ++seq,type,sender,content,state_key,origin_server_ts:ts});
 const rooms=Object.entries(ids).map(([type,id])=>{
  const room=new Room(id,client,session.userId,{timelineSupport:true});
  room.name={direct:'Toluze · фикстура',group:'Мастерская · фикстура',channel:'Новости · фикстура',saved:'Избранное'}[type]!;
  room.updateMyMembership('join');
  const state=[
   add(room,EventType.RoomMember,session.userId,{membership:'join',displayname:own.displayName},session.userId),
   ...(type==='saved'?[]:[add(room,EventType.RoomMember,remote,{membership:'join',displayname:peer.displayName},remote)]),
   add(room,EventType.RoomPowerLevels,session.userId,type==='channel'?{events_default:50,users:{[remote]:100}}:{users:{[session.userId]:100}},''),
   ...(type==='channel'?[]:[add(room,EventType.RoomEncryption,session.userId,{algorithm:'m.megolm.v1.aes-sha2'},'')]),
  ];
  room.currentState.setStateEvents(state);client.store.storeRoom(room);
  const events=Array.from({length:type==='direct'?46:4},(_,i)=>add(room,EventType.RoomMessage,i%3===0?session.userId:remote,
   i===42?{msgtype:'m.image',body:'Тестовое фото',url:'mxc://example.invalid/image',info:{w:800,h:560,mimetype:'image/png'}}:
   {msgtype:'m.text',body:i%3===0?'Проверяю, как выглядят сообщения в переписке.':'Макет для проверки ленты, навигации и кнопок.'},undefined,Date.now()-((50-i)*60_000)));
  void room.addLiveEvents(events,{addToState:false});return room;
 });
 const account=new Map<string,MatrixEvent>([
  ['m.direct',new MatrixEvent({type:'m.direct',content:{[remote]:[ids.direct]}})],
  ['ru.mangokokos.larpgram.saved_messages',new MatrixEvent({type:'ru.mangokokos.larpgram.saved_messages',content:{room_id:ids.saved}})],
 ]);
 const master={rule_id:'.m.rule.master',enabled:read('muted','no')==='yes'};
 return Object.assign(client,{
  getSyncState:()=>null,isInitialSyncComplete:()=>true,stopClient(){}, matrixRTC:{getActiveRoomSession:()=>null,getRoomSession:()=>null},
  getAccountData:(key:string)=>account.get(key)??null,
  getRooms:()=>rooms,getRoom:(id:string)=>rooms.find(room=>room.roomId===id)??null,
  getCrypto:()=>({isCrossSigningReady:async()=>true,getKeyBackupInfo:async()=>({version:'1'}),getDeviceVerificationStatus:async()=>({crossSigningVerified:false})}),
  getProfileInfo:async()=>({displayname:own.displayName,avatar_url:own.avatarUrl}),
  getIgnoredUsers:()=>read('ignored',remote).split(',').filter(Boolean),isUserIgnored:()=>false,
  setIgnoredUsers:async(ids:string[])=>write('ignored',ids.join(',')),
  getThreePids:async()=>({threepids:[{medium:'email',address:'mila@example.invalid'}]}),
  getDevices:async()=>{if(failures.has('devices'))throw Error();return {devices:[{device_id:session.deviceId,display_name:'Larpgram Web'},...(read('ended','no')==='yes'?[]:[{device_id:'DEMO_ANDROID',display_name:'Larpgram Android',last_seen_ts:1780000000000}])]};},
  setDisplayName:async(name:string)=>{if(failures.has('name'))throw Error();write('name',name)},
  setAvatarUrl:async(url:string)=>{if(failures.has('avatar'))throw Error();write('avatar',url)},
  uploadContent:async()=>({content_uri:'mxc://example.invalid/image'}),
  http:Object.assign(client.http,{authedRequest:async(method:string,path:string,_query:unknown,content:Record<string,string>)=>{
   if(path.includes('/account_data/'))return {room_id:ids.saved};
   if(failures.has('bio'))throw Error();
   const field='ru.mangokokos.about';
   if(method==='GET')return {[field]:read('bio','Мастер по реквизиту, ролевик с 2015')};
   write('bio',method==='DELETE'?'':content[field]);
  }}),
  pushRules:{global:{override:[master]}},getPushRules:async()=>({global:{override:[master]}}),
  setPushRuleEnabled:async(_a:string,_b:string,_c:string,enabled:boolean)=>{master.enabled=enabled;write('muted',enabled?'yes':'no')},
  sendReadReceipt:async()=>{},paginateEventTimeline:async()=>false,
  sendTextMessage:async(roomId:string,body:string)=>{const room=client.getRoom(roomId)!;await room.addLiveEvents([add(room,EventType.RoomMessage,session.userId,{msgtype:'m.text',body})],{addToState:false});onChange()},
 }) as unknown as MatrixClient;
}
export async function api(path:string,body?:any){
 switch(path){
  case '/account/email/start':case '/account/password/forgot':return {ticket:'fixture',resend_after:0};
  case '/account/email/confirm':case '/account/code/check':case '/account/password/reset':
   if(body.code!=='123456')throw Error('wrong_code');return {email:'changed@example.invalid'};
  case '/account/code/resend':return {resend_after:5};
  case '/account/sessions/end':if(failures.has('end'))throw Error();write('ended','yes');return null;
  case '/escrow/v2/state':return {blob:false};
  default:throw Error('Unsupported fixture endpoint');
 }
}
export async function recover(_c:unknown,_s:unknown,password:string,key:string){
 if((password||key)!=='fixture-valid')throw Error('Invalid fixture secret');return {imported:4,verified:true};
}
export async function waitForInitialSync(){}
export async function logout(){if(failures.has('end'))throw Error('Fixture logout failure')}
export async function login(){throw Error('Fixture only')}

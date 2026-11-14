import {useEffect,useState} from 'react';
import {EventType,RelationType,RoomEvent,type MatrixClient,type MatrixEvent,type Room} from 'matrix-js-sdk';
import {getCallNotificationExpiry,parseCallNotificationContent} from 'matrix-js-sdk/lib/matrixrtc';
import {activeCall} from './callUtils';

export function useIncomingCall(client:MatrixClient|null){
 const [incoming,setIncoming]=useState<{room:Room;sender:string;id:string;expires:number;video:boolean;legacy:boolean}|null>(null);
 useEffect(()=>{
  const userId=client?.getUserId();
  if(!client||!userId)return;
  let active=true;
  const seen=new Set<string>();
  const onTimeline=(event:MatrixEvent,room?:Room,toStart?:boolean)=>{
   const type=event.getType(),sender=event.getSender(),id=event.getId();
   if(toStart||!room||room.getMyMembership()!=='join'||!id||!sender||sender===userId||seen.has(id))return;
   if(type!==EventType.RTCNotification&&type!==EventType.CallNotify)return;
   if(Date.now()-event.getTs()>120000)return;
   seen.add(id);
   void (async()=>{
    try{
     const legacy=type===EventType.CallNotify;
     const raw=event.getContent();
     if(legacy&&(raw.notify_type!=='ring'||!activeCall(client,room)))return;
     const content=legacy?null:await parseCallNotificationContent(event,{room,userId});
     if(content?.notification_type==='notification')return;
     const expires=content?getCallNotificationExpiry(content,event.getTs()):event.getTs()+30000;
     if(active&&expires>Date.now())setIncoming({room,sender,id,expires,video:(content?.['m.call.intent']??raw['m.call.intent'])!=='audio',legacy});
    }catch{}
   })();
  };
  client.on(RoomEvent.Timeline,onTimeline);
  return ()=>{active=false;client.off(RoomEvent.Timeline,onTimeline)};
 },[client]);
 useEffect(()=>{
  if(!incoming)return;
  const timeout=setTimeout(()=>setIncoming(null),Math.max(0,incoming.expires-Date.now()));
  return ()=>clearTimeout(timeout);
 },[incoming]);
 function dismiss(){
  setIncoming(null);
 }
 async function decline(){
  if(!incoming||!client)return;
  dismiss();
  if(!incoming.legacy)await client.sendEvent(incoming.room.roomId,EventType.RTCDecline,{
   'm.relates_to':{rel_type:RelationType.Reference,event_id:incoming.id},
  });
 }
 return {incoming,dismiss,decline};
}

import {EventType,type MatrixClient,type Room} from 'matrix-js-sdk';
import {savedMessagesId} from "./savedMessages";

export function directPeers(client:MatrixClient|null){
  const peers=new Map<string,string>();
  const direct=client?.getAccountData(EventType.Direct)?.getContent()??{};
  for(const [userId,rooms] of Object.entries(direct)){
    if(userId===client?.getUserId()||!Array.isArray(rooms))continue;
    for(const room of rooms)if(typeof room==='string')peers.set(room,userId);
  }
  return peers;
}

export function userPresentation(client:MatrixClient,room:Room|null,userId:string){
  const member=room?.getMember(userId);
  const user=client.getUser(userId);
  return {name:member?.name||user?.displayName||userId,mxc:member?.getMxcAvatarUrl()||user?.avatarUrl,identity:userId};
}

export function roomPresentation(client:MatrixClient,room:Room,peers:Map<string,string>){
  const members=room.getMembers().filter(member=>['join','invite'].includes(member.membership??''));
  const other=members.find(member=>member.userId!==client.getUserId());
  const create=room.currentState.getStateEvents(EventType.RoomCreate,'')?.getContent();
  const alias=room.getCanonicalAlias();
  const topic=room.currentState.getStateEvents(EventType.RoomTopic,'')?.getContent().topic;
  const joinRule=room.currentState.getStateEvents(EventType.RoomJoinRules,'')?.getContent().join_rule;
  // Some older direct chats have lost their m.direct entry. Match the peer's name
  // in private two-person rooms with no group metadata.
  const namedForPeer=other&&[other.name,userHandle(other.userId),userHandle(other.userId).slice(1)]
    .some(name=>name?.toLocaleLowerCase()===room.name.trim().toLocaleLowerCase());
  const inferred=room.getInvitedAndJoinedMemberCount()===2&&!isBroadcastRoom(room)&&!alias&&!topic&&
    !create?.type&&joinRule!=='public'&&namedForPeer?other.userId:undefined;
  const peer=peers.get(room.roomId)??(room.getInvitedAndJoinedMemberCount()<=2?room.getDMInviter():undefined)??inferred;
  const saved=room.roomId===savedMessagesId(client);
  return {
    peer:saved?undefined:peer,
    avatar:{name:room.name,mxc:room.getMxcAvatarUrl()||(peer?userPresentation(client,room,peer).mxc:null),identity:room.roomId,saved},
  };
}


export function isBroadcastRoom(room:Room){
  const power=room.currentState.getStateEvents(EventType.RoomPowerLevels,'')?.getContent();
  return Number(power?.events_default??0)>0;
}

export function memberCountLabel(room:Room){
  const count=room.getJoinedMemberCount();
  const form=new Intl.PluralRules('ru').select(count);
  const labels=isBroadcastRoom(room)?['подписчик','подписчика','подписчиков']:['участник','участника','участников'];
  return count+' '+labels[form==='one'?0:form==='few'?1:2];
}

export const userHandle=(id:string)=>id.split(':',1)[0];

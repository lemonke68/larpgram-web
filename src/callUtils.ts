import type {MatrixClient,Room} from 'matrix-js-sdk';

// Строковые значения совпадают с UserIntent из element-call (src/UrlParams.ts).
// Держим их здесь, чтобы основной бандл не тянул компонент звонка статически.
export type CallIntent='start_call'|'join_existing'|'start_call_voice'|'join_existing_voice'|'start_call_dm'|'start_call_dm_voice'|'join_existing_dm'|'join_existing_dm_voice';

export function activeCall(client:MatrixClient,room:Room):boolean{
 return (client.matrixRTC.getActiveRoomSession(room)?.memberships.length??0)>0;
}
export function intentFor(dm:boolean,video:boolean,join:boolean):CallIntent{
 if(dm)return join?(video?'join_existing_dm':'join_existing_dm_voice'):(video?'start_call_dm':'start_call_dm_voice');
 return join?(video?'join_existing':'join_existing_voice'):(video?'start_call':'start_call_voice');
}

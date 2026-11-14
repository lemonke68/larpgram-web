// Совместимость с Element Call: компонент собран против develop-снимка
// matrix-js-sdk (42.2.0), где был guard isLivekitTransportConfig. В релизе
// 45.0.0 транспорты перестроены (UnstableLivekitTransport), этого экспорта нет.
// Семантика скопирована из js-sdk develop: type "livekit" + livekit_service_url.
export * from 'matrix-js-sdk/lib/matrixrtc/index.js';
export interface LivekitTransportConfigShim{type:'livekit';livekit_service_url:string}
export const isLivekitTransportConfig=(object:unknown):object is LivekitTransportConfigShim=>
 typeof object==='object'&&object!==null&&(object as {type?:unknown}).type==='livekit'&&'livekit_service_url' in object;

// Element Call still uses the develop snapshot's join/leave API. Adapt the
// existing session so the host and the call share membership and media keys.
import {MatrixRTCSession,type Transport} from 'matrix-js-sdk/lib/matrixrtc/index.js';

Object.assign(MatrixRTCSession.prototype,{
 joinRTCSession(
  this:MatrixRTCSession,
  identity:Parameters<MatrixRTCSession['join']>[0],
  preferred:Transport[],
  active?:Transport,
  config?:Parameters<MatrixRTCSession['join']>[2],
 ){
  this.join(identity,active?[active,...preferred]:preferred,config);
 },
 leaveRoomSession(this:MatrixRTCSession,timeout?:number){
  return this.leave(timeout);
 },
});

// Совместимость с Element Call: компонент собран против develop-снимка
// matrix-js-sdk (42.2.0), где был guard isLivekitTransportConfig. В релизе
// 45.0.0 транспорты перестроены (UnstableLivekitTransport), этого экспорта нет.
// Семантика скопирована из js-sdk develop: type "livekit" + livekit_service_url.
export * from 'matrix-js-sdk/lib/matrixrtc/index.js';
export interface LivekitTransportConfigShim{type:'livekit';livekit_service_url:string}
export const isLivekitTransportConfig=(object:unknown):object is LivekitTransportConfigShim=>
 typeof object==='object'&&object!==null&&(object as {type?:unknown}).type==='livekit'&&'livekit_service_url' in object;

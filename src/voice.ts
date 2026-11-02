export const VOICE_TYPES = ['audio/ogg;codecs=opus','audio/webm;codecs=opus','audio/mp4'];
export function chooseRecordingType(supported:(mime:string)=>boolean):string {
 const type=VOICE_TYPES.find(supported);
 if(!type)throw Error('Браузер не поддерживает запись в доступном аудиоформате');
 return type;
}
export function normalizeWaveform(samples:number[]):number[]{
 if(!samples.length)return [];
 const count=Math.min(120,samples.length);
 const bins=Array.from({length:count},(_,i)=>Math.max(0,...samples.slice(Math.floor(i*samples.length/count),Math.floor((i+1)*samples.length/count)).map(v=>Number.isFinite(v)?v:0)));
 const peak=Math.max(...bins,0.01);
 return bins.map(v=>Math.round(Math.min(1,v/peak)*1024));
}
export function voiceMetadata(durationMs:number,waveform:number[]){
 if(!Number.isFinite(durationMs)||durationMs<1)throw Error('Запись слишком короткая');
 return {'org.matrix.msc3245.voice':{},'org.matrix.msc1767.audio':{duration:Math.round(durationMs),waveform:normalizeWaveform(waveform)}};
}
export interface VoiceDetails{duration?:number;waveform:number[]}
export function voiceDetails(content:Record<string,unknown>):VoiceDetails|null{
 const audio=content['org.matrix.msc1767.audio'];
 if(!audio||typeof audio!=='object')return null;
 const {duration,waveform}=audio as {duration?:unknown;waveform?:unknown};
 const clean=Array.isArray(waveform)?waveform.filter((v):v is number=>Number.isInteger(v)&&v>=0&&v<=1024):[];
 return {duration:typeof duration==='number'&&Number.isFinite(duration)&&duration>0?Math.round(duration):undefined,waveform:clean};
}
export function waveformBars(waveform:number[],bars=48):number[]{
 const clean=waveform.filter(v=>Number.isFinite(v)&&v>=0);
 if(!clean.length)return [];
 const count=Math.min(bars,clean.length);
 return Array.from({length:count},(_,i)=>Math.min(1,Math.max(0,...clean.slice(Math.floor(i*clean.length/count),Math.floor((i+1)*clean.length/count)))/1024));
}
export function formatDuration(ms:number):string{
 const total=Math.round(ms/1000);
 return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
}

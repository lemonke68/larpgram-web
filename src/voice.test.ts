import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseRecordingType,formatDuration,normalizeWaveform,voiceDetails,voiceMetadata,waveformBars} from './voice.ts';
test('uses Opus when available, with MP4 fallback and unsupported error',()=>{
 assert.equal(chooseRecordingType(t=>t.includes('opus')),'audio/ogg;codecs=opus');
 assert.equal(chooseRecordingType(t=>t==='audio/mp4'),'audio/mp4');
 assert.throws(()=>chooseRecordingType(()=>false));
});
test('waveform fits Matrix integer 0..1024 range and bounded payload, silence is valid',()=>{
 const wave=normalizeWaveform(Array.from({length:3000},(_,i)=>i/3000));
 assert.equal(wave.length,120);assert.equal(Math.max(...wave),1024);assert.ok(wave.every(v=>Number.isInteger(v)&&v>=0&&v<=1024));assert.deepEqual(normalizeWaveform([0,0,0]),[0,0,0]);
});
test('voice event carries duration in milliseconds and MSC voice marker',()=>{
 const metadata=voiceMetadata(1500,[0,.25,.5]);
 assert.deepEqual(metadata,{'org.matrix.msc3245.voice':{},'org.matrix.msc1767.audio':{duration:1500,waveform:[0,512,1024]}});
 assert.throws(()=>voiceMetadata(NaN,[]));
});
test('voiceDetails reads msc1767 details and rejects invalid content',()=>{
 assert.deepEqual(voiceDetails({'org.matrix.msc1767.audio':{duration:1500.4,waveform:[0,512,1024]}}),{duration:1500,waveform:[0,512,1024]});
 assert.deepEqual(voiceDetails({'org.matrix.msc1767.audio':{waveform:[0,-1,1025,1.5,'x' as unknown as number,700]}}),{duration:undefined,waveform:[0,700]});
 assert.equal(voiceDetails({'org.matrix.msc1767.audio':'nope'}),null);
 assert.equal(voiceDetails({}),null);
});
test('waveformBars bins to the requested count within 0..1 and clamps overshoot',()=>{
 const bars=waveformBars(Array.from({length:1024},(_,i)=>i+1),12);
 assert.equal(bars.length,12);
 assert.ok(bars.every(v=>v>=0&&v<=1));
 assert.equal(Math.max(...bars),1);
 assert.deepEqual(waveformBars([2048],4),[1]);
 assert.deepEqual(waveformBars([],12),[]);
});
test('formatDuration renders m:ss',()=>{
 assert.equal(formatDuration(1500),'0:02');
 assert.equal(formatDuration(65000),'1:05');
});

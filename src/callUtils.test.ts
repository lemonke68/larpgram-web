import {test} from 'node:test';
import assert from 'node:assert/strict';
import {intentFor} from './callUtils.ts';
test('intentFor maps dm/video/join to element-call UserIntent values',()=>{
 assert.equal(intentFor(true,false,false),'start_call_dm_voice');
 assert.equal(intentFor(true,true,false),'start_call_dm');
 assert.equal(intentFor(true,false,true),'join_existing_dm_voice');
 assert.equal(intentFor(true,true,true),'join_existing_dm');
 assert.equal(intentFor(false,false,false),'start_call_voice');
 assert.equal(intentFor(false,true,false),'start_call');
 assert.equal(intentFor(false,false,true),'join_existing_voice');
 assert.equal(intentFor(false,true,true),'join_existing');
});

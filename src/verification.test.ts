import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MatrixClient } from 'matrix-js-sdk';
import { verifyOwnDevice } from './verification.ts';
function fixture(missing=false,verified=true){
 const calls:string[]=[];
 const crypto={
  getUserDeviceInfo:async()=>{calls.push('query')},
  importSecretsBundle:async(bundle:unknown)=>{assert.deepEqual(bundle,{cross_signing:{master_key:'existing',self_signing_key:'existing',user_signing_key:'existing'}});calls.push('import')},
  crossSignDevice:async(id:string)=>{assert.equal(id,'WEB');calls.push('sign')},
  getDeviceVerificationStatus:async()=>({signedByOwner:verified,crossSigningVerified:verified}),
  bootstrapCrossSigning:async()=>{throw Error('must never create identity')},
 };
 const client={getCrypto:()=>crypto,getUserId:()=>'@test:example.org',getDeviceId:()=>'WEB',secretStorage:{get:async(name:string)=>missing&&name==='m.cross_signing.master'?undefined:'existing'}} as unknown as MatrixClient;
 return {client,calls};
}
test('imports existing identity and signs only current device',async()=>{const f=fixture();await verifyOwnDevice(f.client);assert.deepEqual(f.calls,['query','import','sign'])});
test('missing signing key stops before any identity mutation',async()=>{const f=fixture(true);await assert.rejects(verifyOwnDevice(f.client));assert.deepEqual(f.calls,[])});
test('does not report success when signature is unverified',async()=>{const f=fixture(false,false);await assert.rejects(verifyOwnDevice(f.client))});

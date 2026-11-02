import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openEscrow} from './escrow.ts';
const f=JSON.parse(readFileSync(new URL('./escrow.fixture.json',import.meta.url),'utf8'));
test('opens independent Python Argon2id v19 / AES-GCM fixture with Unicode password',async()=>assert.equal(await openEscrow(f.blob,f.password,f.userId),f.key));
test('rejects wrong password and different account AAD',async()=>{await assert.rejects(openEscrow(f.blob,'wrong',f.userId));await assert.rejects(openEscrow(f.blob,f.password,'@other:example.org'))});
test('rejects tampering and excessive KDF allocation',async()=>{await assert.rejects(openEscrow({...f.blob,ct:'AAAA'+f.blob.ct.slice(4)},f.password,f.userId));await assert.rejects(openEscrow({...f.blob,m:1048576},f.password,f.userId))});

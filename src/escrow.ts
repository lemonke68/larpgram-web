import { argon2id } from 'hash-wasm';
export interface LockedKey {v:number;kdf:string;m:number;t:number;p:number;salt:string;nonce:string;ct:string}
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function openEscrow(b:LockedKey,password:string,userId:string):Promise<string>{
 if(b.v!==1||b.kdf!=='argon2id'||!Number.isInteger(b.m)||b.m<16384||b.m>262144||!Number.isInteger(b.t)||b.t<2||b.t>16||!Number.isInteger(b.p)||b.p<1||b.p>8) throw Error('Неподдерживаемые параметры escrow');
 const salt=bytes(b.salt),iv=bytes(b.nonce),ct=bytes(b.ct);
 if(salt.length<16||salt.length>64||iv.length!==12||ct.length<17||ct.length>512) throw Error('Повреждённый escrow');
 const key=await argon2id({password,salt,iterations:b.t,parallelism:b.p,memorySize:b.m,hashLength:32,outputType:'binary'});
 try {const aes=await crypto.subtle.importKey('raw',key as Uint8Array<ArrayBuffer>,'AES-GCM',false,['decrypt']);
 return new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(userId),tagLength:128},aes,ct));
 } finally {key.fill(0)}
}

export async function sealEscrow(recoveryKey:string,password:string,userId:string):Promise<LockedKey>{
 const salt=crypto.getRandomValues(new Uint8Array(16)),nonce=crypto.getRandomValues(new Uint8Array(12));
 const m=65536,t=3,p=1;
 const key=await argon2id({password,salt,iterations:t,parallelism:p,memorySize:m,hashLength:32,outputType:'binary'});
 try{
  const aes=await crypto.subtle.importKey('raw',key as Uint8Array<ArrayBuffer>,'AES-GCM',false,['encrypt']);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:new TextEncoder().encode(userId),tagLength:128},aes,new TextEncoder().encode(recoveryKey));
  const b64=(v:Uint8Array)=>btoa(String.fromCharCode(...v));
  return {v:1,kdf:'argon2id',m,t,p,salt:b64(salt),nonce:b64(nonce),ct:b64(new Uint8Array(ct))};
 }finally{key.fill(0)}
}

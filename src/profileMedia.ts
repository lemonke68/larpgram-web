import type {MatrixEvent} from 'matrix-js-sdk';
import {isSticker,mediaKind} from './Attachment';

export function messageLinks(event:MatrixEvent){
 const content=event.getContent();
 if(event.isRedacted()||event.isDecryptionFailure()||typeof content.body!=='string')return [];
 const body=event.replyEventId?content.body.replace(/^(?:> [^\n]*\n)+\n/,''):content.body;
 return [...new Set((body.match(/https?:\/\/[^\s<>"']+/gi)??[]).map(link=>link.replace(/[),.!?;\]]+$/,'')))];
}

export function profileMediaKind(event:MatrixEvent){
 if(isSticker(event))return null;
 const kind=mediaKind(event);
 const content=event.getContent();
 const mime=String(content.info?.mimetype??'').split(';')[0].toLowerCase();
 const name=String(content.filename??content.body??'');
 if(kind==='image'&&(mime==='image/gif'||/\.gif$/i.test(name)))return 'gif';
 if(kind==='video'&&name.startsWith('larpgram-circle'))return 'voice';
 if(kind==='audio')return 'org.matrix.msc3245.voice' in content||'m.voice' in content?'voice':'music';
 if(kind==='image'||kind==='video')return 'visual';
 return kind==='file'?'file':null;
}

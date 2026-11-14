import type {MatrixEvent} from 'matrix-js-sdk';

export function albumPart(event:MatrixEvent){
 const content=event.getContent();
 const match=/^larpgram-album-([0-9a-f]{8})-(\d{1,3})-(\d{1,3})(?:\..*)?$/.exec(String(content.filename??content.body??''));
 if(!match)return null;
 const index=Number(match[2]),count=Number(match[3]);
 return index>=1&&count>=2&&index<=count?{id:match[1],index,count}:null;
}

export function albumName(id:string,index:number,count:number,filename:string){
 const suffix=filename.match(/\.[a-z0-9]{1,10}$/i)?.[0]??'';
 return `larpgram-album-${id}-${index}-${count}${suffix}`;
}

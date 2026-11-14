import {useEffect,useState} from 'react';
import {EventType,type MatrixClient,type MatrixEvent,type Room} from 'matrix-js-sdk';
import {Avatar} from './Avatar';

const gifHost='https://gifs.mango-kokos.ru';
const emojiGroups=[
 ['Лица','😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 🫠 🙃 🥹 😉 😌 😍 🥰 😘 😋 😜 🤪 🤨 🤔 🤫 🫢 😶 😏 😎 🤩 🥳 😐 🙄 😮 😯 😴 😬 😢 😭 😤 😡 🫡'],
 ['Жесты','👍 👎 👏 🙌 🙏 🤝 💪 🤞 👌 ✌️ 🤘 🤟 👋 🫶 👀 💅'],
 ['Символы','❤️ 🧡 💛 💚 💙 💜 🤍 🖤 💔 🔥 ✨ 🎉 🎈 💯 ✅ ❌ ⚡ 🌈 ⭐'],
 ['Животные','🐶 🐱 🐭 🦊 🐻 🐼 🐸 🦆 🦉 🦋 🐝 🐈 🐕 🐾'],
];
type Gif={id:string;description:string;url:string;previewUrl:string};
type GifPage={query:string;items:Gif[];next?:string;error?:boolean};
type Sticker={name:string;url:string;pack?:Record<string,unknown>;info:{mimetype?:string;w?:number;h?:number;size?:number}};
type Pack={name:string;stickers:Sticker[];descriptor:boolean};

function proxyMedia(value:unknown):string|null{
 if(typeof value!=='string')return null;
 try{
  const url=new URL(value);
  if(url.origin===gifHost&&url.pathname==='/media')return '/gif-proxy/media'+url.search;
 }catch{}
 return null;
}

function stickerPacks(client:MatrixClient,room:Room,selected?:MatrixEvent){
 const account=(event:string)=>client.getAccountData(event as EventType.Direct)?.getContent();
 const roomEvents=(candidate:Room)=>candidate.currentState.getStateEvents('im.ponies.room_emotes');
 const linked=account('im.ponies.emote_rooms')?.rooms??{};
 const descriptor=selected?.getContent()['ru.mangokokos.larpgram.pack'];
 const packs=[
  ...(descriptor?[{value:descriptor,name:'Набор стикеров'}]:[]),
  {value:account('im.ponies.user_emotes'),name:'Мои стикеры'},
  ...(Array.isArray(account('ru.mangokokos.larpgram.packs')?.packs)?account('ru.mangokokos.larpgram.packs')!.packs:[]).map((value:unknown)=>({value,name:'Сохранённые'})),
  ...roomEvents(room).map(event=>({value:event.getContent(),name:room.name})),
  ...Object.keys(linked).filter(id=>id!==room.roomId).flatMap(id=>{
   const candidate=client.getRoom(id);
   return candidate?roomEvents(candidate).map(event=>({value:event.getContent(),name:candidate.name})):[];
  }),
 ];
 return packs.flatMap<Pack>(({value,name})=>{
  if(!value?.images||typeof value.images!=='object')return [];
  const stickers=Object.entries(value.images).flatMap<Sticker>(([shortcode,raw])=>{
   const image=raw as {url?:string;body?:string;usage?:string[];info?:Sticker['info']}|null;
   const usage=image?.usage??value.pack?.usage;
   if(!image||typeof image.url!=='string'||!/^mxc:\/\/[^/]+\/[^/]+$/.test(image.url)||Array.isArray(usage)&&!usage.includes('sticker'))return [];
   return [{name:typeof image.body==='string'&&image.body?image.body:shortcode,url:image.url,info:image.info??{},pack:typeof value.slug==='string'&&value.slug?value:undefined}];
  });
  return stickers.length?[{name:typeof value.pack?.display_name==='string'?value.pack.display_name:name,stickers,descriptor:value===descriptor}]:[];
 });
}

export function ComposerMedia({client,room,insertEmoji,stageFile,busy,sendSticker,close,selectedSticker}:{selectedSticker?:MatrixEvent;client:MatrixClient;room:Room;insertEmoji:(emoji:string)=>void;stageFile:(file:File)=>void;busy:boolean;sendSticker:(sticker:Sticker)=>void;close:()=>void}){
 const [tab,setTab]=useState<'emoji'|'sticker'|'gif'>(selectedSticker?'sticker':'emoji');
 const [query,setQuery]=useState('');
 const [page,setPage]=useState<GifPage|null>(null);
 const [request,setRequest]=useState<{attempt:number;cursor?:string}>({attempt:0});
 const [selecting,setSelecting]=useState(false);
 const [downloadError,setDownloadError]=useState(false);
 const [packIndex,setPackIndex]=useState<number|null>(null);
 const packs=tab==='sticker'?stickerPacks(client,room,selectedSticker):[];
 const selectedUrl=selectedSticker?.getContent().file?.url??selectedSticker?.getContent().url;
 const selectedPack=packs.find(item=>item.descriptor)??packs.find(item=>item.stickers.some(sticker=>sticker.url===selectedUrl));
 const term=query.trim();
 useEffect(()=>{
  if(tab!=='gif')return;
  const controller=new AbortController();
  const params=new URLSearchParams({limit:'20'});
  if(term)params.set('q',term);
  if(request.cursor)params.set('pos',request.cursor);
  const timer=setTimeout(()=>{
   void fetch('/gif-proxy/'+(term?'search':'featured')+'?'+params,{signal:controller.signal}).then(async response=>{
    if(!response.ok)throw Error();
    const payload=await response.json();
    const gifs=(Array.isArray(payload.results)?payload.results:[]).flatMap((item:Record<string,unknown>|null)=>{
     const url=proxyMedia(item?.url),previewUrl=proxyMedia(item?.previewUrl);
     return url&&previewUrl&&typeof item?.id==='string'?[{id:item.id,description:String(item.description??'GIF'),url,previewUrl}]:[];
    }) as Gif[];
    if(!controller.signal.aborted)setPage(previous=>({query:term,items:request.cursor&&previous?.query===term?[...new Map([...previous.items,...gifs].map(item=>[item.id,item])).values()]:gifs,next:typeof payload.next==='string'?payload.next:undefined}));
   }).catch(()=>{if(!controller.signal.aborted)setPage(previous=>({query:term,items:previous?.query===term?previous.items:[],error:true}))});
  },request.cursor?0:350);
  return ()=>{clearTimeout(timer);controller.abort()};
 },[tab,term,request]);
 useEffect(()=>{
  setDownloadError(false);
 },[tab,term]);

 async function chooseGif(gif:Gif){
  if(selecting)return;
  setSelecting(true);setDownloadError(false);
  try{
   const response=await fetch(gif.url,{signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error();
   const blob=await response.blob();
   if(!/^image\/gif(?:;|$)/i.test(blob.type))throw Error();
   stageFile(new File([blob],(gif.description.trim()||gif.id).slice(0,100)+'.gif',{type:'image/gif'}));close();
  }catch{setDownloadError(true)}
  finally{setSelecting(false)}
 }
 const matches=page?.query===term?page:null;
 const pack=packIndex!==null?packs[packIndex]??packs[0]:selectedSticker?selectedPack:packs[0];

 return <section className="composer-media glass" aria-label="Медиапанель" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close()}}}>
  <div className="room-detail-actions" aria-label="Тип вложения">
   {([['emoji','Эмодзи'],['sticker','Стикеры'],['gif','GIF']] as const).map(([value,label])=>
    <button type="button" key={value} aria-pressed={tab===value} onClick={()=>{setTab(value);if(value==='sticker'&&selectedSticker&&!selectedPack)setPackIndex(0);setQuery('');setRequest({attempt:0});setPage(null)}}>{label}</button>)}
  </div>
  {tab==='emoji'&&<div className="media-scroll">
   {emojiGroups.map(([name,values])=><section key={name}><h3>{name}</h3><div className="emoji-grid">
    {values.split(' ').map(emoji=><button key={emoji} type="button" onClick={()=>insertEmoji(emoji)}>{emoji}</button>)}
   </div></section>)}
  </div>}
  {tab==='sticker'&&<div className="media-scroll">
   {pack?<><select aria-label="Набор стикеров" value={packs.indexOf(pack)} onChange={event=>setPackIndex(Number(event.target.value))}>
    {packs.map((item,index)=><option key={index} value={index}>{item.name}</option>)}</select>
    <input type="search" aria-label="Поиск стикеров" placeholder="Поиск стикеров" value={query} onChange={event=>setQuery(event.target.value)}/>
    <div className="sticker-grid">{pack.stickers.filter(item=>item.name.toLocaleLowerCase().includes(term.toLocaleLowerCase())).slice(0,120).map((item,index)=>
     <button type="button" key={index} title={item.name} aria-label={item.name} disabled={busy} onClick={()=>sendSticker(item)}>
      <Avatar name={item.name} mxc={item.url}/>
     </button>)}</div>
    {!pack.stickers.some(item=>item.name.toLocaleLowerCase().includes(term.toLocaleLowerCase()))&&<p>Стикеры не найдены</p>}
   </>:<p>{selectedSticker?'Набор этого стикера недоступен':'Нет доступных наборов стикеров'}</p>}
  </div>}
  {tab==='gif'&&<div className="media-scroll">
   <input type="search" aria-label="Поиск GIF" placeholder="Поиск GIF" maxLength={100} value={query} onChange={event=>{setQuery(event.target.value);setRequest({attempt:0})}}/>
   {!matches?<p role="status">Загружаем GIF…</p>:matches.error?<p role="alert">Не удалось загрузить GIF <button type="button" onClick={()=>{setPage(null);setRequest(previous=>({attempt:previous.attempt+1}))}}>Повторить</button></p>:matches.items.length===0?<p>GIF не найдены</p>:null}
   <div className="gif-grid">{matches?.items.map(gif=><button type="button" disabled={selecting||busy} key={gif.id} onClick={()=>void chooseGif(gif)}><img alt={gif.description||'GIF'} loading="lazy" src={gif.previewUrl}/></button>)}</div>
   {matches?.next&&<button type="button" disabled={request.cursor===matches.next} onClick={()=>setRequest(previous=>({attempt:previous.attempt+1,cursor:matches.next}))}>Ещё GIF</button>}
   {selecting&&<p role="status">Загружаем выбранную GIF…</p>}
   {downloadError&&<p role="alert">Не удалось загрузить GIF для отправки</p>}
  </div>}
 </section>;
}

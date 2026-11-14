import {ChatListResize,usePanelWidth} from './ChatListResize';
import React,{lazy,Suspense,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import * as sdk from 'matrix-js-sdk';
import {api,login,start,recover,logout,savedSession,waitForInitialSync,type Session} from './session';
import './style.css';
import {Icon} from './Icon';
import {ContextActions,contextKey,useLongPress,type ActionAnchor} from './ContextActions';
import {messageLinks} from './profileMedia';
import {VideoNote} from './VideoNote';
import {Avatar,AvatarProvider} from './Avatar';
import {Attachment,isSticker,mediaKind,stickerPackField} from './Attachment';
import {ConversationDetails,type DetailsTarget} from './ConversationDetails';
import {directPeers,isBroadcastRoom,memberCountLabel,roomPresentation,userHandle,userPresentation} from './roomPresentation';
import {AccountForm} from './AccountForm';
import {Devices} from './Devices';
import {UserDirectory} from './UserDirectory';
import {OwnProfile} from './OwnProfile';
import {albumPart} from './albums';
import {ComposerMedia} from './ComposerMedia';
import {PendingAttachments,type PendingFile} from './PendingAttachments';
import {readDrafts,writeDrafts,type Drafts} from './drafts';
import {VoiceRecorder} from './VoiceRecorder';
import {useIncomingCall} from './useIncomingCall';
import {activeCall,intentFor,type CallIntent} from './callUtils';
const CallOverlay=lazy(()=>import('./Call').then(m=>({default:m.CallOverlay})));
function readTheme(){
 try {
  return localStorage.getItem('larpgram-theme')==='light'?'light':'dark';
 } catch {
  return 'dark';
 }
}
const quickReactions=['👍','❤️','🔥','😂','👏','😢'];
const moreReactions=[...quickReactions,'👎','🎉','😍','🤔','😮','🙏','💯','🤝','👀','💜'];
const messageDay = new Intl.DateTimeFormat('ru', {dateStyle:'long'});
const messageTime = new Intl.DateTimeFormat('ru', {hour:'2-digit',minute:'2-digit'});

function isMessage(event:sdk.MatrixEvent){
 return event.getRelation()?.rel_type!==sdk.RelationType.Replace&&(event.getType()===sdk.EventType.RoomMessage||event.getType()==='m.sticker'||event.isDecryptionFailure());
}

function messageBody(event:sdk.MatrixEvent):string{
 if(event.isDecryptionFailure())return 'Сообщение пока не расшифровано';
 if(event.isRedacted())return 'Сообщение удалено';
 const body=event.getContent().body;
 if(typeof body!=='string')return 'Вложение';
 if(event.getContent().msgtype==='m.video'&&String(event.getContent().filename??body).startsWith('larpgram-circle'))return 'Видеосообщение';
 return event.replyEventId ? body.replace(/^(?:> [^\n]*\n)+\n/,'') : body;
}

function roomPreview(room:sdk.Room,direct:boolean){
 const events=room.getLiveTimeline().getEvents();
 let index=events.length-1;
 while(index>=0&&!isMessage(events[index]))index--;
 const event=events[index];
 if(!event)return 'Нет сообщений';
 if(event.isDecryptionFailure())return 'Зашифрованное сообщение';
 if(event.isRedacted())return 'Сообщение удалено';
 const content=event.getContent();
 const names:Record<string,string>={'m.image':'Фото','m.video':'Видео','m.audio':'Аудиосообщение','m.file':'Файл'};
 const body=isSticker(event)?'Стикер':names[content.msgtype??'']||messageBody(event).trim()||'Вложение';
 const sender=event.getSender();
 const name=sender&&!direct?room.getMember(sender)?.name:null;
 return name?`${name}: ${body}`:body;
}

type MessageAction = 'edit'|'delete'|'forward';
type TimelineAction = MessageAction|'pin'|'copy';

function Timeline({room,client,userId,status,visible,onReply,onAction,onReact,onRetry,busy,searchOpen,setSearchOpen,onProfile,jumpRequest}:{
 room:sdk.Room|null; client:sdk.MatrixClient|null; userId:string; status:string; visible:boolean; onReply:(event:sdk.MatrixEvent)=>void; onAction:(kind:TimelineAction,event:sdk.MatrixEvent)=>void;
 onReact:(id:string,key:string,ownReaction?:string)=>void; onRetry:(event:sdk.MatrixEvent)=>void; busy:boolean; searchOpen:boolean; setSearchOpen:(open:boolean)=>void; onProfile:(id:string,trigger:HTMLElement)=>void; jumpRequest:{id:string}|null;
}){
 const scroll = useRef<HTMLDivElement>(null);
 const followLatest = useRef(true);
 useEffect(()=>{
  const viewport=scroll.current;
  const list=viewport?.firstElementChild;
  if(!viewport||!list)return;
  const observer=new ResizeObserver(()=>{if(followLatest.current&&viewport.clientHeight)viewport.scrollTop=viewport.scrollHeight});
  observer.observe(list);observer.observe(viewport);
  return ()=>observer.disconnect();
 },[]);
 const pending = useRef(false);
 const anchor = useRef<{id:string;offset:number}|null>(null);
 const [limit,setLimit] = useState(100);
 const [context,setContext]=useState<sdk.EventTimeline|null>(null);
 const [jumpError,setJumpError]=useState(false);
 const [jumping,setJumping]=useState(false);
 const jumpSequence=useRef(0);
 const lastJump=useRef<typeof jumpRequest>(null);
 const initialRead=useRef<{id:string|null}|null>(null);
 if(room&&!initialRead.current)initialRead.current={id:room.getEventReadUpTo(userId)};

 const [search,setSearch] = useState('');
 const [selected,setSelected] = useState<{id:string}|null>(null);
 const [openMenu,setOpenMenu]=useState<(ActionAnchor&{id:string})|null>(null);
 const longPress=useLongPress();
 const [expandedReactions,setExpandedReactions]=useState(false);
 const [atLatest,setAtLatest] = useState(true);
 const [loading,setLoading] = useState(false);
 const [loadError,setLoadError] = useState(false);
 const source=context??room?.getLiveTimeline();
 const messages=source?.getEvents().filter(event=>isMessage(event)&&!client?.isUserIgnored(event.getSender()??''))??[];
 const readIndex=messages.findIndex(event=>event.getId()===initialRead.current?.id);
 const firstUnread=readIndex>=0?messages.slice(readIndex+1).find(event=>event.getSender()!==userId):undefined;
 const events = messages.slice(-limit);
 const privateChat=!!client&&!!room&&!!roomPresentation(client,room,directPeers(client)).peer;
 const broadcast=!!room&&isBroadcastRoom(room);
 const albumRuns=new Map<sdk.MatrixEvent,sdk.MatrixEvent[]>();
 for(let index=0;index<events.length;index++){
  const first=events[index];
  const album=albumPart(first);
  if(!album||!mediaKind(first))continue;
  const items=[first];
  while(index+1<events.length){
   const next=events[index+1];
   if(next.getSender()!==first.getSender()||albumPart(next)?.id!==album.id||!mediaKind(next))break;
   items.push(next);
   index++;
  }
  if(items.length>1)for(const item of items)albumRuns.set(item,items);
 }
 const latest = events.at(-1);
 const byId=new Map(messages.map(event=>[event.getId(),event]));
 const query=search.trim().toLocaleLowerCase();
 const matches=query ? messages.filter(event=>{
  const body=messageBody(event);
  return !event.isRedacted()&&!event.isDecryptionFailure()&&
   typeof body==='string'&&body.toLocaleLowerCase().includes(query);
 }).reverse() : [];
 const canFetch=context?!!context.getPaginationToken(sdk.Direction.Backward):!!room?.oldState.paginationToken;
 const hasEarlier = messages.length>limit || canFetch;

 useLayoutEffect(()=>{
  const list=scroll.current;
  if(!list||!visible)return;
  if(anchor.current&&!pending.current){
   const {id,offset}=anchor.current;
   const message=Array.from(list.querySelectorAll<HTMLElement>('[data-event-id]'))
    .find(element=>element.dataset.eventId===id);
   if(message)list.scrollTop+=message.getBoundingClientRect().top-list.getBoundingClientRect().top-offset;
   anchor.current=null;
  }else if(followLatest.current){
   list.scrollTop=list.scrollHeight;
   setAtLatest(true);
  }
 },[latest,limit,visible]);

 useLayoutEffect(()=>{
  const list=scroll.current;
  if(!visible||!selected||!list)return;
  const target=Array.from(list.querySelectorAll<HTMLElement>('[data-event-id]'))
   .find(element=>element.dataset.eventId===selected.id);
  if(!target)return;
  const offset=target.getBoundingClientRect().top-list.getBoundingClientRect().top;
  list.scrollTop+=offset-(list.clientHeight-target.offsetHeight)/2;
  const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<72;
  followLatest.current=nearBottom;
  setAtLatest(nearBottom);
 },[selected,visible]);

 async function jumpById(id:string){
  const loaded=byId.get(id);
  if(loaded){jumpTo(loaded);return}
  if(!client||!room)return;
  const sequence=++jumpSequence.current;
  setJumping(true);
  setJumpError(false);
  try{
   const live=room.getLiveTimeline();
   const target=await client.getEventTimeline(room.getUnfilteredTimelineSet(),id);
   if(sequence!==jumpSequence.current)return;
   const event=target?.getEvents().find(candidate=>candidate.getId()===id);
   if(!target||!event)throw Error('Сообщение недоступно');
   if(event.isEncrypted())await client.decryptEventIfNeeded(event);
   if(sequence!==jumpSequence.current)return;
   anchor.current=null;
   followLatest.current=false;
   setContext(target===live?null:target);
   setLimit(Math.max(100,target.getEvents().length-target.getEvents().indexOf(event)));
   setSelected({id});
   setSearchOpen(false);
   setAtLatest(false);
  }catch{if(sequence===jumpSequence.current)setJumpError(true)}
  finally{if(sequence===jumpSequence.current)setJumping(false)}
 }

 useEffect(()=>{
  if(!jumpRequest||lastJump.current===jumpRequest)return;
  lastJump.current=jumpRequest;
  void jumpById(jumpRequest.id);
 },[jumpRequest]);

 function jumpTo(event:sdk.MatrixEvent){
  const id=event.getId();
  if(!id)return;
  jumpSequence.current++;
  setJumping(false);setJumpError(false);
  anchor.current=null;
  followLatest.current=false;
  setLimit(current=>Math.max(current,messages.length-messages.indexOf(event)));
  setSelected({id});
  setSearchOpen(false);
 }

 async function loadEarlier(){
  const list=scroll.current;
  if(!room||!client||!list||!hasEarlier||pending.current||jumping)return;
  pending.current=true;
  setLoading(true);
  setLoadError(false);
  const top=list.getBoundingClientRect().top;
  const firstVisible=Array.from(list.querySelectorAll<HTMLElement>('[data-event-id]'))
   .find(element=>element.getBoundingClientRect().bottom>top);
  if(firstVisible?.dataset.eventId){
   anchor.current={id:firstVisible.dataset.eventId,offset:firstVisible.getBoundingClientRect().top-top};
  }
  followLatest.current=false;
  try{
   if(messages.length<=limit&&canFetch){
    if(context)await client.paginateEventTimeline(context,{backwards:true,limit:50});
    else await client.scrollback(room,50);
   }
   setLimit(current=>current+50);
  }catch{
   anchor.current=null;
   setLoadError(true);
  }finally{
   pending.current=false;
   setLoading(false);
  }
 }

 const pinnedState=room?.currentState.getStateEvents(sdk.EventType.RoomPinnedEvents,'')?.getContent().pinned;
 const pins=Array.isArray(pinnedState)?pinnedState.filter((id):id is string=>typeof id==='string'):[];
 const [pinIndex,setPinIndex]=useState(0);
 const pinId=pins.at(-(pinIndex%Math.max(1,pins.length))-1);
 const pinned=pinId ? byId.get(pinId) : undefined;

 // A short timeline may have no scrollbar. Keep filling it until it can scroll.
 useEffect(()=>{
  const list=scroll.current;
  if(visible&&list&&list.clientHeight>0&&list.scrollTop<=80&&!loadError){
   void loadEarlier();
  }
 });

 return <>
 {room&&(!atLatest||context)&&<div className="chat-history-tools">
  <button className="icon-button" type="button" aria-label="К последним сообщениям" title="К последним сообщениям" onClick={()=>{
   const list=scroll.current;
   if(!list)return;
   followLatest.current=true;
   anchor.current=null;
   setSelected(null);
   jumpSequence.current++;
   setJumping(false);setJumpError(false);
   if(context){setContext(null);setLimit(100)}
   list.scrollTop=list.scrollHeight;
   setAtLatest(true);
  }}><Icon name="down"/></button>
 </div>}
 {pinId&&<div className="pinned-banner glass">
  <Icon name="pin"/>
  <div className="pinned-copy">
   <strong>Закреплённое сообщение{pins.length>1&&` · ${pinIndex%pins.length+1}/${pins.length}`}</strong>
   <button type="button" onClick={()=>void jumpById(pinId)}>{pinned?`${room?.getMember(pinned.getSender()??'')?.name??pinned.getSender()??''}: ${messageBody(pinned)}`:'Перейти к закрепу'}</button>
  </div>
  {pins.length>1&&<button type="button" className="icon-button" aria-label="Следующее закреплённое сообщение" title="Следующее закреплённое сообщение" onClick={()=>setPinIndex(current=>(current+1)%pins.length)}><Icon name="down"/></button>}
 </div>}
 {jumping&&<small className="jump-status" role="status">Открываем сообщение…</small>}
 {jumpError&&<small className="jump-status" role="alert">Не удалось открыть сообщение</small>}
 {searchOpen&&<section className="chat-search glass" aria-label="Поиск по загруженной истории">
  <input autoFocus type="search" aria-label="Поиск по загруженной истории" placeholder="Поиск по загруженной истории"
   value={search} onChange={event=>setSearch(event.target.value)}
   onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setSearchOpen(false);document.querySelector<HTMLButtonElement>('[aria-label="Поиск в чате"]')?.focus()}}}/>
  {query&&<div className="chat-search-results">
   {matches.length>100&&<small>Показаны 100 последних совпадений из {matches.length}</small>}
   {matches.length===0&&<p role="status">В загруженной истории совпадений нет</p>}
   {matches.slice(0,100).map(event=><button type="button" key={event.getId()} className="search-hit" onClick={()=>jumpTo(event)}>
    {client&&event.getSender()&&<Avatar {...userPresentation(client,room,event.getSender()!)}/>}
    <span className="search-hit-body"><span>{messageBody(event)}</span>
    <small>{messageDay.format(event.getTs())} · {messageTime.format(event.getTs())}</small></span>
   </button>)}
  </div>}
 </section>}
 <div ref={scroll} className="timeline" tabIndex={0} aria-label="История сообщений" onScroll={event=>{
  longPress.cancel();
  const {scrollTop,scrollHeight,clientHeight}=event.currentTarget;
  if(clientHeight===0)return;
  followLatest.current=scrollHeight-scrollTop-clientHeight<72;
  setAtLatest(followLatest.current);
  if(scrollTop<=80&&!loadError)void loadEarlier();
 }}>
 <div className="message-list">
 {(loading||loadError)&&<div className="history-controls">
  {loading&&<span role="status">Загружаем историю…</span>}
  {loadError&&<>
   <p role="alert">Не удалось загрузить историю.</p>
   <button type="button" onClick={loadEarlier}>Повторить</button>
  </>}
 </div>}
 {events.length===0&&<p className="empty-chat" role="status">{room?(hasEarlier?'В загруженной истории нет сообщений':'В чате пока нет сообщений'):client?'Выберите чат':status}</p>}
 {client&&events.map((event,index)=>{
  const sender=event.getSender();
  const own=sender===userId;
  const member=sender ? room?.getMember(sender) : null;
  const name=member?.name||sender||'';
  const day=messageDay.format(event.getTs());
  const previous=events[index-1];
  const grouped=event!==firstUnread&&previous?.getSender()===sender&&messageDay.format(previous.getTs())===day&&event.getTs()-previous.getTs()<300000;
  const content=event.getContent();
  const id=event.getId();
  const attachmentKind=mediaKind(event);
  const sticker=isSticker(event)&&!event.isRedacted();
  const canAct=room?.getMyMembership()==='join'&&!!id&&!event.status&&!event.isRedacted()&&!event.isDecryptionFailure();
  const isText=content.msgtype===sdk.MsgType.Text;
  const reactions=id ? room?.getUnfilteredTimelineSet().relations
   .getChildEventsForEvent(id,sdk.RelationType.Annotation,sdk.EventType.Reaction)?.getRelations() ?? [] : [];
  const album=albumPart(event);
  const albumItems=albumRuns.get(event);
  const paired=!!albumItems;
  const albumLead=albumItems?.[0]===event;
  const original=event.replyEventId ? byId.get(event.replyEventId)??room?.findEventById(event.replyEventId) : undefined;
  const originalSender=original?.getSender();
  const read=own&&id&&!event.status&&room?.getJoinedMembers().some(person=>person.userId!==userId&&room.hasUserReadEvent(person.userId,id));
  const canDelete=room?.currentState.maySendRedactionForEvent(event,userId);
  const canPin=room?.currentState.maySendStateEvent(sdk.EventType.RoomPinnedEvents,userId);
  const showReactionAvatars=!!room&&!broadcast&&(privateChat||reactions.length<=3);
  const reactionKeys=[...new Set(reactions.map(reaction=>reaction.getRelation()?.key).filter((key):key is string=>typeof key==='string'))];
  const canReply=room?.currentState.maySendEvent(sdk.EventType.RoomMessage,userId);
  const canReact=room?.currentState.maySendEvent(sdk.EventType.Reaction,userId);
  const openActions=(anchor:ActionAnchor)=>{if(id){setExpandedReactions(false);setOpenMenu({...anchor,id})}};
  const selectedText=()=>!!window.getSelection()?.toString();
  const plainBody=messageBody(event);
  const links=isText?messageLinks(event):[];
  return <React.Fragment key={event.getId()}>
   {(!previous||messageDay.format(previous.getTs())!==day)&&<div className="message-day">{day}</div>}
   {event===firstUnread&&<div className="message-day unread-divider">Непрочитанные</div>}
   <div className={own?'message-row mine':'message-row'} data-grouped={grouped} data-album={paired?album?.id:undefined}>
    {!own&&sender&&(grouped?<span className="avatar-space" aria-hidden="true"/>:
     <button className="sender-avatar" type="button" aria-label={`Профиль ${name}`} onClick={event=>onProfile(sender,event.currentTarget)}>
      <Avatar {...userPresentation(client,room,sender)}/>
     </button>)}
   <article data-event-id={event.getId()} data-search-target={selected?.id===event.getId()&&!!selected} className={own?'own':''} data-sticker={sticker} data-album-part={paired&&!albumLead}
    tabIndex={canAct?0:undefined} aria-keyshortcuts={canAct?'ContextMenu Shift+F10':undefined}
    onKeyDown={key=>{
     if(canAct&&contextKey(key)&&!key.defaultPrevented&&!(key.target instanceof Element&&key.target.closest('a,input,textarea,select,audio,video'))){
      key.preventDefault();
      const rect=key.currentTarget.getBoundingClientRect();
      openActions({trigger:key.currentTarget,x:rect.left+12,y:rect.top+20});
     }
    }}
    onContextMenu={menu=>{
     if(!canAct||menu.defaultPrevented||selectedText()||menu.target instanceof Element&&menu.target.closest('a,input,textarea,select,audio,video'))return;
     menu.preventDefault();
     openActions({trigger:menu.currentTarget,x:menu.clientX,y:menu.clientY});
    }}
    onPointerDown={pointer=>{if(canAct)longPress.start(pointer,openActions)}}
    onPointerMove={longPress.move} onPointerUp={longPress.cancel} onPointerCancel={longPress.cancel}
    onDoubleClick={click=>{
     if(!click.defaultPrevented&&canAct&&canReply&&!busy&&!selectedText()&&click.target instanceof Element&&!click.target.closest('p,button,a,.event-attachment,.message-sender'))onReply(event);
    }}>
    {!own&&!grouped&&name&&!privateChat&&<strong className="message-sender">{name}</strong>}
    {event.replyEventId&&!event.isRedacted()&&<button type="button" className="message-quote" onClick={()=>void jumpById(event.replyEventId!)}>
     {originalSender&&<strong>{room?.getMember(originalSender)?.name??originalSender}</strong>}
     <span>{original?messageBody(original):'Перейти к исходному сообщению'}</span>
    </button>}
    {!sticker&&(!attachmentKind||content.filename&&content.body!==content.filename)&&(!album||!String(content.body).startsWith('larpgram-album-'))&&<p>
     {links.length?plainBody.split(/(https?:\/\/[^\s<>"']+)/gi).map((part,index)=>{
      const url=links.find(link=>part.startsWith(link)&&part.replace(/[),.!?;\]]+$/,'')===link);
      return url?<React.Fragment key={index}><a href={url} target="_blank" rel="noreferrer">{url}</a>{part.slice(url.length)}</React.Fragment>:part;
     }):plainBody}
    </p>}
    {albumLead?<div className="album-grid">{albumItems!.map(item=><Attachment key={item.getId()} event={item} client={client}/>)}</div>:
     !paired&&attachmentKind&&<Attachment event={event} client={client}/>}
    <div className="message-meta">
     {canAct&&id&&(()=>{
      function react(key:string){
       const mine=reactions.find(reaction=>reaction.getRelation()?.key===key&&reaction.getSender()===userId);
       if(!mine||mine.getId()&&!mine.status)onReact(id!,key,mine?.getId());
      }
      function choose(action:()=>void){
       openMenu?.trigger.focus({preventScroll:true});
       setOpenMenu(null);
       action();
      }
      return <>
       {reactionKeys.map(key=>{
        const matching=reactions.filter(reaction=>reaction.getRelation()?.key===key);
        const mine=matching.some(reaction=>reaction.getSender()===userId);
        const senders=[...new Set(matching.map(reaction=>reaction.getSender()).filter((id):id is string=>!!id))];
        return <button key={key} className="reaction-chip" type="button" disabled={busy||!canReact&&!mine}
         aria-pressed={mine} aria-label={`Реакция ${key}, ${matching.length}`} onClick={()=>react(key)}><span aria-hidden="true">{key.startsWith('mxc://')?<Avatar name="☺" mxc={key}/>:key}</span>{showReactionAvatars&&senders.length>0?<span className="reaction-avatars">{senders.map(id=><Avatar key={id} {...userPresentation(client,room,id)}/>)}</span>:<span>{matching.length}</span>}</button>;
       })}
       {openMenu?.id===id&&<ContextActions anchor={openMenu} close={()=>setOpenMenu(null)} label="Действия с сообщением">
         {canReply&&<button type="button" onClick={()=>choose(()=>onReply(event))}><Icon name="reply"/>Ответить</button>}
         {canReact&&<div className="reaction-options" aria-label="Реакции">{(expandedReactions?moreReactions:quickReactions).map(key=><button key={key} type="button" disabled={busy} aria-label={`Реакция ${key}`} aria-pressed={reactions.some(reaction=>reaction.getRelation()?.key===key&&reaction.getSender()===userId)} onClick={()=>choose(()=>react(key))}>{key}</button>)}<button className="expand-reactions" type="button" aria-expanded={expandedReactions} aria-label={expandedReactions?"Свернуть реакции":"Ещё реакции"} onClick={()=>setExpandedReactions(value=>!value)}><Icon name="down"/></button></div>}
         <button type="button" onClick={()=>choose(()=>onAction('copy',event))}><Icon name="copy"/>Копировать текст</button>
         {event.replyEventId&&<button type="button" onClick={()=>choose(()=>void jumpById(event.replyEventId!))}><Icon name="reply"/>К оригиналу</button>}
         {canPin&&<button type="button" disabled={busy} onClick={()=>choose(()=>onAction('pin',event))}><Icon name="pin"/>{pins.includes(id)?'Открепить':'Закрепить сообщение'}</button>}
         {isText&&<button type="button" disabled={busy} onClick={()=>choose(()=>onAction('forward',event))}><Icon name="forward"/>Переслать</button>}
         {canReply&&own&&isText&&<button type="button" disabled={busy} onClick={()=>choose(()=>onAction('edit',event))}><Icon name="edit"/>Изменить</button>}
         {canDelete&&<button className="danger-action" type="button" disabled={busy} onClick={()=>choose(()=>onAction('delete',event))}><Icon name="trash"/>Удалить</button>}
       </ContextActions>}
      </>;
     })()}
     {event.status===sdk.EventStatus.NOT_SENT&&<button type="button" disabled={busy} onClick={()=>onRetry(event)}>Повторить отправку</button>}
     {event.isSending()&&event.status!==sdk.EventStatus.NOT_SENT&&<small>Отправляется…</small>}
     <small>{event.replacingEventId()&&'изменено · '}{messageTime.format(event.getTs())}{own&&!event.status&&<span aria-label={read?'Прочитано':'Отправлено'} title={read?'Прочитано':'Отправлено'}> <Icon name={read?'checks':'check'}/></span>}</small>
    </div>
   </article>
   </div>
  </React.Fragment>;
 })}
 </div>
 </div>
 </>;
}

function App(){
 const chatList=usePanelWidth();
 const [searchOpen,setSearchOpen]=useState(false);
 const [attachments,setAttachments]=useState<Record<string,PendingFile[]>>({});
 const [uploading,setUploading]=useState(false);
 const [fileDrag,setFileDrag]=useState(false);
 function addFiles(id:string,files:File[]){
  if(!id||!files.length)return;
  const media=files.filter(file=>/^(image|video)\//.test(file.type));
  const albumId=media.length>=2&&media.length<=999?crypto.randomUUID().slice(0,8):null;
  let index=0;
  const items=files.map(file=>({
   file,id:crypto.randomUUID(),caption:'',
   album:albumId&&media.includes(file)?{id:albumId,index:++index,count:media.length}:undefined,
  }));
  setAttachments(current=>({...current,[id]:[...(current[id]??[]),...items]}));
 }
 const [emojiOpen,setEmojiOpen]=useState(false);
 const [videoRoom,setVideoRoom]=useState('');
 const [view,setView]=useState<'chats'|'profile'|'settings'>('chats');
 const [authMode,setAuthMode]=useState<'login'|'register'|'reset'>('login');
 const [authNotice,setAuthNotice]=useState('');
 const [roomFilter,setRoomFilter]=useState<'all'|'unread'|'archive'>('all');
 const [roomDetails,setRoomDetails]=useState<DetailsTarget|null>(null);
 const detailsTrigger=useRef<HTMLElement|null>(null);
 const headerIdentity=useRef<HTMLButtonElement>(null);
 const [jumpRequest,setJumpRequest]=useState<{id:string}|null>(null);
 function openDetails(target:DetailsTarget,trigger?:HTMLElement){
  if(trigger)detailsTrigger.current=trigger;
  setRoomDetails(target);
 }
 function closeDetails(){
  setRoomDetails(null);
  requestAnimationFrame(()=>{
   const trigger=detailsTrigger.current;
   (trigger?.isConnected?trigger:headerIdentity.current)?.focus({preventScroll:true});
  });
 }
 const [settingsFromProfile,setSettingsFromProfile]=useState(false);
 const [showDevices,setShowDevices]=useState(false);
 const [query,setQuery]=useState('');
 const [folder,setFolder]=useState('');
 const [roomMenu,setRoomMenu]=useState<(ActionAnchor&{id:string})|null>(null);
 const [ownProfile,setOwnProfile]=useState<{name?:string;mxc?:string}>({});
 const [wallpaper,setWallpaper]=useState(()=>{try{return localStorage.getItem('larpgram-wallpaper')!=='plain'}catch{return true}});
 useEffect(()=>{try{localStorage.setItem('larpgram-wallpaper',wallpaper?'dots':'plain')}catch{}},[wallpaper]);
 function closeRoomMenu(){
  roomMenu?.trigger.focus({preventScroll:true});
  setRoomMenu(null);
 }
 function showRoomMenu(id:string,trigger:HTMLButtonElement,x:number,y:number){
  setRoomMenu({id,trigger,x,y});
 }
 const [inviteQuery,setInviteQuery]=useState('');
 const [replies,setReplies]=useState<Record<string,sdk.MatrixEvent|undefined>>({});
 const [action,setAction]=useState<{kind:MessageAction;event:sdk.MatrixEvent;roomId:string}|null>(null);
 const [newRoom,setNewRoom]=useState<'direct'|'group'|null>(null);
 const [roomName,setRoomName]=useState('');
 const [invitees,setInvitees]=useState('');
 const newRoomDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  if(newRoom&&!newRoomDialog.current?.open)newRoomDialog.current?.showModal();
 },[newRoom]);
 const [actionValue,setActionValue]=useState('');
 const actionDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  if(action&&!actionDialog.current?.open)actionDialog.current?.showModal();
 },[action]);
 const composerInput=useRef<HTMLTextAreaElement>(null);
 const [drafts,setDrafts]=useState<Drafts>({});
 useLayoutEffect(()=>{
  const input=composerInput.current;
  if(!input)return;
  input.style.height='auto';
  input.style.height=Math.min(148,input.scrollHeight+2)+'px';
 });
 const [theme,setTheme]=useState<'light'|'dark'>(()=>readTheme());
 useEffect(()=>{
  try {
   localStorage.setItem('larpgram-theme',theme);
  } catch {
   // Keep the selected theme for the current page when storage is unavailable.
  }
 },[theme]);
 const [session,setSession]=useState<Session|null>(null),[client,setClient]=useState<sdk.MatrixClient|null>(null),[owned,setOwned]=useState(false);
 const [status,setStatus]=useState('Подключение…'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[,refresh]=useState(0);
 const running=useRef(false);
 const loginRecovery=useRef<{session:Session;password:string}|null>(null);
 const [recovering,setRecovering]=useState(false);
 const [recoveryAttention,setRecoveryAttention]=useState(false);

 async function restoreHistory(activeClient:sdk.MatrixClient,activeSession:Session,secret:string,recoveryKey:string,signal?:AbortSignal){
  setRecovering(true);
  setRecoveryAttention(false);
  setStatus('Восстанавливаем зашифрованную историю…');
  try{
   if(signal)await waitForInitialSync(activeClient,signal);
   const result=await recover(activeClient,activeSession,secret,recoveryKey,signal);
   if(signal?.aborted)return;
   const message=result.verified?'Веб-устройство подтверждено.':'Подтвердите веб-устройство с Android.';
   setStatus(message);
   setRecoveryAttention(!result.verified);
   refresh(value=>value+1);
  }catch{
   if(signal?.aborted)return;
   setStatus('Не удалось восстановить историю. В настройках можно повторить попытку по паролю или ключу восстановления.');
   setRecoveryAttention(true);
  }finally{
   if(!signal?.aborted)setRecovering(false);
  }
 }
 const [ticket,setTicket]=useState(''),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[manual,setManual]=useState(''),[roomId,setRoomId]=useState(''),[call,setCall]=useState<{roomId:string;intent:CallIntent}|null>(null);
 const {incoming,dismiss:dismissIncoming,decline:declineIncoming}=useIncomingCall(client);
 const network=client?.getSyncState();
 const offline=network===sdk.SyncState.Error||network===sdk.SyncState.Reconnecting;
 const master=client?.pushRules?.global.override?.find(rule=>rule.rule_id===sdk.RuleId.Master);
 useEffect(()=>{if(!navigator.locks){setError('Для безопасной работы нужен браузер с Web Locks');return}
 let release:()=>void;let stopped=false;
 navigator.locks.request('larpgram-web-session',{ifAvailable:true},async lock=>{
 if(!lock){setError('Larpgram уже открыт в другой вкладке. Закройте её и обновите эту.');return}
 setOwned(true);try{const s=savedSession();if(s)setDrafts(readDrafts(s.userId));setSession(s)}catch{setError('Не удалось прочитать локальную сессию')}
 await new Promise<void>(r=>{release=r;if(stopped)r()});
 });return()=>{stopped=true;release?.()};},[]);
 useEffect(()=>{
  if(!session||!owned)return;
  const lifecycle=new AbortController();
  let activeClient:sdk.MatrixClient|undefined;
  const pending=loginRecovery.current?.session===session?loginRecovery.current:null;

  void start(session,()=>refresh(value=>value+1)).then(async matrix=>{
   if(lifecycle.signal.aborted){matrix.stopClient();return}
   activeClient=matrix;
   setClient(matrix);
   if(!pending){setStatus('Синхронизация');return}
   if(loginRecovery.current===pending)loginRecovery.current=null;
   const secret=pending.password;
   pending.password='';
   await restoreHistory(matrix,session,secret,'',lifecycle.signal);
  }).catch(()=>{
   if(lifecycle.signal.aborted)return;
   if(pending&&loginRecovery.current===pending)loginRecovery.current=null;
   if(pending)pending.password='';
   setRecovering(false);
   setError('Не удалось открыть сессию. Проверьте сеть и доступность хранилища.');
  });

  return ()=>{lifecycle.abort();activeClient?.stopClient()};
 },[session,owned]);
 async function run(task:()=>Promise<void>){
  if(running.current)return;
  running.current=true;setError('');setBusy(true);
  try{await task()}catch(e){setError(e instanceof Error?e.message:'Ошибка операции')}
  finally{running.current=false;setBusy(false)}
 }
 const rooms=client?.getRooms().sort((a,b)=>
  Number(!!b.tags['m.favourite'])-Number(!!a.tags['m.favourite'])||b.getLastActiveTimestamp()-a.getLastActiveTimestamp()
 )??[];
 const room=client?.getRoom(roomId)??null;
 const canWrite=!!session&&room?.getMyMembership()==='join'&&room.currentState.maySendEvent(sdk.EventType.RoomMessage,session.userId);
 useEffect(()=>{
  if(!session)return;
  try{setRoomId(sessionStorage.getItem('larpgram-active-room:'+session.userId)??'')}catch{}
 },[session]);
 useEffect(()=>{
  if(session&&owned)writeDrafts(session.userId,drafts);
 },[session,owned,drafts]);
 const text=drafts[roomId]??'';
 const reply=replies[roomId];

 function updateDraft(id:string,value:string,expected?:string){
  setDrafts(current=>{
   if(expected!==undefined&&current[id]!==expected)return current;
   const next={...current};
   if(value)next[id]=value;
   else delete next[id];
   return next;
  });
 }
 const accountName=session?.userId.split(':')[0].replace(/^@/,'')??'';
 const displayName=session ? (ownProfile.name??client?.getUser(session.userId)?.displayName)||accountName : '';
 const visibleVideo=!!roomId&&videoRoom===roomId&&view==='chats';
 const token=client?.getAccessToken();
 const ownAvatar=session?ownProfile.mxc??client?.getUser(session.userId)?.avatarUrl:null;
 const peers=directPeers(client);
 const presentation=client&&room?roomPresentation(client,room,peers):null;
 const savedRoom=client&&rooms.find(candidate=>roomPresentation(client,candidate,peers).avatar.saved);
 function selectRoom(id:string){
  if(id!==roomId){
   setFileDrag(false);setSearchOpen(false);setEmojiOpen(false);setVideoRoom('');
   setRoomDetails(null);setJumpRequest(null);
  }
  setRoomId(id);
  if(session)try{sessionStorage.setItem('larpgram-active-room:'+session.userId,id)}catch{}
  setView('chats');
 }
 function openDirect(id:string){
  const direct=rooms.find(candidate=>candidate.getMyMembership()==='join'&&client&&roomPresentation(client,candidate,peers).peer===id);
  if(direct&&direct.roomId!==roomId)selectRoom(direct.roomId);
  else if(direct||presentation?.peer===id)closeDetails();
  else{setError('');setInvitees(id);setInviteQuery('');setRoomName('');setNewRoom('direct')}
 }
 const joinedRooms=rooms.filter(r=>['join','invite'].includes(r.getMyMembership())&&!r.isSpaceRoom());
 const spaces=rooms.filter(r=>r.isSpaceRoom()&&r.getMyMembership()==='join');
 const selectedSpace=spaces.find(space=>space.roomId===folder);
 const folderRooms=new Set<string>();
 function addChildren(space:sdk.Room){
  for(const event of space.currentState.getStateEvents(sdk.EventType.SpaceChild)){
   const id=event.getStateKey();
   if(!id||folderRooms.has(id)||!Array.isArray(event.getContent().via)||!event.getContent().via.length)continue;
   folderRooms.add(id);
   const child=spaces.find(candidate=>candidate.roomId===id);
   if(child)addChildren(child);
  }
 }
 if(selectedSpace)addChildren(selectedSpace);
 const needle=query.trim().toLocaleLowerCase();
 const visibleRooms=joinedRooms.filter(r=>
  (!selectedSpace||folderRooms.has(r.roomId))&&
  (roomFilter==='archive'?!!r.tags['m.lowpriority']:!r.tags['m.lowpriority'])&&
  (roomFilter!=='unread'||r.getMyMembership()==='invite'||r.getUnreadNotificationCount()>0)&&
  [r.name,peers.get(r.roomId)].some(value=>value?.toLocaleLowerCase().includes(needle))
 );
 function muted(id:string){
  return client?.getRoomPushRule('global',id)?.actions.some(action=>action==='dont_notify')??false;
 }
 function roomActions(target:sdk.Room,done?:()=>void,includeMute=true){
  return <div className="room-detail-actions">
   {(['m.favourite','m.lowpriority'] as const).map(tag=><button key={tag} type="button" disabled={busy} onClick={()=>void run(async()=>{
    if(target.tags[tag])await client!.deleteRoomTag(target.roomId,tag);
    else await client!.setRoomTag(target.roomId,tag,{});
    done?.();
   })}><Icon name={tag==='m.favourite'?'pin':'archive'}/>{tag==='m.favourite'?(target.tags[tag]?'Открепить чат':'Закрепить чат'):(target.tags[tag]?'Вернуть из архива':'В архив')}</button>)}
   {includeMute&&<button type="button" disabled={busy} onClick={()=>void run(async()=>{
    await client!.setRoomMutePushRule('global',target.roomId,!muted(target.roomId));
    refresh(current=>current+1);done?.();
   })}><Icon name={muted(target.roomId)?'bell':'mute'}/>{muted(target.roomId)?'Включить уведомления':'Отключить уведомления'}</button>}
  </div>;
 }
 const menuRoom=roomMenu?client?.getRoom(roomMenu.id):null;
 return <AvatarProvider token={token}><div className={session?'app':'app signed-out'} data-theme={theme} data-wallpaper={wallpaper?'dots':'plain'} style={chatList.width===null?undefined:{'--chat-list-width':chatList.width+'px'} as React.CSSProperties}>
 {session&&<aside id="chat-list" className="rail" aria-label="Список чатов">
 <div className="rail-heading"><div className="brand"><span aria-hidden="true"><Icon name="chat"/></span><strong className="rail-brand-name">larpgram</strong></div>
 <button aria-label="Новый чат" title="Новый чат" className="icon-button new-room-button" type="button" disabled={!client||busy} onClick={()=>{setError('');setRoomName('');setInvitees('');setInviteQuery('');setNewRoom('direct')}}><Icon name="plus"/></button></div>
 {offline&&<small className="connection-status" role="status">Нет связи · переподключаемся</small>}
 <div className="rail-search"><Icon name="search"/><input className="search" type="search" aria-label="Поиск чатов" placeholder="Поиск чатов" value={query} onChange={e=>setQuery(e.target.value)}/></div>
 <div className="room-filters">
  <button type="button" aria-pressed={roomFilter==='all'} onClick={()=>setRoomFilter('all')}>Все</button>
  <button type="button" aria-pressed={roomFilter==='unread'} onClick={()=>setRoomFilter('unread')}>Непрочитанные</button>
  <button type="button" aria-pressed={roomFilter==='archive'} onClick={()=>setRoomFilter('archive')}>Архив</button>
 </div>
 {spaces.length>0&&<div className="room-filters room-folders" aria-label="Папки">
  <button type="button" aria-pressed={!selectedSpace} onClick={()=>setFolder('')}>Все папки</button>
  {spaces.map(space=><button key={space.roomId} type="button" title={space.name} aria-pressed={folder===space.roomId} onClick={()=>setFolder(space.roomId)}>{space.name}</button>)}
 </div>}
 <nav className="rooms" aria-label="Чаты">
 {visibleRooms.map(r=>{
  const unread=r.getUnreadNotificationCount();
   const draft=drafts[r.roomId]?.trim();
  const preview=r.getMyMembership()==='invite'?'Приглашение':client&&activeCall(client,r)?'Идёт звонок':draft?`Черновик: ${draft}`:roomPreview(r,!!peers.get(r.roomId));
  const quiet=muted(r.roomId);
  const pinned=!!r.tags['m.favourite'];
  return <button type="button" className="room" aria-label={unread?`${r.name}, непрочитанных уведомлений: ${unread}`:r.name} title={r.name} aria-current={view==='chats'&&roomId===r.roomId} key={r.roomId} onClick={()=>selectRoom(r.roomId)}
   onContextMenu={event=>{if(r.getMyMembership()==='join'){event.preventDefault();showRoomMenu(r.roomId,event.currentTarget,event.clientX,event.clientY)}}}
   onKeyDown={event=>{if(contextKey(event)&&r.getMyMembership()==='join'){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();showRoomMenu(r.roomId,event.currentTarget,rect.left+32,rect.bottom)}}}>
   <Avatar {...roomPresentation(client!,r,peers).avatar}/>
   <span className="room-info"><span className="room-title"><strong>{r.name}</strong>{r.getLastLiveEvent()&&<time>{messageTime.format(r.getLastActiveTimestamp())}</time>}</span><small className={draft?'draft-preview':undefined}>{preview}</small></span>
   {(pinned||quiet)&&<span className="room-flags">{pinned&&<span title="Чат закреплён" role="img" aria-label="Чат закреплён"><Icon name="pin"/></span>}{quiet&&<span title="Уведомления отключены" role="img" aria-label="Уведомления отключены"><Icon name="mute"/></span>}</span>}
   {unread>0&&<span className="unread-count" data-muted={quiet} aria-label={`Непрочитанных уведомлений: ${unread}`}>{unread>99?'99+':unread}</span>}
  </button>;
 })}
 {visibleRooms.length===0&&<p className="empty-list" role="status">{!client||!client.isInitialSyncComplete()?'Синхронизация…':needle?'Чаты не найдены':roomFilter==='archive'?'Архив пуст':roomFilter==='unread'?'Нет непрочитанных чатов':selectedSpace?'В папке нет чатов':'Чатов пока нет'}</p>}
 {client&&needle.length>=2&&<UserDirectory client={client} query={query} choose={openDirect}/>}
 </nav>
 <div className="account-bar"><button className="account" type="button" aria-label="Мой профиль" title="Мой профиль" onClick={()=>{setVideoRoom('');setView('profile')}}><Avatar name={displayName} mxc={ownAvatar} identity={session.userId}/><span className="room-info"><strong>{displayName}</strong></span></button>
 <button className="icon-button" type="button" aria-label="Настройки" title="Настройки" onClick={()=>{setVideoRoom('');setSettingsFromProfile(false);setView('settings')}}><Icon name="settings"/></button></div>
 {roomMenu&&menuRoom&&<ContextActions anchor={roomMenu} close={()=>setRoomMenu(null)} label="Действия с чатом">{roomActions(menuRoom,closeRoomMenu)}</ContextActions>}
 <ChatListResize {...chatList}/>
 </aside>}
 <main>

 {error&&<div role="alert" className="error">{error}</div>}{!session?<section className="auth glass"><div className="brand"><span aria-hidden="true"><Icon name="chat"/></span>larpgram</div>
 {authMode!=='login'?<AccountForm mode={authMode} onBack={()=>setAuthMode('login')} onDone={name=>{
  setUsername(name);setAuthNotice(authMode==='register'?'Аккаунт создан. Теперь можно войти.':'Пароль обновлён. Войдите с новым паролем.');setAuthMode('login');
 }}/>:<><h2>{ticket?'Подтверждение входа':'Вход'}</h2>{ticket&&<p>Введите шестизначный код из письма.</p>}{authNotice&&<p role="status">{authNotice}</p>}<form onSubmit={e=>{e.preventDefault();run(async()=>{
 let name=username;if(ticket){name=(await api('/account/login/confirm',{ticket,code})).username}else{const r=await api('/account/login/start',{login:username,password});name=r.username;if(r.code_required){setTicket(r.ticket);return}}
 const next=await login(name,password);
 loginRecovery.current={session:next,password};
 setRecovering(true);
 setDrafts(readDrafts(next.userId));setSession(next);setPassword('');setTicket('');setCode('');
 })}}><label>Ник или почта<input autoComplete="username" required disabled={!!ticket||busy} value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Пароль<input autoComplete="current-password" type="password" required disabled={busy||!!ticket} value={password} onChange={e=>setPassword(e.target.value)}/></label>{ticket&&<label>Код из письма<input required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={e=>setCode(e.target.value)}/></label>}<button disabled={!owned||busy}>{busy?'Подождите…':ticket?'Подтвердить':'Войти'}</button>{ticket&&<button type="button" onClick={()=>{setTicket('');setCode('')}} disabled={busy}>Назад</button>}</form>
 {!ticket&&<div className="auth-links">
  <button type="button" disabled={!owned||busy} onClick={()=>{setError('');setPassword('');setAuthMode('register')}}>Регистрация</button>
  <button type="button" disabled={!owned||busy} onClick={()=>{setError('');setPassword('');setAuthMode('reset')}}>Забыли пароль?</button>
 </div>}
 </>}</section>:<>
 {view==='profile'&&<section className="area profile-area">
 <div className="area-heading"><h2>Профиль</h2><button className="icon-button" type="button" aria-label="Закрыть профиль" title="Закрыть профиль" onClick={()=>setView('chats')}><Icon name="close"/></button></div>
 {client&&<OwnProfile client={client} userId={session.userId} name={displayName} mxc={ownAvatar} onSettings={()=>{setSettingsFromProfile(true);setView('settings')}}
  onSaved={savedRoom?()=>selectRoom(savedRoom.roomId):undefined}
  onUpdate={patch=>setOwnProfile(current=>({...current,...patch}))}/>}


 </section>}
 {view==='settings'&&<section className="area settings-area">
 <div className="area-heading"><h2>Настройки</h2><button className="icon-button" type="button" aria-label="Закрыть настройки" title="Закрыть настройки" onClick={()=>setView(settingsFromProfile?'profile':'chats')}><Icon name="close"/></button></div>
 <button type="button" className="settings-profile" onClick={()=>setView('profile')}>
  <span className="settings-avatar"><Avatar name={displayName} mxc={ownAvatar} identity={session.userId}/><span><Icon name="photo"/></span></span>
  <strong>{displayName}</strong><small>{userHandle(session.userId)}</small>
 </button>
 <div className="settings-list">
 <div className="settings-group glass">
 <details className="settings-category"><summary className="settings-row"><span className="settings-icon" data-color="orange"><Icon name="chat"/></span><strong>Чаты</strong><Icon name="chevron"/></summary>
 <div className="settings-content"><h3>Оформление</h3><div className="theme-options">
 <button type="button" aria-pressed={theme==='dark'} onClick={()=>setTheme('dark')}>Тёмная</button>
 <button type="button" aria-pressed={theme==='light'} onClick={()=>setTheme('light')}>Светлая</button>
 </div><h3>Фон переписки</h3><div className="theme-options">
 <button type="button" aria-pressed={wallpaper} onClick={()=>setWallpaper(true)}>Узор</button>
 <button type="button" aria-pressed={!wallpaper} onClick={()=>setWallpaper(false)}>Однотонный</button>
 </div></div></details>
 <details className="settings-category"><summary className="settings-row"><span className="settings-icon" data-color="red"><Icon name="bell"/></span><strong>Уведомления</strong><Icon name="chevron"/></summary><div className="settings-content"><p>{joinedRooms.filter(candidate=>muted(candidate.roomId)).length} чатов с отключёнными уведомлениями</p>{master&&<button type="button" aria-pressed={!master.enabled} disabled={busy} onClick={()=>void run(async()=>{
  await client!.setPushRuleEnabled('global',sdk.PushRuleKind.Override,sdk.RuleId.Master,!master.enabled);
  await client!.getPushRules();
  refresh(value=>value+1);
 })}>{master.enabled?'Уведомления аккаунта выключены':'Уведомления аккаунта включены'}</button>}</div></details>
 <details className="settings-category"><summary className="settings-row"><span className="settings-icon" data-color="green"><Icon name="shield"/></span><strong>Конфиденциальность</strong><Icon name="chevron"/></summary>
 <div className="settings-content"><h3>Заблокированные пользователи</h3>
 {client?.getIgnoredUsers().length?<ul>{client.getIgnoredUsers().map(id=><li key={id}>{userHandle(id)} <button type="button" disabled={busy} onClick={()=>void run(async()=>{await client.setIgnoredUsers(client.getIgnoredUsers().filter(user=>user!==id))})}>Разблокировать</button></li>)}</ul>:<p>Список пуст</p>}</div></details>
 </div>
 <div className="settings-group glass">
 <details className="settings-category" open={recoveryAttention||undefined}>
  <summary className="settings-row"><span className="settings-icon"><Icon name="shield"/></span><strong>Шифрование</strong><Icon name="chevron"/></summary>
  <div className="settings-content recovery"><h3>Восстановление истории</h3>
  <p>При входе история восстанавливается автоматически. Здесь можно повторить восстановление по паролю или ключу.</p>
  <form onSubmit={event=>{
   event.preventDefault();
   if(!client||recovering||(!password&&!manual))return;
   void run(async()=>{
    const secret=password,recoveryKey=manual;
    setPassword('');setManual('');
    await restoreHistory(client,session,secret,recoveryKey);
   });
  }}>
   <input aria-label="Пароль для восстановления" type="password" placeholder="Пароль аккаунта" value={password} onChange={event=>setPassword(event.target.value)} disabled={recovering}/>
   <input aria-label="Ключ восстановления" placeholder="Или ключ восстановления" value={manual} onChange={event=>setManual(event.target.value)} disabled={recovering}/>
   <button disabled={busy||recovering||!client||(!password&&!manual)}>Восстановить</button>
  </form>
  {(recovering||recoveryAttention||status==='Веб-устройство подтверждено.')&&<p role="status">{status}</p>}
 </div></details>
 {client&&<details className="settings-category" onToggle={event=>setShowDevices(event.currentTarget.open)} open={showDevices}>
  <summary className="settings-row"><span className="settings-icon" data-color="teal"><Icon name="devices"/></span><strong>Устройства</strong><Icon name="chevron"/></summary>
  {showDevices&&<div className="settings-content"><Devices client={client} session={session}/></div>}
 </details>}
 <details className="settings-category"><summary className="settings-row"><span className="settings-icon" data-color="blue"><Icon name="settings"/></span><strong>Аккаунт</strong><Icon name="chevron"/></summary><div className="settings-content"><button disabled={busy||recovering||!client} onClick={()=>run(async()=>{await logout(client!,session);writeDrafts(session.userId,{});setClient(null);setSession(null);setRecoveryAttention(false);setStatus('Подключение…');setRoomId('');setQuery('');setRoomFilter('all');setFolder('');setOwnProfile({});setAttachments({});setRoomDetails(null);setShowDevices(false);setDrafts({});setReplies({});setPassword('');setManual('');dismissIncoming();setCall(null);setView('chats')})}>Завершить сессию</button></div></details>
 </div>
 </div>
 </section>}
 <div className="conversation-layout" hidden={view!=='chats'}>
 <section className="chat" hidden={view!=='chats'} aria-label="Переписка" data-file-drag={fileDrag}
  onDragOver={event=>{if(canWrite&&event.dataTransfer.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';setFileDrag(true)}}}
  onDragLeave={event=>{if(!(event.relatedTarget instanceof Node&&event.currentTarget.contains(event.relatedTarget)))setFileDrag(false)}}
  onDrop={event=>{setFileDrag(false);if(canWrite&&event.dataTransfer.files.length){event.preventDefault();addFiles(roomId,Array.from(event.dataTransfer.files))}}}>
 <header className="chat-header glass">
  {room&&presentation?<button type="button" className="chat-identity" ref={headerIdentity} aria-expanded={!!roomDetails} aria-controls={roomDetails?'conversation-details':undefined} onClick={event=>{
   if(roomDetails)closeDetails();
   else openDetails(presentation.peer?{kind:'user',userId:presentation.peer}:{kind:'room'},event.currentTarget);
  }}>
   <Avatar {...presentation.avatar}/>
   <span className="chat-heading"><strong>{room.name}</strong>{<small>{presentation.peer?userHandle(presentation.peer):memberCountLabel(room)}</small>}</span>
  </button>:null}
  {room?.getMyMembership()==='join'&&client&&<div className="call-buttons">
   {activeCall(client,room)&&<small className="call-active">Идёт звонок</small>}
   {(!isBroadcastRoom(room)||activeCall(client,room))&&<>
   <button className="icon-button" type="button" aria-label="Аудиозвонок" title="Аудиозвонок" onClick={()=>setCall({roomId,intent:intentFor(!!presentation?.peer,false,activeCall(client,room))})}><Icon name="phone"/></button>
   <button className="icon-button" type="button" aria-label="Видеозвонок" title="Видеозвонок" onClick={()=>setCall({roomId,intent:intentFor(!!presentation?.peer,true,activeCall(client,room))})}><Icon name="camera"/></button>
   </>}
   <button className="icon-button" type="button" aria-label="Поиск в чате" title="Поиск в чате" aria-expanded={searchOpen} onClick={()=>setSearchOpen(!searchOpen)}><Icon name="search"/></button>
  </div>}
 </header>
 <Timeline key={roomId} room={room} client={client} userId={session.userId} status={status} visible={view==='chats'} busy={busy} searchOpen={searchOpen} setSearchOpen={setSearchOpen} jumpRequest={jumpRequest}
 onProfile={(id,trigger)=>openDetails({kind:'user',userId:id},trigger)}
 onRetry={event=>run(async()=>{if(client&&room){await client.resendEvent(event,room);const body=event.getContent().body;if(typeof body==='string'&&event.getContent().msgtype===sdk.MsgType.Text)updateDraft(roomId,'',body)}})}
 onAction={(kind,event)=>{
  if(kind==='copy'){void navigator.clipboard.writeText(messageBody(event)).catch(()=>setError('Не удалось скопировать сообщение'));return}
  if(kind==='pin'){
   const id=event.getId();
   if(!client||!room||!id)return;
   void run(async()=>{
    const state=room.currentState.getStateEvents(sdk.EventType.RoomPinnedEvents,'')?.getContent().pinned;
    const pins:Array<string>=Array.isArray(state)?state:[];
    await client.sendStateEvent(roomId,sdk.EventType.RoomPinnedEvents,{pinned:pins.includes(id)?pins.filter(pin=>pin!==id):[...pins,id]},'');
   });
   return;
  }
  setError('');setActionValue(kind==='edit'?messageBody(event):'');setAction({kind,event,roomId});
 }}
 onReact={(id,key,ownReaction)=>run(async()=>{
  if(!client)return;
  if(ownReaction)await client.redactEvent(roomId,ownReaction);
  else await client.sendEvent(roomId,sdk.EventType.Reaction,{'m.relates_to':{rel_type:sdk.RelationType.Annotation,event_id:id,key}});
 })}
 onReply={event=>{setReplies(current=>({...current,[roomId]:event}));composerInput.current?.focus()}}/>
 {room?.getMyMembership()==='invite'&&client&&<div className="invite-actions glass">
  <button type="button" disabled={busy} onClick={()=>run(async()=>{await client.joinRoom(roomId)})}>Принять приглашение</button>
  <button type="button" disabled={busy} onClick={()=>run(async()=>{await client.leave(roomId);selectRoom('')})}>Отклонить</button>
 </div>}
 {reply&&canWrite&&<div className="reply-draft glass">
  <div><strong>Ответ · {room?.getMember(reply.getSender()??'')?.name??reply.getSender()}</strong><span>{messageBody(reply)}</span></div>
  <button type="button" className="icon-button" aria-label="Отменить ответ" title="Отменить ответ" onClick={()=>setReplies(current=>({...current,[roomId]:undefined}))}><Icon name="close"/></button>
 </div>}
 {client&&canWrite&&room&&<PendingAttachments key={roomId} client={client} room={room} items={attachments[roomId]??[]} busy={busy||uploading} reply={reply}
  update={(id,caption)=>setAttachments(current=>({...current,[roomId]:(current[roomId]??[]).map(item=>item.id===id?{...item,caption}:item)}))}
  remove={id=>setAttachments(current=>({...current,[roomId]:(current[roomId]??[]).filter(item=>item.id!==id)}))}
  onBusy={setUploading} consumeReply={()=>setReplies(current=>current[roomId]===reply?{...current,[roomId]:undefined}:current)}/>}
 <div className="composer-dock glass" hidden={!canWrite}>
 {canWrite&&room&&<form className="composer" onSubmit={e=>{e.preventDefault();run(async()=>{if(!text.trim()||busy||uploading)return;const replyId=reply?.getId();
 if(replyId){
  await client!.sendMessage(roomId,{msgtype:sdk.MsgType.Text,body:text,'m.relates_to':{'m.in_reply_to':{event_id:replyId}}});
  setReplies(current=>current[roomId]===reply?{...current,[roomId]:undefined}:current);
 }else{
  await client!.sendTextMessage(roomId,text);
 }
 updateDraft(roomId,'',text)})}}><button type="button" className="icon-button" aria-label="Медиапанель" title="Эмодзи, стикеры и GIF" aria-expanded={emojiOpen} onClick={()=>setEmojiOpen(!emojiOpen)}><Icon name="emoji"/></button>
 <textarea ref={composerInput} aria-label="Сообщение" placeholder="Сообщение" rows={1} value={text}
 onPaste={event=>{const files=Array.from(event.clipboardData.files);if(files.length){event.preventDefault();addFiles(roomId,files)}}}
 onChange={e=>updateDraft(roomId,e.target.value)} onKeyDown={event=>{
  if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&event.keyCode!==229){
   event.preventDefault();
   event.currentTarget.form?.requestSubmit();
  }
 }}/><label className="attach icon-button" title="Прикрепить файл"><Icon name="clip"/><input aria-label="Прикрепить файлы" type="file" multiple onChange={event=>{addFiles(roomId,Array.from(event.target.files??[]));event.target.value=''}}/></label>{room.hasEncryptionStateEvent()&&<button type="button" className="icon-button" aria-label="Записать видеосообщение" title="Записать видеосообщение" onClick={()=>setVideoRoom(roomId)}><Icon name="videoNote"/></button>}
 <button className="icon-button send-button" aria-label="Отправить" title="Отправить" disabled={busy||uploading||!text.trim()}><Icon name="send"/></button></form>}
 {emojiOpen&&client&&room&&<ComposerMedia key={roomId} client={client} room={room} busy={busy||uploading} close={()=>{setEmojiOpen(false);requestAnimationFrame(()=>composerInput.current?.focus())}}
  stageFile={file=>addFiles(roomId,[file])}
  sendSticker={sticker=>void run(async()=>{
   await client.sendEvent(roomId,sdk.EventType.Sticker,{body:sticker.name,url:sticker.url,info:sticker.info,...(sticker.pack?{[stickerPackField]:sticker.pack}:{})});
   setEmojiOpen(false);
  })}
  insertEmoji={emoji=>{
   const field=composerInput.current;
   if(!field)return;
   const start=field.selectionStart;
   updateDraft(roomId,text.slice(0,start)+emoji+text.slice(field.selectionEnd));
   requestAnimationFrame(()=>{field.focus();field.setSelectionRange(start+emoji.length,start+emoji.length)});
  }}/>}
 {visibleVideo&&room&&client&&<VideoNote key={roomId} client={client} roomId={roomId} close={()=>setVideoRoom('')}/>}
 {canWrite&&room&&client&&<VoiceRecorder key={roomId} client={client} roomId={roomId} encrypted={room.hasEncryptionStateEvent()}/>}
 </div>
 {room?.getMyMembership()==='join'&&!canWrite&&<small className="read-only-chat">{isBroadcastRoom(room)?'Публиковать могут администраторы':'Отправка сообщений недоступна'}</small>}
 </section>
 {room&&client&&presentation&&roomDetails&&<ConversationDetails key={roomId} room={room} client={client} avatar={presentation.avatar} target={roomDetails}
  close={closeDetails} openUser={id=>openDetails({kind:'user',userId:id})} openDirect={openDirect}
  peer={presentation.peer} muted={muted(roomId)} busy={busy} toggleMute={()=>void run(async()=>{
   await client.setRoomMutePushRule('global',roomId,!muted(roomId));
   refresh(value=>value+1);
  })}
  changeBlock={(id,block)=>void run(async()=>{
   const ignored=client.getIgnoredUsers();
   await client.setIgnoredUsers(block?[...new Set([...ignored,id])]:ignored.filter(user=>user!==id));
  })}
  startCall={video=>setCall({roomId,intent:intentFor(!!presentation.peer,video,activeCall(client,room))})}
  openChat={selectRoom} jump={id=>{setJumpRequest({id});closeDetails()}} describe={messageBody}
  actions={room.getMyMembership()==='join'&&roomActions(room,undefined,!presentation.peer)}/>}
 </div>
 {newRoom&&client&&<dialog ref={newRoomDialog} className="message-dialog" onCancel={event=>{event.preventDefault();if(!busy)setNewRoom(null)}}>
  <form onSubmit={event=>{event.preventDefault();if(busy)return;run(async()=>{
   const users=[...new Set(invitees.split(/[\s,]+/).filter(Boolean))];
   if(users.some(user=>!/^@[^\s:]+:[^\s]+$/.test(user)||user===session.userId)){
    throw Error('Укажите полные Matrix ID других пользователей');
   }
   if(newRoom==='direct'&&users.length!==1)throw Error('Для личного чата укажите один Matrix ID');
   if(newRoom==='group'&&!roomName.trim())return;
   const created=await client.createRoom({
    preset:sdk.Preset.PrivateChat,
    name:newRoom==='group'?roomName.trim():undefined,
    invite:users,
    is_direct:newRoom==='direct',
    initial_state:[{type:sdk.EventType.RoomEncryption,state_key:'',content:{algorithm:'m.megolm.v1.aes-sha2'}}],
   });
   setNewRoom(null);
   selectRoom(created.room_id);
   if(newRoom==='direct'){
    const direct=client.getAccountData(sdk.EventType.Direct)?.getContent()??{};
    const existing=direct[users[0]];
    await client.setAccountData(sdk.EventType.Direct,{...direct,[users[0]]:[...new Set([...(Array.isArray(existing)?existing:[]),created.room_id])]});
   }
  })}}>
   <h2>Новый чат</h2>
   <select value={newRoom} onChange={event=>setNewRoom(event.target.value==='group'?'group':'direct')} aria-label="Тип чата">
    <option value="direct">Личный чат</option><option value="group">Группа</option>
   </select>
   {newRoom==='group'&&<input aria-label="Название группы" placeholder="Название группы" required value={roomName} onChange={event=>setRoomName(event.target.value)}/>}
   <input type="search" aria-label="Поиск участников" placeholder="Имя или Matrix ID" value={inviteQuery} onChange={event=>setInviteQuery(event.target.value)}/>
   <UserDirectory client={client} query={inviteQuery} choose={id=>{
    setInvitees(current=>newRoom==='direct'?id:[...new Set([...current.split(/[\s,]+/).filter(Boolean),id])].join(', '));
    setInviteQuery('');
   }}/>
   <input aria-label="Matrix ID участников" placeholder="@имя:сервер" required={newRoom==='direct'} value={invitees} onChange={event=>setInvitees(event.target.value)}/>
   {error&&<p role="alert" className="error">{error}</p>}
   <div className="dialog-actions">
    <button type="button" disabled={busy} onClick={()=>setNewRoom(null)}>Отмена</button>
    <button disabled={busy}>Создать</button>
   </div>
  </form>
 </dialog>}
 {action&&client&&<dialog ref={actionDialog} className="message-dialog" onCancel={event=>{event.preventDefault();if(!busy)setAction(null)}}>
  <form onSubmit={event=>{event.preventDefault();run(async()=>{
   const id=action.event.getId();
   if(!id||action.event.isRedacted())throw Error('Сообщение уже недоступно');
   if(action.kind==='delete')await client.redactEvent(action.roomId,id);
   else if(action.kind==='edit'){
    const body=actionValue.trim();
    if(!body)return;
    await client.sendMessage(action.roomId,{
     msgtype:sdk.MsgType.Text,body:'* '+body,
     'm.new_content':{msgtype:sdk.MsgType.Text,body},
     'm.relates_to':{rel_type:sdk.RelationType.Replace,event_id:id},
    });
   }else{
    const destination=client.getRoom(actionValue);
    const source=client.getRoom(action.roomId);
    if(!source||destination?.getMyMembership()!=='join'||source.hasEncryptionStateEvent()&&!destination.hasEncryptionStateEvent()){
     throw Error('Чат недоступен для пересылки');
    }
    const sender=action.event.getSender();
    const author=sender?userPresentation(client,source,sender).name:'';
    await client.sendTextMessage(destination.roomId,author?`Переслано от ${author}\n\n${messageBody(action.event)}`:messageBody(action.event));
   }
   setAction(null);
  })}}>
   <h2>{action.kind==='edit'?'Изменить сообщение':action.kind==='delete'?'Удалить сообщение?':'Переслать текст'}</h2>
   {action.kind==='edit'&&<input aria-label="Новый текст" value={actionValue} onChange={event=>setActionValue(event.target.value)} autoFocus/>}
   {action.kind==='forward'&&<div className="forward-rooms" aria-label="Чат назначения">
    {joinedRooms.filter(r=>r.getMyMembership()==='join'&&(!client.getRoom(action.roomId)?.hasEncryptionStateEvent()||r.hasEncryptionStateEvent())).map(r=>
     <button key={r.roomId} type="button" className="person-row" aria-pressed={actionValue===r.roomId} onClick={()=>setActionValue(r.roomId)}>
      <Avatar {...roomPresentation(client,r,peers).avatar}/><span><strong>{r.name}</strong></span>
     </button>)}
   </div>}
   {action.kind!=='edit'&&<p className="action-preview">{messageBody(action.event)}</p>}
   {error&&<p role="alert" className="error">{error}</p>}
   <div className="dialog-actions">
    <button type="button" disabled={busy} onClick={()=>setAction(null)}>Отмена</button>
    <button disabled={busy||(action.kind!=='delete'&&!actionValue.trim())}>{action.kind==='edit'?'Сохранить':action.kind==='delete'?'Удалить':'Переслать'}</button>
   </div>
  </form>
 </dialog>}
 {incoming&&client&&!call&&<section className="incoming-call glass" aria-label="Входящий звонок">
  <Avatar {...userPresentation(client,incoming.room,incoming.sender)}/>
  <div><strong>{userPresentation(client,incoming.room,incoming.sender).name}</strong><small>{incoming.video?'Входящий видеозвонок':'Входящий аудиозвонок'}</small></div>
  <button type="button" onClick={()=>{dismissIncoming();selectRoom(incoming.room.roomId);setCall({roomId:incoming.room.roomId,intent:intentFor(!!roomPresentation(client,incoming.room,peers).peer,incoming.video,true)})}} aria-label="Принять звонок" title="Принять звонок" className="icon-button call-accept"><Icon name="phone"/></button>
  <button type="button" onClick={()=>void declineIncoming().catch(()=>setError('Не удалось передать отклонение звонка'))} aria-label="Отклонить звонок" title="Отклонить звонок" className="icon-button call-leave"><Icon name="hangup"/></button>
 </section>}
 {call&&client&&<Suspense fallback={<div className="call-overlay"><p role="status">Загрузка звонка…</p></div>}><CallOverlay key={call.roomId} client={client} roomId={call.roomId} intent={call.intent} theme={theme} onClose={()=>setCall(null)}/></Suspense>}
 </>}</main></div></AvatarProvider>
}
createRoot(document.getElementById('root')!).render(<App/>);

import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {EventType,type MatrixClient,type MatrixEvent,type Room} from 'matrix-js-sdk';
import {Attachment} from './Attachment';
import {ChatListResize,usePanelWidth} from './ChatListResize';
import {messageLinks,profileMediaKind} from './profileMedia';
import {Avatar} from './Avatar';
import {Icon} from './Icon';
import {directPeers,isBroadcastRoom,memberCountLabel,roomPresentation,userHandle,userPresentation} from './roomPresentation';

export function CopyId({id,label=id}:{id:string;label?:string}){
  const [result,setResult]=useState('');
  return <div className="copy-id"><code title={id}>{label}</code><button type="button" className="icon-button" onClick={()=>{
    void navigator.clipboard.writeText(id).then(()=>setResult('Скопировано'),()=>setResult('Не удалось скопировать'));
  }} aria-label="Копировать Matrix ID" title="Копировать Matrix ID"><Icon name="copy"/></button><small role="status">{result}</small></div>;
}

export type DetailsTarget={kind:'room'}|{kind:'user';userId:string};

const categories=[
  ['visual','Фото и видео'],['voice','Голосовые и кружочки'],['gif','GIF'],['links','Ссылки'],['music','Музыка'],['groups','Общие группы'],
] as const;
type Category=typeof categories[number][0]|'file';

export function ConversationDetails({room,client,target,avatar,close,openUser,jump,openDirect,openChat,actions,describe,peer,muted,busy,toggleMute,changeBlock,startCall}:{
  room:Room;client:MatrixClient;target:DetailsTarget;avatar:Parameters<typeof Avatar>[0];close:()=>void;
  openUser:(id:string)=>void;jump:(id:string)=>void;openDirect:(id:string)=>void;openChat:(id:string)=>void;
  peer?:string;muted:boolean;busy:boolean;toggleMute:()=>void;changeBlock:(id:string,blocked:boolean)=>void;startCall:(video:boolean)=>void;
  actions:ReactNode;describe:(event:MatrixEvent)=>string;
}){
  const [tab,setTab]=useState<Category>('visual');
  const panel=usePanelWidth('details');
  const [limit,setLimit]=useState(24);
  const [loading,setLoading]=useState(false);
  const [loadError,setLoadError]=useState(false);
  const sentinel=useRef<HTMLDivElement>(null);
  const scroller=useRef<HTMLElement>(null);
  const blockDialog=useRef<HTMLDialogElement>(null);
  const request=useRef(false);
  const [page,setPage]=useState(0);
  const [scrolled,setScrolled]=useState(0);
  const closeEnough=(element:HTMLElement)=>element.scrollHeight-element.scrollTop-element.clientHeight<90;
  const closeButton=useRef<HTMLButtonElement>(null);
  useLayoutEffect(()=>{closeButton.current?.focus()},[]);
  const channel=isBroadcastRoom(room);
  const userId=target.kind==='user'?target.userId:peer??null;
  const blocked=!!userId&&client.getIgnoredUsers().includes(userId);
  const profile=userId?userPresentation(client,room,userId):null;
  const topic=room.currentState.getStateEvents(EventType.RoomTopic,'')?.getContent().topic;
  const pins=room.currentState.getStateEvents(EventType.RoomPinnedEvents,'')?.getContent().pinned;
  const peers=directPeers(client);
  const activeTab=userId&&tab==='file'||!userId&&tab==='groups'?'visual':tab;
  useEffect(()=>{setLimit(24);setPage(0);setScrolled(0);setLoadError(false)},[activeTab,userId]);
  const direct=!!userId&&peer===userId;
  const gallery=activeTab==='groups'?[]:room.getLiveTimeline().getEvents().filter(event=>{
    if(client.isUserIgnored(event.getSender()??'')||userId&&!direct&&event.getSender()!==userId)return false;
    return activeTab==='links'?messageLinks(event).length>0:profileMediaKind(event)===activeTab;
  }).reverse();
  const hasMore=activeTab!=='groups'&&(gallery.length>limit||!!room.oldState.paginationToken);
  // Fetch as the end approaches. Bound consecutive empty pages until the next scroll.
  useEffect(()=>{
    const marker=sentinel.current;
    if(!marker||!hasMore||loading||loadError)return;
    const observer=new IntersectionObserver(entries=>{
      if(!entries.some(entry=>entry.isIntersecting)||request.current)return;
      if(gallery.length>limit){setLimit(value=>value+24);return}
      if(page>=3&&!scrolled)return;
      if(page>=3)setScrolled(0);
      request.current=true;
      setLoading(true);
      void client.scrollback(room,50).then(()=>setPage(value=>value+1),()=>setLoadError(true)).finally(()=>{
        request.current=false;
        setLoading(false);
      });
    },{root:scroller.current,rootMargin:'0px 0px 80px'});
    observer.observe(marker);
    return ()=>observer.disconnect();
  },[activeTab,client,gallery.length,hasMore,limit,loading,loadError,page,room,scrolled]);
  const groups=activeTab==='groups'&&userId?client.getVisibleRooms().filter(candidate=>
    candidate.getMyMembership()==='join'&&!candidate.isSpaceRoom()&&
      !roomPresentation(client,candidate,peers).peer&&candidate.getMember(userId)?.membership==='join'
  ).sort((a,b)=>a.name.localeCompare(b.name,'ru')):[];
  const style=panel.width===null?undefined:{'--details-width':panel.width+'px'} as CSSProperties;

  return <div className="conversation-details-shell" style={style}>
   <ChatListResize {...panel}/>
   <aside ref={scroller} onScroll={event=>{if(page>=3&&closeEnough(event.currentTarget))setScrolled(1)}} id="conversation-details" className="conversation-details glass" aria-label={profile?'Профиль собеседника':channel?'О канале':'О чате'}
    onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.stopPropagation();close()}}}>
    <header><h2>{profile?'Профиль':channel?'О канале':'О чате'}</h2><button ref={closeButton} type="button" className="icon-button" aria-label="Закрыть панель" onClick={close}><Icon name="close"/></button></header>
    <div className="details-identity"><Avatar {...(profile??avatar)}/><h3>{profile?.name??room.name}</h3>
      {userId?<CopyId key={userId} id={userId} label={userHandle(userId)}/>:<small>{memberCountLabel(room)}</small>}
    </div>
    {userId?<><div className="profile-tiles">
      {userId!==client.getUserId()&&<button type="button" onClick={()=>openDirect(userId)}><Icon name="chat"/>Чат</button>}
      {direct&&<><button type="button" onClick={()=>startCall(false)}><Icon name="phone"/>Звонок</button>
      <button type="button" onClick={()=>startCall(true)}><Icon name="camera"/>Видео</button>
      <button type="button" disabled={busy} onClick={toggleMute}><Icon name={muted?'bell':'mute'}/>{muted?'Включить звук':'Без звука'}</button></>}
    </div>
    {userId!==client.getUserId()&&<details className="profile-more">
      <summary><Icon name="settings"/>Действия</summary>
      <div className="room-detail-actions">
      {direct&&actions}
      <button type="button" className="danger-action" disabled={busy} onClick={()=>blockDialog.current?.showModal()}><Icon name="ban"/>{blocked?'Разблокировать':'Заблокировать'}</button>
      </div>
    </details>}
    <dialog ref={blockDialog} className="message-dialog" onKeyDown={event=>event.stopPropagation()}>
      <form method="dialog"><h3>{blocked?'Разблокировать':'Заблокировать'} {profile?.name}?</h3>
      {!blocked&&<p>Сообщения этого пользователя будут скрыты во всех чатах.</p>}
      <div className="dialog-actions"><button autoFocus>Отмена</button>
      <button onClick={()=>changeBlock(userId,!blocked)}>{blocked?'Разблокировать':'Заблокировать'}</button></div></form>
    </dialog></>:<>
      {typeof topic==='string'&&topic&&<p className="details-topic">{topic}</p>}
      {actions&&<details className="details-room-settings"><summary><Icon name="settings"/>Настройки чата</summary>{actions}</details>}
      {Array.isArray(pins)&&pins.length>0&&<details><summary>Закрепы · {pins.length}</summary><ul>
        {pins.filter((id):id is string=>typeof id==='string').map(id=>{
          const event=room.findEventById(id);
          return <li key={id}><button type="button" onClick={()=>jump(id)}>{event?describe(event):'Перейти к сообщению'}</button></li>;
        })}
      </ul></details>}
      {!channel&&<details><summary>Участники · {room.getJoinedMemberCount()}</summary><ul>
        {room.getJoinedMembers().map(member=><li key={member.userId}>
          <button type="button" className="person-row" onClick={()=>openUser(member.userId)}>
            <Avatar {...userPresentation(client,room,member.userId)}/><span><strong>{member.name}</strong><small>{member.userId}</small></span>
          </button>
        </li>)}
      </ul></details>}
    </>}
    <section className="conversation-gallery" aria-label={profile?'Общий контент':'Вложения'}>
      <div className="gallery-tabs" aria-label="Тип вложений">
        {categories.filter(([id])=>id!=='groups'||userId).map(([id,label])=>
          <button key={id} type="button" aria-pressed={activeTab===id} onClick={()=>{setTab(id);setLimit(24)}}>{label}</button>
        )}
        {!userId&&<button type="button" aria-pressed={activeTab==='file'} onClick={()=>{setTab('file');setLimit(24)}}>Файлы</button>}
      </div>
      {activeTab==='groups'?<>
        {!groups.length&&<p>Общих групп нет</p>}
        {groups.map(group=><button type="button" className="person-row" key={group.roomId} onClick={()=>openChat(group.roomId)}>
          <Avatar {...roomPresentation(client,group,peers).avatar}/><span><strong>{group.name}</strong></span>
        </button>)}
      </>:<>
        {gallery.length===0&&!loading&&!loadError&&(!hasMore||page>=3)&&<p role="status" className="gallery-empty">В этой категории пока пусто</p>}
        <div key={activeTab+':'+userId} className="gallery-items" data-visual={activeTab==='visual'||activeTab==='gif'}>
          {gallery.slice(0,limit).map(event=>{
            const id=event.getId();
            const go=id?()=>jump(id):undefined;
            return <article key={id}>
              {activeTab==='links'?<><div className="gallery-links">{messageLinks(event).map(url=><a key={url} href={url} target="_blank" rel="noreferrer">{url}</a>)}</div>
                {go&&<button type="button" className="icon-button" aria-label="К сообщению" title="К сообщению" onClick={go}><Icon name="chat"/></button>}</>:
                <Attachment event={event} client={client} gallery jump={go} sender={event.getSender()?userPresentation(client,room,event.getSender()!).name:undefined}/>}
            </article>;
          })}
        </div>
        {hasMore&&<div ref={sentinel} className="gallery-sentinel" aria-hidden="true"/>}
        {loading&&<small role="status">Загрузка…</small>}
        {loadError&&<div role="alert">Не удалось загрузить вложения <button type="button" onClick={()=>{setPage(0);setLoadError(false)}}>Повторить</button></div>}
      </>}
    </section>
   </aside>
  </div>;
}

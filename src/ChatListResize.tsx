import {useRef,useState,type PointerEvent} from 'react';

const minimum=72;
const maximum=520;
const storageKey='larpgram-chat-list-width';

const detailsMinimum=224;
const detailsMaximum=640;

export function usePanelWidth(panel:'chats'|'details'='chats'){
 const details=panel==='details';
 const storage=details?'larpgram-details-width':storageKey;
 const min=details?detailsMinimum:minimum;
 const max=details?detailsMaximum:maximum;
 const [width,setWidth]=useState<number|null>(()=>{
 try{
  const value=Number(localStorage.getItem(storage));
  if(value>=min&&value<=max)return value;
 }catch{}
 return null;
 });
 return {width,min,max,setWidth,storage,details};
}

export function ChatListResize({width,setWidth,min:minimum,max:maximum,storage,details}:ReturnType<typeof usePanelWidth>){
 const handle=useRef<HTMLDivElement>(null);
 const drag=useRef<{id:number;x:number;initial:number;current:number;maximum:number}|null>(null);
 const [dragging,setDragging]=useState(false);

 function bounds(){
  const rail=handle.current?.parentElement;
  const layout=rail?.parentElement;
  const layoutWidth=layout?.clientWidth??innerWidth;
  const reserve=details
   ?(rail&&getComputedStyle(rail).position==='absolute'?28:28+Math.min(300,layoutWidth*.38))
   :Math.min(300,layoutWidth*.65);
  return {
   width:rail?.getBoundingClientRect().width??width??minimum,
   maximum:Math.min(maximum,Math.max(minimum,Math.floor(layoutWidth-reserve))),
  };
 }

 function save(value:number){
  try{localStorage.setItem(storage,String(value))}catch{}
 }

 function finish(event:PointerEvent<HTMLDivElement>){
  if(drag.current?.id!==event.pointerId)return;
  const {initial,current}=drag.current;
  if(current!==initial)save(current);
  drag.current=null;
  setDragging(false);
 }

 return <div ref={handle} className="chat-list-resize" data-dragging={dragging} data-side={details?'left':'right'} role="separator" tabIndex={0}
  aria-label={details?'Ширина панели профиля':'Ширина списка чатов'} aria-controls={details?'conversation-details':'chat-list'} aria-orientation="vertical"
  aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={width??(details?320:280)}
  title="Перетащите, чтобы изменить ширину панели"
  onPointerDown={event=>{
   if(event.button!==0||drag.current)return;
   const {width:initial,maximum}=bounds();
   drag.current={id:event.pointerId,x:event.clientX,initial,current:initial,maximum};
   event.currentTarget.focus({preventScroll:true});
   event.currentTarget.setPointerCapture(event.pointerId);
   setDragging(true);
  }}
  onPointerMove={event=>{
   const start=drag.current;
   if(!start||start.id!==event.pointerId)return;
   start.current=Math.round(Math.max(minimum,Math.min(start.maximum,start.initial+(event.clientX-start.x)*(details?-1:1))));
   setWidth(start.current);
  }}
  onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
  onKeyDown={event=>{
   const current=bounds();
   const values:Record<string,number>={ArrowLeft:current.width+(details?16:-16),ArrowRight:current.width+(details?-16:16),Home:minimum,End:current.maximum};
   const target=values[event.key];
   if(typeof target!=='number')return;
   event.preventDefault();
   const next=Math.round(Math.max(minimum,Math.min(current.maximum,target)));
   setWidth(next);
   save(next);
  }}/>;
}

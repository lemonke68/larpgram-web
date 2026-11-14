import {useEffect,useLayoutEffect,useRef,type ReactNode,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';

export type ActionAnchor={trigger:HTMLElement;x:number;y:number};

export function contextKey(event:{key:string;shiftKey:boolean}){
 return event.key==='ContextMenu'||event.shiftKey&&event.key==='F10';
}

export function interactive(target:EventTarget|null){
 return target instanceof Element&&!!target.closest('a,button,input,select,textarea,audio,video,[contenteditable]');
}

export function useLongPress(){
 const press=useRef<{timer:number;id:number;x:number;y:number}|null>(null);
 const cancel=()=>{
  if(press.current)window.clearTimeout(press.current.timer);
  press.current=null;
 };
 useEffect(()=>()=>{if(press.current)window.clearTimeout(press.current.timer)},[]);
 return {
  start(event:PointerEvent,open:(anchor:ActionAnchor)=>void){
   if(event.pointerType!=='touch'||!event.isPrimary||interactive(event.target)||event.target instanceof Element&&event.target.closest('p'))return;
   cancel();
   const {pointerId:id,clientX:x,clientY:y,currentTarget:trigger}=event;
   press.current={id,x,y,timer:window.setTimeout(()=>{
    press.current=null;
    if(trigger instanceof HTMLElement&&trigger.isConnected&&!window.getSelection()?.toString())open({trigger,x,y});
   },500)};
  },
  move(event:PointerEvent){
   const active=press.current;
   if(active?.id===event.pointerId&&Math.hypot(event.clientX-active.x,event.clientY-active.y)>9)cancel();
  },
  cancel,
 };
}

export function ContextActions({anchor,close,label,children}:{anchor:ActionAnchor;close:()=>void;label:string;children:ReactNode}){
 const panel=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const element=panel.current!;
  const position=()=>{
   element.style.left=Math.max(8,Math.min(anchor.x,innerWidth-element.offsetWidth-8))+'px';
   element.style.top=Math.max(8,Math.min(anchor.y,innerHeight-element.offsetHeight-8))+'px';
  };
  position();
  const observer=new ResizeObserver(position);
  observer.observe(element);
  element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
  return ()=>observer.disconnect();
 },[anchor]);
 useEffect(()=>{
  const outside=(event:globalThis.PointerEvent)=>{if(event.target instanceof Node&&!panel.current?.contains(event.target))close()};
  const layout=()=>{close();anchor.trigger.focus({preventScroll:true})};
  document.addEventListener('pointerdown',outside);
  const timeline=anchor.trigger.closest('.timeline');
  timeline?.addEventListener('scroll',layout);
  window.addEventListener('resize',layout);
  return ()=>{
   document.removeEventListener('pointerdown',outside);
   timeline?.removeEventListener('scroll',layout);
   window.removeEventListener('resize',layout);
  };
 },[anchor,close]);
 return createPortal(<div ref={panel} role="group" aria-label={label} className="context-actions" data-theme={anchor.trigger.closest('[data-theme]')?.getAttribute('data-theme')}
  onKeyDown={event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();anchor.trigger.focus({preventScroll:true});return}
   if(!['ArrowUp','ArrowDown','Home','End','Tab'].includes(event.key))return;
   const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
   const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
   const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'||event.shiftKey?-1:1)+buttons.length)%buttons.length;
   event.preventDefault();
   buttons[next]?.focus();
  }}>{children}</div>,document.body);
}

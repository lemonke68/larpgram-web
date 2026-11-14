import {useEffect} from 'react';

export function useTransientScrollbars(){
 useEffect(()=>{
  const timers=new Map<HTMLElement,number>();
  let grabbed:HTMLElement|undefined;
  const show=(element:HTMLElement)=>{
   element.dataset.scrollbar='';
   element.dataset.scrollVisible='true';
   clearTimeout(timers.get(element));
   if(element===grabbed)return;
   timers.set(element,window.setTimeout(()=>{
    delete element.dataset.scrollVisible;
    timers.delete(element);
   },1500));
  };
  const find=(target:EventTarget|null)=>{
   for(let element=target instanceof Element?target:null;element&&element!==document.body;element=element.parentElement){
    if(!(element instanceof HTMLElement))continue;
    const {overflowX,overflowY}=getComputedStyle(element);
    if((/auto|scroll/.test(overflowY)&&element.scrollHeight>element.clientHeight)||
       (/auto|scroll/.test(overflowX)&&element.scrollWidth>element.clientWidth))return element;
   }
  };
  const enter=(event:PointerEvent)=>{
   const target=find(event.target);
   if(target&&find(event.relatedTarget)!==target)show(target);
  };
  const scroll=(event:Event)=>{
   const target=event.target;
   if(target instanceof HTMLElement&&(target.matches(':hover')||target.contains(document.activeElement)||matchMedia('(hover: none)').matches))show(target);
  };
  const grab=(event:PointerEvent)=>{
   const target=find(event.target);
   if(!target||event.target!==target||event.pointerType==='touch')return;
   const bounds=target.getBoundingClientRect();
   if(bounds.right-event.clientX<=12||bounds.bottom-event.clientY<=12){
    grabbed=target;
    show(target);
   }
  };
  const release=()=>{
   const target=grabbed;
   grabbed=undefined;
   if(target)show(target);
  };
  document.addEventListener('pointerup',release);
  document.addEventListener('pointercancel',release);
  document.addEventListener('pointerover',enter);
  document.addEventListener('pointerdown',grab);
  document.addEventListener('scroll',scroll,true);
  return ()=>{
   release();
   document.removeEventListener('pointerup',release);
   document.removeEventListener('pointercancel',release);
   document.removeEventListener('pointerover',enter);
   document.removeEventListener('pointerdown',grab);
   document.removeEventListener('scroll',scroll,true);
   for(const [element,timer] of timers){clearTimeout(timer);delete element.dataset.scrollVisible}
  };
 },[]);
}

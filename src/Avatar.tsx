import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {Icon} from './Icon';

function createAvatarCache(token?:string|null){
  const requests=new Map<string,Promise<string|null>>();
  const urls=new Set<string>();
  const controller=new AbortController();
  return {
    load(mxc:string){
      const match=mxc.match(/^mxc:\/\/([^/]+)\/([^/]+)$/);
      if(!match||!token)return Promise.resolve(null);
      const cached=requests.get(mxc);
      if(cached)return cached;
      const path=match.slice(1).map(encodeURIComponent).join('/');
      const request=fetch('/_matrix/client/v1/media/thumbnail/'+path+'?width=96&height=96&method=crop',{
        headers:{Authorization:'Bearer '+token},
        signal:controller.signal,
      }).then(async response=>{
        if(!response.ok||!/^image\/(avif|gif|jpeg|png|webp)(;|$)/i.test(response.headers.get('content-type')??''))return null;
        const blob=await response.blob();
        if(controller.signal.aborted)return null;
        const url=URL.createObjectURL(blob);
        urls.add(url);
        return url;
      }).catch(()=>{requests.delete(mxc);return null});
      requests.set(mxc,request);
      return request;
    },
    dispose(){
      controller.abort();
      for(const url of urls)URL.revokeObjectURL(url);
      urls.clear();
      requests.clear();
    },
  };
}

const AvatarCache=createContext<ReturnType<typeof createAvatarCache>|null>(null);

export function AvatarProvider({token,children}:{token?:string|null;children:ReactNode}){
  const cache=useMemo(()=>createAvatarCache(token),[token]);
  useEffect(()=>()=>cache.dispose(),[cache]);
  return <AvatarCache.Provider value={cache}>{children}</AvatarCache.Provider>;
}

export function Avatar({name,mxc,identity,saved=false}:{name:string;mxc?:string|null;identity?:string;saved?:boolean}){
  const cache=useContext(AvatarCache);
  const [image,setImage]=useState<{mxc:string;cache:typeof cache;url:string}|null>(null);
  useEffect(()=>{
    if(saved||!mxc||!cache)return;
    let active=true;
    void cache.load(mxc).then(url=>{if(active&&url)setImage({mxc,cache,url})});
    return ()=>{active=false};
  },[cache,mxc,saved]);

  const initial=Array.from(name.replace(/^@/,'').trim())[0]?.toUpperCase()||'L';
  const tone=Array.from(identity??name).reduce((sum,char)=>sum+(char.codePointAt(0)??0),0)%5;
  const current=!saved&&image?.mxc===mxc&&image?.cache===cache?image:null;
  return <span className="avatar" data-tone={tone} aria-hidden="true">
    {saved?<Icon name="bookmark"/>:initial}
    {current&&<img src={current.url} alt="" onError={()=>setImage(previous=>previous===current?null:previous)}/>}
  </span>;
}

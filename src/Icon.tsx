import type {SVGProps} from "react";
import catalogue from './androidIcons.json';

export type IconName=keyof typeof catalogue;
export function Icon({name,size=24}:{name:IconName;size?:number}){
 const icon=catalogue[name];
 return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox={icon.viewBox} className={'mirror' in icon&&icon.mirror?'android-mirror':undefined}>
  {icon.nodes.map((path,index)=><path key={index} {...path as SVGProps<SVGPathElement>}/>)}
 </svg>;
}

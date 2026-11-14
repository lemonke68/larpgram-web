import {useEffect,useRef,useState,type ComponentProps,type ReactNode} from 'react';
import {Icon,type IconName} from './Icon';

export function Button({variant='secondary',className='',busy=false,disabled, ...props}:ComponentProps<'button'>&{variant?:'primary'|'secondary'|'danger'|'plain';busy?:boolean}){
 return <button type="button" {...props} className={`control control-${variant} ${className}`} aria-busy={busy||undefined} disabled={disabled||busy}/>;
}
export function IconButton({icon,label,size=24,...props}:Omit<ComponentProps<typeof Button>,'children'>&{icon:IconName;label:string;size?:number}){
 return <Button variant="plain" {...props} className={`icon-button ${props.className??''}`} aria-label={label} title={props.title??label}><Icon name={icon} size={size}/></Button>;
}
export function SettingsRow({id,icon,color,children,detail,onClick,disabled}:{
 id?:string;icon:IconName;color?:string;children:ReactNode;detail?:ReactNode;onClick:()=>void;disabled?:boolean;
}){
 return <Button id={id} variant="plain" className="settings-row" disabled={disabled} onClick={onClick}>
  <span className="settings-icon" style={color?{background:color,color:'#fff'}:undefined}><Icon name={icon} size={18}/></span>
  <span className="settings-label"><strong>{children}</strong>{detail&&<small>{detail}</small>}</span><Icon name="chevron" size={18}/>
 </Button>;
}
export function Confirm({title,children,action,busy,onCancel,onConfirm}:{title:string;children?:ReactNode;action:string;busy?:boolean;onCancel:()=>void;onConfirm:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=dialog.current;el?.showModal();return ()=>el?.close()},[]);
 return <dialog ref={dialog} className="confirm-dialog" aria-label={title} onCancel={event=>{event.preventDefault();if(!busy)onCancel()}}>
  <h3>{title}</h3>{children}
  <div className="room-detail-actions"><Button autoFocus disabled={busy} onClick={onCancel}>Отмена</Button><Button variant="danger" busy={busy} onClick={onConfirm}>{action}</Button></div>
 </dialog>;
}
export function PasswordInput({label,value,onChange,...props}:Omit<ComponentProps<'input'>,'type'|'value'|'onChange'>&{label:string;value:string;onChange:(value:string)=>void}){
 const [visible,setVisible]=useState(false);
 return <label>{label}<span className="password-field"><input {...props} type={visible?'text':'password'} value={value} onChange={event=>onChange(event.target.value)}/>
  <IconButton icon={visible?'eye':'eyeOff'} label={visible?'Скрыть пароль':'Показать пароль'} disabled={props.disabled} onClick={()=>setVisible(value=>!value)}/>
 </span></label>;
}

"""Build the web catalogue from the adjacent Android checkout at the audited revision."""
from pathlib import Path
import json, re, subprocess, xml.etree.ElementTree as ET

web = Path(__file__).resolve().parents[1]
android = web.parent / 'element-x-android'
sha = 'b14baf468ef94393b97a10fd28e4c0b3c1ce4f0d'
drawable = 'libraries/compound/src/main/res/drawable/'
sources = dict(item.split(':') for item in '''
ban:block photo:take_photo chevron:chevron_right shield:shield devices:devices bell:notifications archive:folder
time:time reply:reply forward:forward copy:copy edit:edit trash:delete
play:play_solid pause:pause_solid image:image download:download file:document music:audio chat:chat retry:restart
link:link minimize:minus maximize:full_screen hangup:end_call plus:plus settings:settings search:search down:arrow_down
phone:voice_call camera:video_call clip:attachment send:send_solid mic:mic_on_solid close:close mute:notifications_off
videoNote:video_call emoji:reaction pin:pin stop:stop_solid arrowBack:arrow_left arrowNext:arrow_right
keyboard:keyboard lock:lock account:user_profile signOut:sign_out email:email key:key overflow:overflow_vertical
chatSolid:chat_solid phoneSolid:voice_call_solid videoSolid:video_call_solid unpin:unpin
eye:visibility_on eyeOff:visibility_off editSolid:edit_solid bellSolid:notifications_solid muteSolid:notifications_off_solid
'''.split())

def read(path):
    return subprocess.check_output(['git','-C',android,'show',f'{sha}:{path}'],text=True)

def locate(filename):
    paths = subprocess.check_output(['git','-C',android,'ls-tree','-r','--name-only',sha],text=True).splitlines()
    return next(path for path in paths if path.endswith('/'+filename))

def unpack(el):
    attrs = {k.split('}')[-1]:v for k,v in el.attrib.items()}
    tag = el.tag
    if tag == 'vector':
        return {'viewBox':f"0 0 {attrs['viewportWidth']} {attrs['viewportHeight']}", 'mirror':attrs.get('autoMirrored')=='true',
                'nodes':[unpack(child) for child in el]}
    if tag != 'path':
        raise ValueError(f'Unhandled shape: {tag}')
    allowed = {'pathData','fillColor','fillType','fillAlpha','strokeColor','strokeWidth','strokeAlpha','strokeLineCap','strokeLineJoin','strokeMiterLimit'}
    if set(attrs)-allowed:
        raise ValueError(attrs)
    result = {'d':attrs.pop('pathData'), 'fill':'none'}
    for key,val in attrs.items():
        if key in ('fillColor','strokeColor'):
            match = re.fullmatch(r'#(?:(\w\w))?000000',val)
            if not match:
                raise ValueError(val)
            mode=key.removesuffix('Color')
            result[mode]='currentColor'
            alpha=match[1]
            if alpha and alpha.upper()!='FF':
                result[mode+'Opacity']=int(alpha,16)/255
        elif key=='fillType':
            result['fillRule']={'evenOdd':'evenodd','nonZero':'nonzero'}[val]
        elif key in ('fillAlpha','strokeAlpha'):
            target=key.replace('Alpha','Opacity')
            result[target]=float(result.get(target,1))*float(val)
        else:
            result[key]=val
    return result

catalogue={}
registry={}
for role,name in sources.items():
    path=f'{drawable}ic_compound_{name}.xml'
    catalogue[role]=unpack(ET.fromstring(read(path)))
    registry[role]=('CompoundIcons.'+''.join(part.title() for part in name.split('_')),path)
path=locate('SavedMessagesAvatar.kt')
commands={'moveTo':'M','lineTo':'L','quadTo':'Q','close':'Z'}
d=' '.join(commands[k]+re.sub('[f,]','',args) for k,args in re.findall(r'(moveTo|lineTo|quadTo|close)\(([^)]*)\)',read(path).split('val icon:',1)[1]))
catalogue['bookmark']={'viewBox':'0 0 24 24','nodes':[{'d':d,'fill':'currentColor'}]}
registry['bookmark']=('SavedMessagesAvatar.icon',path)
path=locate('TgHomeTab.kt')
d=''.join(re.findall(r'"([^"]*)"',read(path).split('pathData = addPathNodes(',1)[1].split('),',1)[0]))
catalogue['chatBrand']={'viewBox':'0 0 24 24','nodes':[{'d':d,'fill':'none','stroke':'currentColor','strokeWidth':1.9,'strokeLinecap':'round','strokeLinejoin':'round'}]}
registry['chatBrand']=('TgChatsTabIcon',path)
# Compose Canvas geometry uses a 16 x 11.2 coordinate space.
path=locate('MessageDeliveryTicks.kt')
for role,scales in [('check',[(.78,.11)]),('checks',[(.62,0),(.62,.38)])]:
    nodes=[]
    for scale, offset in scales:
        coords=[(16*(offset+scale*x),11.2*y) for x,y in [(.06,.55),(.36,.86),(.94,.16)]]
        d=' '.join(f'{cmd}{x:.5f} {y:.5f}' for cmd,(x,y) in zip('MLL',coords))
        nodes.append({'d':d,'fill':'none','stroke':'currentColor','strokeWidth':1.5,'strokeLinecap':'round','strokeLinejoin':'round'})
    catalogue[role]={'viewBox':'0 0 16 11.2','nodes':nodes}
    registry[role]=('MessageDeliveryTicks.'+('Read' if role=='checks' else 'Sent'),path)
(web/'src/androidIcons.json').write_text(json.dumps(catalogue,ensure_ascii=False,indent=2)+'\n')
source_url=f"https://github.com/lemonke68/Larpgram/blob/{sha}"
doc='''# Android icon sources

Revision: `'''+sha+'''`. The SVG renderer is [Icon.tsx](src/Icon.tsx), with data generated by
`python3 scripts/import-android-icons.py`. The import preserves paths, paint order, fill rules,
alpha and viewport, with Compose tint mapped to currentColor. Unsupported XML fails the import.

Source notices: compound resources and project vectors are distributed under the terms in
the [Android source license]('''+source_url+'''/LICENSE). The project Kotlin vectors carry Copyright © 2026 Larpgram,
SPDX AGPL-3.0-only OR LicenseRef-Element-Commercial. The AGPL text is included in
[LICENSE-ANDROID-ICONS](LICENSE-ANDROID-ICONS).

| Web role | Android vector | Source |
| --- | --- | --- |
'''
for role,(variant,path) in registry.items():
    doc+=f'| `{role}` | `{variant}` | [{Path(path).name}]({source_url}/{path}) |\n'
doc+='''
Compose anchors: TgPreferencesRootView, SettingsCategory, EditUserProfileView, TgHomeTopBar,
TgHomeTabBar, TgChatHeader, TgComposerLayout, LarpgramRecordModeButton, SendButtonIcon,
TgProfileKit, PasswordVisibilityToggle and TgFormNextButton.

Web choices: Folder represents archive, Minus/FullScreen represent shell collapse/expand,
Chat jumps to the source message, and Restart retries.
Element Call vendor internals are separate from this catalogue.

Element Call is the existing vendor build from `element-call-interface@9f7c35c`
plus its component patch. Its [button source](../element-call-interface/src/button/Button.tsx)
imports Compound Web tokens: `MicOnSolid` / `MicOffSolid`, `VideoCallSolid` /
`VideoCallOffSolid`, `EndCall`, and `Spinner` during a pending microphone action.
These are vendor-owned surfaces and were not recompiled in this pass. The native
shell uses the Android imports from the table. The auth `L` is a wordmark, as in
`TgAuthLogo`, rather than a vector. Audio/video controls rendered by the browser
are native controls.
'''
(web/'ANDROID-ICONS.md').write_text(doc)

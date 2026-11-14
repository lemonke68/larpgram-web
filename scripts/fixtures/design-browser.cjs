// Usage: PLAYWRIGHT_MODULE=/path/to/playwright node design-browser.cjs OUT BEFORE AFTER
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const [out,before='http://127.0.0.1:4201',after='http://127.0.0.1:4202']=process.argv.slice(2);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=','base64');
const screens=[
 ['Аккаунт','account'],['Настройки чатов','appearance'],['Конфиденциальность','privacy'],
 ['Шифрование и ключи','encryption'],['Уведомления','notifications'],['Устройства','devices'],
];
const find=(page,name)=>page.getByRole('button',{name,exact:true});
const row=(page,name)=>page.getByRole('button',{name}).first();
const wait=(page,name)=>page.getByRole('heading',{name,exact:true}).waitFor();
const shot=async(page,name)=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});console.log('frame',name)};
const back=async(page,name)=>{await find(page,'Назад').click();await wait(page,name)};
async function openProfile(page){await find(page,'Профиль').click();await wait(page,'Профиль')}
async function session(browser,url,width=1280,height=720,theme='dark'){
 const context=await browser.newContext({viewport:{width,height}});
 await context.addInitScript(theme=>{if(!localStorage.getItem('larpgram-theme'))localStorage.setItem('larpgram-theme',theme)},theme);
 await context.route('**/_matrix/client/v1/media/**',route=>route.fulfill({body:png,contentType:'image/png'}));
 const page=await context.newPage();
 page.setDefaultTimeout(3500);
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);
 return {page,context,errors};
}
async function widthCheck(page){
 const geometry=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:innerWidth}));
 assert(geometry.body<=geometry.viewport,JSON.stringify(geometry));
}
async function capture(browser){
 for(const theme of ['dark','light']){
  const old=await session(browser,before,1280,720,theme);
  await find(old.page,'Мой профиль').click();await shot(old.page,'before-profile-'+theme);
  await find(old.page,'Настройки').first().click();await shot(old.page,'before-settings-'+theme);
  await old.context.close();
  const {page,context,errors}=await session(browser,after,1280,720,theme);
  await openProfile(page);
  await shot(page,'after-profile-'+theme);
  await page.locator('#profile-identity').click();await wait(page,'Изменить профиль');await shot(page,'after-edit-'+theme);await back(page,'Профиль');
  for(const [title,key] of screens){
   await row(page,title).click();await wait(page,title);await shot(page,'after-'+key+'-'+theme);
   if(key==='account')for(const name of ['Почта','Пароль']){
    await find(page,name).click();await wait(page,name);await shot(page,'after-'+(name==='Почта'?'email':'password')+'-'+theme);await back(page,'Аккаунт');
   }
   if(key==='privacy'){await row(page,'Заблокированные пользователи').click();await wait(page,'Заблокированные пользователи');await shot(page,'after-blocked-'+theme);await back(page,title)}
   if(key==='encryption'){await find(page,'Восстановить историю').click();await wait(page,'Восстановление истории');await shot(page,'after-recovery-'+theme);await back(page,title)}
   await back(page,'Профиль');
  }
  for(const [width,height] of [[1024,720],[1440,720],[1920,900],[1024,500]]){
   await page.setViewportSize({width,height});await widthCheck(page);await shot(page,`after-profile-${theme}-${width}x${height}`);
  }
  await page.setViewportSize({width:640,height:360});await widthCheck(page);
  await page.locator('#profile-identity').click();await wait(page,'Изменить профиль');
  assert(await find(page,'Сохранить').isVisible());await shot(page,'after-edit-'+theme+'-640x360');
  await back(page,'Профиль');await find(page,'Назад').click();await page.locator('.profile-workspace').waitFor({state:'hidden'});
  await page.setViewportSize({width:1280,height:720});
  await row(page,'Toluze · фикстура').click();
  await shot(page,'after-direct-'+theme);
  await find(page,'Медиапанель').click();await shot(page,'after-composer-media-'+theme);await find(page,'Медиапанель').click();
  await page.locator('.chat-identity').click();await shot(page,'after-peer-'+theme);await find(page,'Закрыть панель').click();
  await row(page,'Мастерская · фикстура').click();await shot(page,'after-group-'+theme);
  await row(page,'Новости · фикстура').click();await shot(page,'after-channel-'+theme);
  await page.goto(after+'/?signed-out');await wait(page,'Вход');await shot(page,'after-login-'+theme);
  assert.deepEqual(errors,[]);await context.close();
 }
}
async function actions(browser){
 const {page,context,errors}=await session(browser,after);
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await row(page,'Toluze · фикстура').click();
 const composer=page.getByRole('textbox',{name:'Сообщение',exact:true});
 await composer.fill('Фикстура черновика');
 const viewport=page.locator('.timeline');
 await viewport.evaluate(el=>{el.scrollTop=240});await page.waitForTimeout(150);
 const pos=await viewport.evaluate(el=>el.scrollTop);
 await openProfile(page);
 await find(page,'Копировать Matrix ID').click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'@mila-fixture-with-a-long-matrix-identifier:example.invalid');
 await row(page,'Аккаунт').click();await wait(page,'Аккаунт');
 await find(page,'Выйти').click();await page.getByRole('dialog').waitFor();
 await page.evaluate(()=>window.fixtureFailures.add('end'));
 await page.getByRole('dialog').getByRole('button',{name:'Выйти',exact:true}).click();
 await page.getByRole('dialog').getByRole('alert').waitFor();
 await page.evaluate(()=>window.fixtureFailures.delete('end'));
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.goBack();await wait(page,'Профиль');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'profile-row-account');
 await page.keyboard.press('Escape');await composer.waitFor();await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'open-profile');
 assert.equal(await composer.inputValue(),'Фикстура черновика');
 assert(Math.abs(await viewport.evaluate(el=>el.scrollTop)-pos)<3,'chat scroll changed on return');
 await openProfile(page);
 await page.locator('#profile-identity').click();await page.getByLabel('Имя',{exact:true}).fill('Не сохранять');
 await back(page,'Профиль');assert.doesNotMatch(await page.locator('.own-name').innerText(),/Не сохранять/);
 await page.locator('.own-hero input[type=file]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:png});
 await wait(page,'Изменить профиль');await page.getByAltText('Предпросмотр фото профиля').waitFor();
 await page.getByLabel('Имя',{exact:true}).fill('Мила после сохранения');
 await page.locator('#profile-editor-about').fill('');
 await page.evaluate(()=>window.fixtureFailures.add('avatar'));
 await find(page,'Сохранить').click();await page.getByRole('alert').filter({hasText:'Сохранено:'}).waitFor();
 await shot(page,'after-edit-partial-error');
 await page.evaluate(()=>window.fixtureFailures.delete('avatar'));
 await find(page,'Сохранить').click();await wait(page,'Профиль');
 await page.reload();await openProfile(page);
 assert.match(await page.locator('.own-name').innerText(),/Мила после сохранения/);
 assert.equal(await page.locator('.profile-bio p').innerText(),'Не указано');
 await page.locator('#open-profile img').waitFor();
 await row(page,'Настройки чатов').click();await find(page,'Светлая').click();await find(page,'Однотонный').click();
 await page.reload();await openProfile(page);await row(page,'Настройки чатов').click();
 assert.equal(await find(page,'Светлая').getAttribute('aria-pressed'),'true');
 assert.equal(await find(page,'Однотонный').getAttribute('aria-pressed'),'true');await back(page,'Профиль');
 await row(page,'Уведомления').click();await page.getByRole('switch').click();
 assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'false');
 await page.reload();await openProfile(page);await row(page,'Уведомления').click();
 assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'false');await back(page,'Профиль');
 await row(page,'Конфиденциальность').click();await row(page,'Заблокированные пользователи').click();
 await find(page,'Разблокировать').click();await page.getByRole('dialog').getByRole('button',{name:'Разблокировать',exact:true}).click();
 await page.getByText('Заблокированных пользователей нет.').waitFor();await back(page,'Конфиденциальность');await back(page,'Профиль');
 await page.evaluate(()=>window.fixtureFailures.add('devices'));
 await row(page,'Устройства').click();await page.getByText('Не удалось загрузить устройства.').waitFor();
 await page.evaluate(()=>window.fixtureFailures.delete('devices'));await find(page,'Повторить').click();
 await find(page,'Завершить сеанс').click();
 await page.evaluate(()=>window.fixtureFailures.add('end'));
 await find(page,'Подтвердить').count().then(async n=>{if(n)await find(page,'Подтвердить').click();else await page.getByRole('dialog').getByRole('button',{name:'Завершить сеанс',exact:true}).click()});
 await page.getByRole('dialog').getByRole('alert').waitFor();await page.evaluate(()=>window.fixtureFailures.delete('end'));
 await page.getByRole('dialog').getByRole('button',{name:'Завершить сеанс',exact:true}).click();
 await page.getByText('Других сеансов нет.').waitFor();await back(page,'Профиль');
 await row(page,'Аккаунт').click();await find(page,'Почта').click();
 await page.getByLabel('Новая почта').fill('changed@example.invalid');await find(page,'Получить код').click();
 await page.getByLabel('Код из письма').fill('000000');await find(page,'Подтвердить код').click();await page.getByText('Неверный код из письма.').waitFor();
 await find(page,'Отправить код снова').click();await page.getByLabel('Код из письма').fill('123456');await find(page,'Подтвердить код').click();
 await page.getByText('Почта обновлена.').waitFor();await back(page,'Аккаунт');
 await find(page,'Пароль').click();await find(page,'Получить код').click();
 await page.getByLabel('Код из письма').fill('123456');await find(page,'Подтвердить код').click();
 await page.getByLabel('Новый пароль',{exact:true}).fill('fixture-only-password');await page.getByLabel('Повторите новый пароль').fill('fixture-only-password');
 await find(page,'Сохранить пароль').click();await page.getByText('Пароль изменён.').waitFor();await back(page,'Аккаунт');await back(page,'Профиль');
 await row(page,'Шифрование и ключи').click();await find(page,'Восстановить историю').click();await find(page,'Ключ').click();
 await page.getByLabel('Ключ восстановления').fill('bad');await find(page,'Восстановить').click();await page.getByText(/Не удалось восстановить историю/).waitFor();
 await page.getByLabel('Ключ восстановления').fill('fixture-valid');await find(page,'Восстановить').click();await page.getByText('Веб-устройство подтверждено.').waitFor();
 await back(page,'Шифрование и ключи');await back(page,'Профиль');
 await page.locator('.profile-workspace').getByRole('button',{name:'Избранное',exact:true}).click();
 await page.locator('.chat-identity').getByText('Избранное').waitFor();
 await row(page,'Toluze · фикстура').click();
 await composer.fill('');await find(page,'Переключить на видеосообщение').click();await find(page,'Записать видеосообщение').waitFor();
 await composer.fill('Сообщение только в локальную фикстуру');await composer.press('Enter');
 await page.locator('.timeline').getByText('Сообщение только в локальную фикстуру').waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: clipboard, logout failure and dialog Escape, Back and focus, scroll/draft, profile cancel/partial save/reload/avatar, appearance reload, Matrix toggle reload, privacy unblock, devices load and end failures/retries, email code and resend, password code and success, recovery error and retry, Saved Messages reuse, composer mode and keyboard send');
 await context.close();
}
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch();
 try{await capture(browser);await actions(browser)}finally{await browser.close()}
 const ff=await firefox.launch();
 try{
  const {page,context,errors}=await session(ff,after,1024,720,'light');await openProfile(page);await widthCheck(page);
  await row(page,'Аккаунт').click();await page.keyboard.press('Escape');await wait(page,'Профиль');assert.deepEqual(errors,[]);
  await shot(page,'after-firefox-light');await context.close();console.log('PASS: Firefox profile, layout and Escape');
 }finally{await ff.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

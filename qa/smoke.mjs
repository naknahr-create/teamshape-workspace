import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT='http://127.0.0.1:4173/';
await mkdir('qa-artifacts',{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
page.on('pageerror',err=>errors.push(err.stack||String(err)));
const check=async(desc,fn)=>{await fn();console.log('PASS',desc)};
try{
 await page.goto(ROOT,{waitUntil:'networkidle'});
 await check('app and chart render',async()=>{
  assert.ok(await page.locator('.studio-shell').count());
  assert.ok((await page.locator('.studio-node').count())>=5);
  assert.ok((await page.locator('.studio-dept-shortcut').count())>=3);
 });
 await check('direct employee editing',async()=>{
  const employee=page.locator('.studio-roster-row[data-action="focus-node"]').first();
  await employee.click();
  const role=page.locator('[data-quick-field="role"]').first();
  assert.ok(await role.isVisible());
  await role.fill('QA Role Without Modal');
  await role.press('Tab');
  assert.ok((await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1'))))
   .employees.some(e=>e.role==='QA Role Without Modal'));
 });
 await check('department goal and KPI editing',async()=>{
  await page.locator('.studio-dept-shortcut').filter({hasText:'Dealmaker'}).first().click();
  const goal=page.locator('[data-strategy-field="goal"]');
  assert.ok(await goal.isVisible());
  await goal.fill('QA goal for department');
  await goal.press('Tab');
  await page.locator('[data-action="strategy-add-kpi"]').click();
  const kpi=page.locator('[data-kpi-field="name"]').first();
  await kpi.fill('Monthly qualified leads');
  await kpi.press('Tab');
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')));
  assert.equal(state.strategy.Dealmaker.goal,'QA goal for department');
  assert.ok(state.strategy.Dealmaker.kpis.length>0);
 });
 await check('sticky note is created and editable on canvas',async()=>{
  await page.locator('[data-action="tool-sticky"]').click();
  assert.ok(await page.locator('[data-action="tool-sticky"].active').count(),'sticky tool should be active');
  const point=await page.evaluate(()=>{
   const vp=document.querySelector('#studioViewport'),r=vp.getBoundingClientRect();
   for(let yy=70;yy<r.height-140;yy+=45){
    for(let xx=50;xx<r.width-60;xx+=65){
     const x=r.left+xx,y=r.top+yy,target=document.elementFromPoint(x,y);
     if(target?.closest('#studioViewport')&&!target.closest('.studio-node,.studio-canvas-item,.studio-department-head,.studio-canvas-caption,.studio-canvas-tools,.studio-zoom-box,.studio-minimap,.studio-edge-panel,.studio-multiselect-bar,.studio-edge-hit,.studio-edge-handle,[data-action]'))
      return{x,y,tag:target.tagName,cls:target.getAttribute('class')};
    }
   }
   return null;
  });
  assert.ok(point,'should find a clear canvas coordinate for a sticky');
  await page.mouse.click(point.x,point.y);
  assert.ok(await page.locator('.studio-canvas-item').count(),'sticky creation failed at '+JSON.stringify(point));
  const last=page.locator('.studio-canvas-item').last();
  await last.locator('.studio-item-text').fill('QA sticky note');
  assert.ok((await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1'))))
   .canvasItems.some(x=>x.text==='QA sticky note'));
 });
 await check('employee export excludes confidential compensation and future personnel',async()=>{
  await page.locator('.studio-share-menu summary').click();
  const d=page.waitForEvent('download');
  await page.locator('[data-action="export-employee-html"]').click();
  const download=await d;
  const output=path.join('qa-artifacts',download.suggestedFilename());
  await download.saveAs(output);
  const html=await readFile(output,'utf-8');
  assert.ok(html.includes('Organization Overview'));
  assert.ok(!html.includes('salary')&&!html.includes('salaryOverride'));
  assert.ok(!html.includes('Growth Marketing'));
  assert.ok(!html.includes('เสนอให้ออก')&&!html.includes('เงินเดือนฐาน'));
 });
 await check('state persisted after reload',async()=>{
  await page.reload({waitUntil:'networkidle'});
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')));
  assert.ok(state.employees.some(e=>e.role==='QA Role Without Modal'));
  assert.equal(state.strategy.Dealmaker.goal,'QA goal for department');
  assert.ok(state.canvasItems.some(x=>x.text==='QA sticky note'));
 });
 await page.screenshot({path:'qa-artifacts/desktop.png',fullPage:false});
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2});
 mobile.on('pageerror',err=>errors.push(err.stack||String(err)));
 await mobile.goto(ROOT,{waitUntil:'networkidle'});
 await check('responsive mobile chart',async()=>{
  assert.ok(await mobile.locator('.studio-shell').count());
  assert.ok(await mobile.locator('.studio-node').count());
 });
 await mobile.screenshot({path:'qa-artifacts/mobile.png'});
 await mobile.close();
 assert.deepEqual(errors,[],'JavaScript console page errors');
 console.log('ALL TEAMSHAPE BROWSER SMOKE CHECKS PASSED');
}finally{await browser.close()}

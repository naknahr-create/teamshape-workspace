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
  assert.equal(await page.locator('.studio-department-frame').count(),0,'colored department background frames must not be rendered');
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
 await check('18 position choices and custom job titles',async()=>{
  const employee=page.locator('.studio-roster-row[data-action="focus-node"]').first();
  await employee.click();
  const select=page.locator('select[data-role-preset-quick]').first();
  assert.ok(await select.isVisible(),'Position must use a dropdown');
  const values=await select.locator('option').evaluateAll(opts=>opts.map(o=>o.value));
  assert.equal(values.length,19,'18 preset levels plus custom entry');
  assert.ok(values.includes('Junior')&&values.includes('Senior')&&values.includes('Entry Level / First Jobber')&&values.includes('C-Level')&&values.includes('CEO'));
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')).employees[0]);
  await select.selectOption('Junior');
  let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')).employees[0]);
  assert.equal(stored.role,'Junior','Selecting preset should save immediately');
  assert.equal(stored.salary,before.salary,'Salary must not change when setting role');
  const custom=page.locator('select[data-role-preset-quick]').first();
  await custom.selectOption('__custom__');
  const input=page.locator('input[data-role-custom-quick]').first();
  assert.ok(await input.isVisible(),'Custom role input becomes available on demand');
  await input.fill('QA Role Without Modal');
  await input.press('Tab');
  stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')).employees[0]);
  assert.equal(stored.role,'QA Role Without Modal','Legacy custom roles remain editable');
  assert.equal(stored.salary,before.salary);
  await page.locator('[data-action="add-employee"]').click();
  assert.equal(await page.locator('#modalRolePreset option').count(),19,'Add employee modal has 18 choices and custom');
  await page.locator('#modalRolePreset').selectOption('Senior');
  assert.equal(await page.locator('#modalRoleValue').inputValue(),'Senior');
  await page.locator('#modalRolePreset').selectOption('__custom__');
  assert.ok(await page.locator('#modalRoleValue').isVisible(),'Modal custom title is editable');
  await page.locator('#modalRoleValue').fill('Custom Specialist');
  await page.locator('[data-action="close-modal"]').first().click();
  await page.locator('[data-action="add-hire"]').first().click();
  assert.equal(await page.locator('#modalRolePreset option').count(),19,'Hiring modal has job levels');
  await page.locator('#modalRolePreset').selectOption('Manager');
  assert.equal(await page.locator('#modalRoleValue').inputValue(),'Manager');
  await page.locator('[data-action="close-modal"]').first().click();
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
 await check('create and rename empty departments, assign staff, preserve KPI',async()=>{
  await page.locator('[data-action="department-add"]').click();
  const create=page.locator('#studioDepartmentForm');
  assert.ok(await create.isVisible(),'Department form must open from left sidebar');
  await create.locator('input[name="departmentName"]').fill('QA Research');
  await create.locator('button[type="submit"]').click();
  assert.ok(await page.locator('.studio-dept-shortcut[data-dept="QA Research"]').count(),'Empty department must appear');
  let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')));
  assert.ok(state.departments.includes('QA Research'),'New department must persist independently of employees');
  assert.equal(state.employees.filter(e=>e.dept==='QA Research').length,0);
  const goal=page.locator('[data-strategy-field="goal"]');
  await goal.fill('QA quarterly research delivery');
  await goal.press('Tab');
  await page.locator('[data-action="strategy-add-kpi"]').click();
  const kpi=page.locator('[data-kpi-field="name"]').first();
  await kpi.fill('Experiments shipped');
  await kpi.press('Tab');
  await page.locator('#studioDepartmentRenameForm input[name="departmentName"]').fill('QA Innovation');
  await page.locator('#studioDepartmentRenameForm button[type="submit"]').click();
  assert.ok(await page.locator('.studio-dept-shortcut[data-dept="QA Innovation"]').count());
  state=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')));
  assert.equal(state.strategy['QA Innovation'].goal,'QA quarterly research delivery','Rename must retain Goal');
  assert.equal(state.strategy['QA Innovation'].kpis[0].name,'Experiments shipped','Rename must retain KPI');
  assert.ok(!state.strategy['QA Research'],'Old strategy key must be removed');
  await page.locator('.studio-roster-row[data-action="focus-node"]').first().click();
  const person=page.locator('select[data-quick-field="dept"]');
  assert.ok(await person.isVisible(),'Department must be a real select, not a filtered datalist');
  const deptOptions=await person.locator('option').allTextContents();
  assert.ok(deptOptions.includes('QA Innovation')&&deptOptions.includes('Dealmaker')&&deptOptions.length>=3,'All departments must be selectable even when another one is selected');
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')).employees.map(e=>e.dept));
  const originalSalary=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')).employees[0].salary);
  await person.selectOption({label:'QA Innovation'});
  const afterSalary=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')).employees[0].salary);
  assert.equal(afterSalary,originalSalary,'Changing departments must not change salary');
  state=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')));
  assert.ok(state.employees.some(e=>e.dept==='QA Innovation'),'New department must be assignable from Inspector');
  await page.locator('.studio-dept-shortcut[data-dept="QA Innovation"]').click();
  await page.locator('.studio-dept-delete-icon[data-dept="QA Innovation"]').click();
  assert.ok(await page.locator('#studioDepartmentDeleteForm').isVisible(),'Delete confirmation panel opens for populated departments');
  assert.equal(await page.locator('#studioDepartmentTransfer').getAttribute('required'),'','Reassignment is required');
  await page.locator('[data-action="department-delete-cancel"]').click();
  await page.locator('#studioDepartmentRenameForm input[name="departmentName"]').fill('QA Innovation Office');
  await page.locator('#studioDepartmentRenameForm button[type="submit"]').click();
  state=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')));
  assert.equal(state.strategy['QA Innovation Office'].kpis[0].name,'Experiments shipped');
  assert.ok(state.employees.some(e=>e.dept==='QA Innovation Office'),'Renaming populated department must update staff');
  assert.equal(state.employees.length,before.length,'Department operations must not delete staff');
 });
 await check('visible department deletion transfers staff and preserves pay',async()=>{
  const storageKey='teamshape-workforce-v1';
  const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
  const office='QA Innovation Office';
  assert.ok(before.employees.some(e=>e.dept===office),'Previous test should assign an employee to the new department');
  const moved=before.employees.filter(e=>e.dept===office).map(e=>({id:e.id,salary:e.salary,allowance:e.allowance,managerId:e.managerId}));
  const trash=page.locator('.studio-dept-delete-icon[data-dept="QA Innovation Office"]');
  assert.ok(await trash.isVisible(),'Trash icon must be visible beside every department');
  await trash.click();
  const panel=page.locator('#studioDepartmentDeleteForm');
  assert.ok(await panel.isVisible(),'Delete form should appear without scrolling the inspector');
  assert.ok((await panel.innerText()).includes('พนักงานปัจจุบัน'));
  await panel.locator('select[name="destination"]').selectOption('Dealmaker');
  await panel.locator('button[type="submit"]').click();
  assert.equal(await page.locator('.studio-dept-shortcut[data-dept="QA Innovation Office"]').count(),0,'Deleted department should disappear');
  const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
  assert.equal(after.employees.length,before.employees.length,'No employee may be deleted');
  for(const item of moved){
    const employee=after.employees.find(e=>e.id===item.id);
    assert.equal(employee.dept,'Dealmaker');
    assert.equal(employee.salary,item.salary);
    assert.equal(employee.allowance,item.allowance);
    assert.equal(employee.managerId,item.managerId);
  }
  await page.locator('[data-action="studio-undo"]').click();
  const undone=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
  assert.ok(undone.employees.some(e=>e.dept===office),'Undo must restore deleted department staff');
  assert.ok(await page.locator('.studio-dept-shortcut[data-dept="QA Innovation Office"]').count());
  await page.locator('.studio-dept-delete-icon[data-dept="QA Innovation Office"]').click();
  await page.locator('[data-action="department-delete-cancel"]').click();
  assert.ok(await page.locator('.studio-dept-shortcut[data-dept="QA Innovation Office"]').count(),'Cancel must preserve department');
 });
 await check('delete empty department without touching other departments',async()=>{
  await page.locator('[data-action="department-add"]').click();
  await page.locator('#studioDepartmentForm input[name="departmentName"]').fill('QA Empty Department');
  await page.locator('#studioDepartmentForm button[type="submit"]').click();
  assert.ok(await page.locator('.studio-dept-delete-icon[data-dept="QA Empty Department"]').isVisible());
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')));
  await page.locator('.studio-dept-delete-icon[data-dept="QA Empty Department"]').click();
  const panel=page.locator('#studioDepartmentDeleteForm');
  assert.equal(await panel.locator('select[name="destination"]').count(),0,'Empty department should not require reassignment');
  await panel.locator('button[type="submit"]').click();
  assert.equal(await page.locator('.studio-dept-shortcut[data-dept="QA Empty Department"]').count(),0);
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')));
  assert.equal(after.employees.length,before.employees.length);
  assert.ok(!after.departments.includes('QA Empty Department'));
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
 await check('multi-select and group reposition',async()=>{
  await page.locator('[data-action="selection-all"]').click();
  assert.ok(await page.locator('#studioMultiActions').isVisible());
  const before=await page.locator('.studio-node').evaluateAll(nodes=>nodes.slice(0,2).map(n=>Number.parseFloat(n.style.left)));
  const first=page.locator('.studio-node').first(),box=await first.boundingBox();
  assert.ok(box&&box.width>0);
  await page.mouse.move(box.x+box.width*.48,box.y+box.height*.46);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.48+60,box.y+box.height*.46+28,{steps:8});
  await page.mouse.up();
  const after=await page.locator('.studio-node').evaluateAll(nodes=>nodes.slice(0,2).map(n=>Number.parseFloat(n.style.left)));
  assert.ok(Math.abs(after[0]-before[0])>0&&Math.abs(after[1]-before[1])>0,'both selected cards should move together');
  await page.locator('[data-action="studio-undo"]').click();
  const undone=await page.locator('.studio-node').evaluateAll(nodes=>nodes.slice(0,2).map(n=>Number.parseFloat(n.style.left)));
  assert.deepEqual(undone,before,'Undo should restore both cards');
  await page.locator('[data-action="studio-redo"]').click();
  const redone=await page.locator('.studio-node').evaluateAll(nodes=>nodes.slice(0,2).map(n=>Number.parseFloat(n.style.left)));
  assert.deepEqual(redone,after,'Redo should move both cards again');
 });

 await check('frozen baseline and manual total preserve comparable savings',async()=>{
  const oldState=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')));
  const oldFinance=oldState.scenarios.find(sc=>sc.id===oldState.currentScenario).finance;
  assert.ok(oldFinance.baseline.monthlyStaff>0,'Finance baseline should be persisted');
  const calculate=(m,state)=>{
   const sc=state.scenarios.find(x=>x.id===state.currentScenario),rate=Number(state.settings.employerRate)||0;
   let cost=0;
   for(const e of state.employees){
    const ch=sc.changes[e.id]||{},exit=ch.decision==='exit'&&m>=Number(ch.effectiveMonth||1);
    if(!exit)cost+=(Number(ch.salaryOverride??e.salary)+Number(e.allowance||0))*(1+rate/100);
   }
   for(const e of sc.hires)if(m>=Number(e.startMonth||1))cost+=(Number(e.salary)+Number(e.allowance||0))*(1+rate/100);
   return cost;
  };
  const originalPlanned1=calculate(1,oldState),originalPlanned12=calculate(12,oldState);
  await page.locator('[data-action="finance-open"]').click();
  const panel=page.locator('#studioFinancePanel');
  assert.ok(await panel.isVisible(),'Finance pane must open from the cost header');
  assert.ok(await panel.locator('tr').count()>10,'Finance pane must show breakdown and monthly rows');
  await panel.locator('#financeBaselineMode').selectOption('manual');
  const manualTotal=oldFinance.baseline.monthlyStaff+40000;
  await panel.locator('#financeManualTotal').fill(String(manualTotal));
  await panel.locator('#financeOtherDelta').fill('-10000');
  await panel.locator('select[name="otherEffectiveMonth"]').selectOption('4');
  await panel.locator('#studioFinanceForm button[type="submit"]').click();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')));
  const sc=state.scenarios.find(x=>x.id===state.currentScenario);
  assert.equal(sc.finance.mode,'manual');
  assert.equal(sc.finance.manualTotal,manualTotal);
  assert.equal(sc.finance.otherDelta,-10000);
  assert.equal(sc.finance.otherEffectiveMonth,4);
  assert.equal(sc.finance.baseline.monthlyStaff,oldFinance.baseline.monthlyStaff,'Frozen baseline snapshot must not change');
  assert.ok(await page.locator('#studioFinancePanel').isVisible(),'Finance pane should remain open after saving');
  const stateText=await page.locator('.studio-subbar').innerText();
  assert.ok(stateText.includes(Math.round(manualTotal).toLocaleString('th-TH')),'Header should show manually overridden baseline');
  const month1Expected=originalPlanned1+40000,month12Expected=originalPlanned12+30000;
  const renderedRows=await panel.locator('.studio-finance-months tbody tr').allTextContents();
  assert.equal(renderedRows.length,12);
  assert.ok(renderedRows[0].includes(Math.round(month1Expected).toLocaleString('th-TH')),'First month includes preserved overhead, before other cost change');
  assert.ok(renderedRows[11].includes(Math.round(month12Expected).toLocaleString('th-TH')),'Month 12 includes change in other costs');
  const exportNames=await panel.locator('label').allTextContents();
  assert.ok(exportNames.some(x=>x.includes('ต้นทุนรวมก่อนปรับ')));
  await page.screenshot({path:'qa-artifacts/finance.png',fullPage:false});
  await page.reload({waitUntil:'networkidle'});
  const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('teamshape-workforce-v1')));
  assert.equal(persisted.scenarios.find(x=>x.id===persisted.currentScenario).finance.manualTotal,manualTotal);
 });
 await page.screenshot({path:'qa-artifacts/desktop.png',fullPage:false});
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2});
 mobile.on('pageerror',err=>errors.push(err.stack||String(err)));
 await mobile.goto(ROOT,{waitUntil:'networkidle'});
 await check('responsive mobile chart',async()=>{
  assert.ok(await mobile.locator('.studio-shell').count());
  assert.ok(await mobile.locator('.studio-node').count());
  const bounds=await mobile.evaluate(()=>{
   const a=document.querySelector('.studio-canvas-tools').getBoundingClientRect(),b=document.querySelector('.studio-zoom-box').getBoundingClientRect();
   return {tools:{top:a.top,bottom:a.bottom},zoom:{top:b.top,bottom:b.bottom}};
  });
  assert.ok(bounds.zoom.bottom<=bounds.tools.top||bounds.tools.bottom<=bounds.zoom.top,'mobile zoom and tools must not overlap');
 });
 await mobile.screenshot({path:'qa-artifacts/mobile.png'});
 await mobile.close();
 assert.deepEqual(errors,[],'JavaScript console page errors');
 console.log('ALL TEAMSHAPE BROWSER SMOKE CHECKS PASSED');
}finally{await browser.close()}

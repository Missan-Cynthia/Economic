'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {session}=require('./bank.cjs');
(async()=>{
 const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright'),browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
 async function open(s){const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(state=>{if(!localStorage.getItem('miss-an-finance-game-v1'))localStorage.setItem('miss-an-finance-game-v1',JSON.stringify(state));Math.random=()=>0;},s.state);await p.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await p.locator('#continue').click();return p;}
 const saved=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('miss-an-finance-game-v1')));
 try{
  const s=session(3),cash=s.state.players.map(p=>p.cash);s.roll();const p=await open(s);
  await p.locator('#bankDialog').waitFor({state:'visible'});assert.match(await p.locator('#bankApplicant').innerText(),/銀行測試/);assert.deepEqual((await saved(p)).players.map(p=>p.cash),cash);
  await p.locator('#bankPrincipal').fill('100000');assert.equal(await p.locator('#bankInterest').innerText(),'166.67');await p.locator('#bankApply').click();assert.match(await p.locator('#bankApplicant').innerText(),/AI・保守/);
  let state=await saved(p);assert.equal(state.players[0].cash,cash[0]+100000);assert.equal(state.players[0].liabilities.loans.length,1);assert.equal(state.phase,'resolving');assert.equal(state.turn,3);
  await p.reload();await p.locator('#continue').click();assert.match(await p.locator('#bankApplicant').innerText(),/AI・保守/);assert.equal((await saved(p)).players[0].liabilities.loans.length,1);
  await p.screenshot({path:path.join(__dirname,'bank-choice.png')});
  for(let i=1;i<4;i++){assert.equal((await saved(p)).pending.bank.participantIndex,i);await p.locator('#bankDecline').click();}
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('miss-an-finance-game-v1')).turn===0);state=await saved(p);assert.equal(state.lastBank.decisions.length,4);assert.equal(await p.locator('#bankDialog').isVisible(),false);assert.deepEqual(state.players.slice(1).map(p=>p.cash),cash.slice(1));await p.close();
  for(const trigger of [0,3]){
   const s=session(trigger),p=await open(s);if(trigger===0)await p.locator('#roll').click();await p.locator('#bankDialog').waitFor({state:'visible'});assert.equal((await saved(p)).pending.bank.triggerPlayerId,trigger);assert.equal((await saved(p)).pending.bank.decisions.length,0);assert.equal(await p.locator('#bankApply').isVisible(),true);assert.equal(await p.locator('#bankDecline').isVisible(),true);await p.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS browser: human/AI landing, explicit per-player decisions, no automatic loans, reload at next applicant, resume after everyone chooses');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
const assert=require('node:assert/strict');
global.window=global;require('../data/game-data-bundle.js');
const E=require('../data/game-engine.js'),B=require('../js/board.js');
const cards=GAME_SOURCE_BUNDLE.sources.map(c=>E.derive(c));
const bank=B.zone('taiwan').findIndex(t=>t.type==='bank');
function session(trigger=0){const s=new E.play.Session(cards,B,()=>0);s.start('銀行測試','characters-009');s.state.turn=trigger;s.active.position=bank-1;return s;}
function unchanged(s,fn){const before=JSON.stringify(s.state);assert.throws(fn);assert.equal(JSON.stringify(s.state),before);}
assert.equal(B.zone('taiwan').filter(t=>t.type==='bank').length,1);assert.equal(B.zone('world').filter(t=>t.type==='bank').length,1);
for(let trigger=0;trigger<4;trigger++){
 const s=session(trigger),before=structuredClone(s.state.players);s.roll();assert.deepEqual(s.bankPhase.participants,[0,1,2,3]);assert.equal(s.bankApplicant.id,0);assert.equal(s.state.turn,trigger);
 s.state.players.forEach((p,i)=>{assert.equal(p.cash,before[i].cash);assert.deepEqual(p.liabilities,before[i].liabilities);});
 unchanged(s,()=>s.end());unchanged(s,()=>s.finish());unchanged(s,()=>s.skip());unchanged(s,()=>s.apply());unchanged(s,()=>s.borrow(100,1));unchanged(s,()=>s.chooseBankLoan(100,1,1,s.bankPhase.id));
 const id=s.bankPhase.id;s.chooseBankLoan(100000,1000);assert.equal(s.state.players[0].cash,before[0].cash+100000);assert.equal(s.state.players[0].monthlyCashflow,before[0].monthlyCashflow-1000);
 unchanged(s,()=>s.chooseBankLoan(100000,1000,0,id));assert.equal(s.bankApplicant.id,1);
 const restored=new E.play.Session(cards,B,()=>0,s.state);assert.equal(restored.bankApplicant.id,1);assert.equal(restored.state.players[0].liabilities.loans.length,1);
 restored.declineBankLoan();assert.equal(restored.bankApplicant.id,2);restored.chooseBankLoan(200000,2000);assert.equal(restored.state.phase,'resolving');restored.declineBankLoan();assert.equal(restored.state.phase,'done');assert.equal(restored.state.turn,trigger);
 assert.equal(restored.state.lastBank.decisions.length,4);assert.deepEqual(restored.state.lastBank.decisions.map(d=>d.choice),['apply','decline','apply','decline']);
 assert.equal(restored.state.events.filter(e=>e.code==='BANK_LOAN').length,2);assert.equal(restored.state.events.filter(e=>e.code==='BANK_DECLINED').length,2);assert.ok(restored.state.events.filter(e=>e.code.startsWith('BANK_')).every(e=>e.triggerPlayerId===trigger));
 unchanged(restored,()=>restored.chooseBankLoan(1,0,3,id));restored.end();assert.equal(restored.state.turn,(trigger+1)%4);
}
const limits=session();limits.state.players[0].maxLoan=500000;limits.state.players[0].liabilities.loans.push({id:'old',principal:200000,monthlyPayment:100});E.play.calculate(limits.active);limits.roll();assert.equal(limits.bankLoanLimit(),300000);
for(const [principal,interest] of [[300001,0],[0,0],[-1,0],[1,-1],[NaN,0],[1,undefined]])unchanged(limits,()=>limits.chooseBankLoan(principal,interest));
limits.chooseBankLoan(300000,100);assert.equal(limits.state.players[0].debtTotal,500000);limits.state.players[1].maxLoan=0;assert.equal(limits.bankLoanLimit(),0);unchanged(limits,()=>limits.chooseBankLoan(1,0));limits.declineBankLoan();
const inactive=session(3);inactive.state.players[1].eliminated=true;inactive.state.players[2].inGame=false;inactive.roll();assert.deepEqual(inactive.bankPhase.participants,[0,3]);inactive.declineBankLoan();inactive.declineBankLoan();assert.equal(inactive.state.phase,'done');
const passing=session();passing.active.position=bank-1;passing.rng=()=>1/6;passing.roll();assert.equal(passing.bankPhase,null);assert.equal(passing.state.events.some(e=>e.code==='BANK_OPEN'),false);
const old=session();old.state.phase='resolving';old.state.pending={kind:'bank',tileId:B.zone('taiwan')[bank].id};const restore=new E.play.Session(cards,B,()=>0,old.state);assert.deepEqual(restore.bankPhase.participants,[0,1,2,3]);
console.log('PASS: inner bank, all four trigger players, no automatic loans, per-player limits, explicit choices, complete-before-advance, inactive exclusion, pass-through, save/restore');
module.exports={session,bank};

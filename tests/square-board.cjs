'use strict';
const assert=require('node:assert/strict');
global.window=global;require('../data/game-data-bundle.js');const E=require('../data/game-engine.js'),B=require('../js/board.js'),cards=GAME_SOURCE_BUNDLE.sources.map(c=>E.derive(c));
const near=(a,b)=>Math.abs(a-b)<1e-7;
for(const zone of ['taiwan','world']){
 const cells=B.zone(zone),bounds=c=>({l:c.position.x-c.size.width/2,r:c.position.x+c.size.width/2,t:c.position.y-c.size.height/2,b:c.position.y+c.size.height/2});
 assert.equal(cells.filter(c=>c.type==='bank').length,1);assert.equal(cells.filter(c=>c.type==='childbirth').length,zone==='taiwan'?1:0);
 for(let i=0;i<cells.length;i++){
  const a=bounds(cells[i]),b=bounds(cells[(i+1)%cells.length]);assert.ok(a.l>=0&&a.r<=100&&a.t>=0&&a.b<=100);
  assert.ok((near(a.l,b.r)||near(a.r,b.l))&&Math.min(a.b,b.b)>Math.max(a.t,b.t)||(near(a.t,b.b)||near(a.b,b.t))&&Math.min(a.r,b.r)>Math.max(a.l,b.l),'Adjacent cells share an edge');
  for(let j=i+1;j<cells.length;j++){const b=bounds(cells[j]);assert.ok(Math.min(a.r,b.r)-Math.max(a.l,b.l)<1e-7||Math.min(a.b,b.b)-Math.max(a.t,b.t)<1e-7,'No overlapping cells');}
 }
 const bank=cells.findIndex(c=>c.type==='bank'),s=new E.play.Session(cards,B,()=>0);s.start('正方棋盤','characters-009');s.active.zone=zone;s.active.position=bank-1;s.roll();assert.equal(s.bankPhase.participants.length,4);while(s.bankPhase)s.declineBankLoan();assert.equal(s.state.phase,'done');
 const wrap=new E.play.Session(cards,B,()=>0);wrap.start('繞圈','characters-009');wrap.active.zone=zone;wrap.active.position=cells.length-1;const cash=wrap.active.cash,flow=wrap.active.monthlyCashflow;wrap.roll();assert.equal(wrap.active.position,0);assert.equal(wrap.active.cash,cash+flow);
}
assert.equal(B.zone('taiwan').length,18);assert.equal(B.zone('world').length,25);assert.equal(B.zone('taiwan')[16].type,'bank');assert.equal(B.zone('taiwan')[17].type,'childbirth');
console.log('PASS: square partition edges, no overlaps, bank in both rings, childbirth inner only, movement and wrap-around cashflow');
module.exports={E,B,cards};

'use strict';
const assert=require('node:assert/strict');
global.window=global;require('../data/game-data-bundle.js');
const E=require('../data/game-engine.js'),B=require('../js/board.js');
const cards=GAME_SOURCE_BUNDLE.sources.map(c=>E.derive(c));
// Fixture only: the production trigger is selected separately, without replacing a real card.
const birth={...structuredClone(cards.find(c=>c.cardId==='daily-life-009')),cardId:'test-childbirth',effective:{title:'生小孩',effect:'擲1顆骰子；1～3沒有生小孩；4～6增加1個小孩',fields:null}};
const fixtures=[...cards,birth];
function session(die,childCost){const s=new E.play.Session(fixtures,B,()=>0);s.start('生小孩測試','characters-009');s.rng=()=>(die-1)/6;s.active.children=2;s.active.childUnitExpense=childCost;E.play.calculate(s.active);s.state.phase='resolving';s.state.pending={kind:'card',cardId:birth.cardId,tileId:'taiwan-11'};return s;}
function unchanged(s,fn){const before=JSON.stringify(s.state);assert.throws(fn);assert.equal(JSON.stringify(s.state),before);}
for(const cost of [10000,0,null])for(let die=1;die<=6;die++){
 const s=session(die,cost),before=structuredClone(s.state.players);
 assert.equal(s.requiresEventDie(),true);assert.equal(s.preview().waitingDice,true);unchanged(s,()=>s.apply());unchanged(s,()=>s.skip());
 assert.equal(s.rollEventDie(),die);assert.deepEqual(s.state.players,before);unchanged(s,()=>s.rollEventDie());
 const restored=new E.play.Session(fixtures,B,()=>{throw Error('must not reroll');},s.state);
 assert.equal(restored.preview().amount,die>=4?1:0);restored.apply();assert.equal(restored.state.phase,'done');
 const player=restored.active;
 if(die<=3)assert.deepEqual(restored.state.players,before);
 else{assert.equal(player.children,3);assert.equal(player.childExpense,before[0].childExpense+(cost||0));assert.equal(player.totalExpense,before[0].totalExpense+(cost||0));assert.equal(player.monthlyCashflow,before[0].monthlyCashflow-(cost||0));assert.equal(player.cash,before[0].cash);assert.deepEqual(restored.state.players.slice(1),before.slice(1));}
 const result=restored.state.events.filter(e=>e.code==='CHILDBIRTH_RESULT');assert.equal(result.length,1);assert.match(JSON.stringify(result[0]),new RegExp('骰子 '+die+' 點'));assert.match(JSON.stringify(result[0]),die>=4?/增加 1 個小孩/:/沒有生小孩/);
 unchanged(restored,()=>restored.apply());const again=new E.play.Session(fixtures,B,()=>0,restored.state);assert.deepEqual(again.state.players,restored.state.players);assert.equal(again.state.events.filter(e=>e.code==='CHILDBIRTH_RESULT').length,1);
}
console.log('PASS: all six dice outcomes, existing/zero/missing child cost, unchanged no-birth players, one die only, restore, result log, no duplicate settlement');
const childTile=B.zone('taiwan').findIndex(t=>t.type==='childbirth');
assert.ok(childTile>=0);assert.equal(B.zone('taiwan').filter(t=>t.type==='childbirth').length,1);
for(let trigger=0;trigger<4;trigger++)for(const count of [0,1,2,3])for(let die=1;die<=6;die++){
 const s=new E.play.Session(cards,B,()=>0);s.start('棋盤生小孩測試','characters-009');s.state.turn=trigger;s.active.position=childTile-1;s.active.children=count;E.play.calculate(s.active);
 s.roll();assert.equal(s.state.pending.kind,'childbirth');assert.equal(s.active.position,childTile);assert.equal(s.preview().waitingDice,true);
 s.rng=()=>(die-1)/6;const before=structuredClone(s.state.players);s.rollEventDie();assert.deepEqual(s.state.players,before);
 const r=new E.play.Session(cards,B,()=>{throw Error('不可重擲');},s.state);r.apply();
 assert.deepEqual(r.state.players.filter(p=>p.id!==trigger),before.filter(p=>p.id!==trigger));
 if(count===3){assert.equal(r.active.children,3);assert.equal(r.active.cash,before[trigger].cash+die*10000);assert.equal(r.active.childExpense,before[trigger].childExpense);assert.equal(r.active.monthlyCashflow,before[trigger].monthlyCashflow);const e=r.state.events.filter(e=>e.code==='CHILD_SUBSIDY');assert.equal(e.length,1);assert.match(e[0].text,new RegExp(die*10000+' 元'));}
 else if(die<=3)assert.deepEqual(r.state.players,before);
 else{assert.equal(r.active.children,count+1);assert.equal(r.active.cash,before[trigger].cash);assert.equal(r.active.childExpense,before[trigger].childExpense+(r.active.childUnitExpense||0));assert.equal(r.state.events.filter(e=>e.code==='CHILD_SUBSIDY').length,0);}
 unchanged(r,()=>r.apply());r.validate();
}
console.log('PASS: board landing for all four players, 0–3 children, all dice results, cap of three, one-time 10000-per-pip subsidy, unchanged monthly expenses for subsidies');
module.exports={session,birth};

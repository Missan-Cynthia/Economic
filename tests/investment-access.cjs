'use strict';
const assert=require('node:assert/strict');
global.window=global;require('../data/game-data-bundle.js');
const E=require('../data/game-engine.js'),B=require('../js/board.js');
const cards=GAME_SOURCE_BUNDLE.sources.map(c=>E.play.upgradeCard(E.derive(c)));
function session(){const s=new E.play.Session(structuredClone(cards),B,()=>0);s.start('資產測試','characters-009');s.state.players.forEach(p=>p.cash=1000000);return s;}
function pending(s,id){s.state.phase='resolving';s.state.pending={kind:'card',cardId:id,tileId:'taiwan-11'};}
function unchanged(s,action){const before=JSON.stringify(s.state);assert.throws(action);assert.equal(JSON.stringify(s.state),before);}
for(const card of cards){
 const s=session();pending(s,card.cardId);const funding=s.investmentFunding();if(!funding)continue;
 s.active.cash=funding.cost-1;assert.equal(s.investmentFunding().canAfford,false);
 unchanged(s,()=>s.apply());unchanged(s,()=>s.manual({cash:funding.cost}));unchanged(s,()=>s.rollEventDie());unchanged(s,()=>s.borrow(funding.cost,0));
 if(s.preview()?.kind==='purchase'){
  unchanged(s,()=>s.buy(card,{cost:0}));s.active.cash=funding.cost;s.apply();assert.equal(s.active.cash,0);
  assert.ok(s.active.debtTotal===0||s.active.assets.properties.length>0);
 }
}
const mc=session();pending(mc,'franchise-011');mc.active.cash=819000;assert.deepEqual(mc.investmentFunding(),{cost:6000000,cash:819000,shortfall:5181000,canAfford:false});unchanged(mc,()=>mc.apply());mc.skip();assert.equal(mc.active.cash,819000);assert.equal(mc.active.assets.businesses.length,0);assert.equal(mc.active.debtTotal,0);
for(const [id,name,kind] of [['stock-news-001','水泥','stocks'],['futures-market-001','黃金','futures'],['bond-fund-002','政府公債','bondsFunds'],['bond-fund-002','東歐基金','bondsFunds']]){
 for(const ids of [undefined,[],[2],'unconfigured']){
  const s=session();s.state.marketPolicy={eligibleTraders:{[kind]:ids}};s.state.turn=2;pending(s,id);s.beginMarket();assert.deepEqual(s.marketPhase.eligibleTraders,[0,1,2,3]);
  for(let n=0;n<4;n++){assert.equal(s.trader.id,n);s.buyMarket(name,1);s.sellMarket(name,1);s.completeMarket();}
 }
 for(const ids of [undefined,[],[2]]){
  const s=session();pending(s,id);s.beginMarket();s.marketPhase.eligibleTraders=ids;s.marketPhase.permissionStatus='unconfigured';s.marketPhase.status='awaiting-ack';
  const r=new E.play.Session(cards,B,()=>0,s.state);assert.deepEqual(r.marketPhase.eligibleTraders,[0,1,2,3]);assert.equal(r.trader.id,0);
 }
}
// Explicit card restrictions outrank ordinary market defaults, including save migration.
for(const ids of [[],[1,3]]){
 const s=session();s.byId.get('bond-fund-002').eligibleTraders=ids;pending(s,'bond-fund-002');s.beginMarket();assert.deepEqual(s.marketPhase.eligibleTraders,ids);
 const saved=structuredClone(s.state);Object.assign(saved.pending.market,{version:1,eligibleTraders:[],permissionStatus:'unconfigured',status:'awaiting-ack'});
 const restored=new E.play.Session(s.cards,B,()=>0,saved);assert.deepEqual(restored.marketPhase.eligibleTraders,ids);
}
// Generic market opportunities use the same access rule without inventing asset fees.
const futures=session();futures.state.players[0].isStudent=true;futures.state.players[1].isEmployed=false;futures.state.players[2].salaryIncome=0;pending(futures,'futures-market-001');futures.beginMarket();assert.deepEqual(futures.marketPhase.eligibleTraders,[0,1,2,3]);
for(let i=0;i<3;i++){assert.equal(futures.trader.id,i);assert.equal(futures.tradeQuote('黃金',1).allowed,false);unchanged(futures,()=>futures.buyMarket('黃金',1));futures.completeMarket();}
assert.equal(futures.trader.id,3);assert.equal(futures.tradeQuote('黃金',1).allowed,true);
const generic=session(),card=generic.byId.get('bond-fund-002');card.category='市場報價';card.marketQuotes={測試基金:100};card.marketAssetTypes={測試基金:'funds'};pending(generic,card.cardId);generic.state.marketPolicy={eligibleTraders:{bondsFunds:[]}};generic.beginMarket();assert.deepEqual(generic.marketPhase.eligibleTraders,[0,1,2,3]);generic.buyMarket('測試基金',1);
console.log('PASS: all investment funding gates, McDonald example, default market participation, legacy saves, explicit card restrictions, generic assets');
module.exports={session,pending};

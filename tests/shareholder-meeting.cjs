'use strict';
const assert=require('node:assert/strict');
global.window=global;require('../data/game-data-bundle.js');const E=require('../data/game-engine.js'),B=require('../js/board.js');
const cards=GAME_SOURCE_BUNDLE.sources.map(c=>E.play.upgradeCard(E.derive(c)));
function session(){const s=new E.play.Session(structuredClone(cards),B,()=>0);s.start('股東測試','characters-009');return s;}
function open(s){s.state.phase='resolving';s.state.pending={kind:'card',cardId:'stock-dividends-001',tileId:'taiwan-9'};s.beginMarket();}
function unchanged(s,fn){const before=JSON.stringify(s.state);assert.throws(fn);assert.equal(JSON.stringify(s.state),before);}
for(const quotes of [undefined,{水泥:22}]){
 const s=session();s.state.marketState={stocks:quotes};s.active.assets.funds.push({id:'fund',cardId:'bond-fund-002',name:'國內基金',assetType:'fund',units:15,cost:70000,value:70000,income:0,operatingExpense:0});E.play.calculate(s.active);
 const before=structuredClone(s.state.players);open(s);assert.deepEqual(s.marketItems(),[]);assert.deepEqual(s.marketPhase.eligibleTraders,[]);assert.equal(s.trader,null);assert.deepEqual(s.state.players,before);
 assert.equal(s.marketPhase.effectResults.filter(r=>r.type==='SHAREHOLDER_MEETING_SKIPPED').length,4);
 unchanged(s,()=>s.buyMarket('水泥',1));unchanged(s,()=>s.sellMarket('水泥',1));s.acknowledgeMarket();assert.equal(s.state.phase,'done');assert.deepEqual(s.state.players,before);
}
const s=session(),c=s.byId.get('stock-dividends-001');c.effective.effect='股利每股領取';c.effective.fields={水泥:0.4};
for(const [id,units] of [[0,1000],[2,2000]])s.state.players[id].assets.stocks.push({id:'stock-'+id,cardId:'stock-investment-001',name:'水泥',industry:'水泥',unitType:'share',assetType:'stock',units,cost:units*22,value:units*22,income:0,operatingExpense:0});
const cash=s.state.players.map(p=>p.cash);open(s);assert.deepEqual(s.state.players.map(p=>p.cash),cash.map((v,i)=>v+(i===0?400:i===2?800:0)));assert.deepEqual(s.marketItems(),[]);
const paid=structuredClone(s.state.players);s.beginMarket();assert.deepEqual(s.state.players,paid);
for(const version of [undefined,1,2])for(const permissionStatus of ['configured','unconfigured']){
 const saved=structuredClone(s.state);Object.assign(saved.pending.market,{version,permissionStatus,status:'trading',eligibleTraders:[0,1,2,3],participantIndex:1,completedParticipants:[0],items:[{name:'水泥',asset:'stocks',currentMarketPrice:22,quoteCardId:'stock-news-001'}]});
 const r=new E.play.Session(s.cards,B,()=>0,saved);assert.deepEqual(r.state.players,paid);assert.deepEqual(r.marketItems(),[]);assert.equal(r.trader,null);unchanged(r,()=>r.buyMarket('水泥',1));r.beginMarket();assert.deepEqual(r.state.players,paid);r.acknowledgeMarket();assert.deepEqual(r.state.players,paid);
}
console.log('PASS: no meeting trades or reused quotes, funds excluded, nonholders skipped, explicit payouts only to stock holders, legacy restore without duplicate payouts');
module.exports={session,open};

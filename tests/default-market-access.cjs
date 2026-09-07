const assert=require('node:assert/strict');
global.window=global;require('../data/game-data-bundle.js');
const E=require('../data/game-engine.js'),B=require('../js/board.js');
const cards=GAME_SOURCE_BUNDLE.sources.map(c=>E.play.upgradeCard(E.derive(c)));
function open(id){const s=new E.play.Session(structuredClone(cards),B,()=>0);s.start('真人','characters-007');s.state.players.forEach(p=>{p.cash=1000000;p.salaryIncome=150000;});s.state.phase='resolving';s.state.pending={kind:'card',cardId:id,tileId:'taiwan-1'};s.beginMarket();return s;}
for(const id of ['stock-news-001','futures-market-001','bond-fund-002']){
 const s=open(id);assert.deepEqual(s.marketPhase.eligibleTraders,[0,1,2,3]);
 const item=s.marketItems().find(i=>!i.blockedBuy);
 for(let i=0;i<4;i++){assert.equal(s.trader.id,i);s.buyMarket(item.name,1);s.completeMarket();}
 assert.equal(s.state.phase,'done');
}
const s=open('stock-news-001'),cash=s.state.players.map(p=>p.cash);
Object.assign(s.marketPhase,{eligibleTraders:[],status:'awaiting-ack',permissionStatus:'unconfigured'});
const restored=new E.play.Session(structuredClone(cards),B,()=>0,structuredClone(s.state));
assert.deepEqual(restored.marketPhase.eligibleTraders,[0,1,2,3]);assert.equal(restored.trader.id,0);
assert.deepEqual(restored.state.players.map(p=>p.cash),cash);
restored.buyMarket('水泥',1);restored.completeMarket();
const resumed=new E.play.Session(structuredClone(cards),B,()=>0,structuredClone(restored.state));
assert.equal(resumed.trader.id,1);
console.log('PASS: default stock/futures/bond access, four-player purchases, blocked-save recovery, mid-round resume');

function restore(s){return new E.play.Session(structuredClone(cards),B,()=>0,structuredClone(s.state));}
function unchanged(s,action){const before=JSON.stringify(s.state);assert.throws(action);assert.equal(JSON.stringify(s.state),before);}
// A/B: no per-player setup; even a stale policy must not restrict ordinary stock cards.
for(const policy of [undefined,[],[2],'unconfigured']){
 const s=open('stock-news-001');s.completeMarket();while(s.marketPhase)s.completeMarket();
 s.state.marketPolicy={eligibleTraders:{stocks:policy}};
 s.state.turn=2;s.state.phase='resolving';s.state.pending={kind:'card',cardId:'stock-news-001',tileId:'taiwan-1'};s.beginMarket();
 assert.deepEqual(s.marketPhase.eligibleTraders,[0,1,2,3]);
 assert.equal(s.marketPhase.globalMarketEffect.length,0);
 for(let id=0;id<4;id++){assert.equal(s.trader.id,id);s.buyMarket('水泥',1);s.sellMarket('水泥',1);s.completeMarket();}
}
// B/C: missing, empty, unconfigured and pre-v2 saves resume without repeating effects.
for(const version of [undefined,2])for(const eligible of [undefined,[],[2]])for(const permission of [undefined,'configured','unconfigured']){
 const s=open('stock-news-001'),beforePlayers=structuredClone(s.state.players);
 Object.assign(s.marketPhase,{version,eligibleTraders:eligible,permissionStatus:permission,status:'awaiting-ack'});
 const r=restore(s);assert.deepEqual(r.marketPhase.eligibleTraders,[0,1,2,3]);assert.equal(r.trader.id,0);
 assert.deepEqual(r.state.players,beforePlayers);r.buyMarket('水泥',1);
}
const inactive=open('stock-news-001');inactive.state.players[2].eliminated=true;inactive.marketPhase.eligibleTraders=[];
assert.deepEqual(restore(inactive).marketPhase.eligibleTraders,[0,1,3]);
const partial=open('stock-news-001');partial.buyMarket('水泥',1);partial.completeMarket();partial.marketPhase.eligibleTraders=[];
const partialRestored=restore(partial);assert.equal(partialRestored.trader.id,1);assert.deepEqual(partialRestored.marketPhase.completedParticipants,[0]);
assert.equal(partialRestored.state.players[0].assets.stocks[0].units,1000);
// D/E: special restrictions and forced sales survive restore and never run twice.
for(const id of ['stock-news-002','stock-news-012','stock-news-015']){
 const s=open(id),name=id==='stock-news-002'?'生化':'電子';
 assert.equal(s.tradeQuote(name,1,'buy').allowed,false);
 const r=restore(s);assert.equal(r.tradeQuote(name,1,'buy').allowed,false);
 Object.assign(s.marketPhase,{eligibleTraders:[],status:'awaiting-ack',permissionStatus:'configured'});
 const restricted=restore(s);assert.deepEqual(restricted.marketPhase.eligibleTraders,[]);assert.equal(restricted.trader,null);
 Object.assign(s.marketPhase,{permissionStatus:'unconfigured'});
 const fallback=restore(s);assert.equal(fallback.tradeQuote(name,1,'buy').allowed,false);
 if(id!=='stock-news-015')assert.equal(fallback.tradeQuote(name,1,'sell').allowed,false);
}
const forced=open('stock-news-001');
for(let i=0;i<4;i++){forced.buyMarket('電子',1);forced.completeMarket();}
const beforeForced=forced.state.players.map(p=>p.cash);
forced.state.phase='resolving';forced.state.pending={kind:'card',cardId:'stock-news-012',tileId:'taiwan-1'};forced.beginMarket();
assert.equal(forced.marketPhase.effectResults.filter(e=>e.type==='FORCED_SALE').length,4);
forced.state.players.forEach((p,i)=>{assert.equal(p.assets.stocks.length,0);assert.equal(p.cash,beforeForced[i]-1000);});
const forcedSaved=structuredClone(forced.state);const forcedRestored=restore(forced);forcedRestored.beginMarket();assert.deepEqual(forcedRestored.state,forcedSaved);
// F/G: operations accept whole lots only, using the drawn card price and existing per-lot fee.
for(const lots of [1,2,3]){
 const s=open('stock-news-001'),cash=s.trader.cash,price=s.marketItems().find(i=>i.name==='水泥').currentMarketPrice;
 for(const invalid of [0.5,0.001,0,-1,1.5,NaN,Infinity]){
  unchanged(s,()=>s.buyMarket('水泥',invalid));unchanged(s,()=>s.sellMarket('水泥',invalid));
 }
 unchanged(s,()=>s.buyMarket('水泥',lots,1));unchanged(s,()=>s.sellMarket('水泥',lots,1));
 const q=s.buyMarket('水泥',lots);assert.equal(q.fee,1000*lots);assert.equal(q.amount,price*1000*lots+q.fee);
 assert.equal(s.trader.cash,cash-q.amount);assert.equal(s.trader.assets.stocks[0].units,1000*lots);
 const sold=s.sellMarket('水泥',lots);assert.equal(sold.amount,price*1000*lots-sold.fee);assert.equal(s.trader.cash,cash-2000*lots);
}
console.log('PASS A–G: ordinary stock access, missing/empty/legacy restore, special restrictions, forced sales, whole lots, fixed card prices and fees');

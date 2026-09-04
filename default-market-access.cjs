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

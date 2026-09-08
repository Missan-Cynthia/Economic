'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
global.window=global;require('../data/game-data-bundle.js');
const E=require('../data/game-engine.js'),B=require('../js/board.js'),AI=require('../js/ai.js');
const cards=GAME_SOURCE_BUNDLE.sources.map(c=>E.play.upgradeCard(E.derive(c)));
// Ordinary stocks use default access; other markets retain their existing fixtures.
function session(){const s=new E.play.Session(JSON.parse(JSON.stringify(cards)),B,()=>0);s.start('真人','characters-009');s.state.players.forEach(p=>{p.cash=1000000;p.monthlySalary=38000;});for(const kind of ['futures','bondsFunds','meeting','risk'])s.setEligibleTraders(kind,[0,1,2,3]);return s;}
function pending(s,id,trigger=0){s.state.turn=trigger;s.state.phase='resolving';s.state.pending={kind:'card',cardId:id,tileId:'taiwan-11'};}
function open(s,id,trigger=0){pending(s,id,trigger);s.beginMarket();return s;}
function holding(id,name,kind,units,extra={}){return {id,cardId:kind==='stocks'?'stock-investment-003':'futures-market-001',name,assetName:name,units,cost:units*50,value:units*50,income:0,operatingExpense:0,unitType:kind==='stocks'?'share':'quoted-unit',...extra};}
function unchanged(s,fn){const before=JSON.stringify(s.state);assert.throws(fn);assert.equal(JSON.stringify(s.state),before);}
const result={};
for(const [label,id,trigger,item,kind,price] of [['A','stock-news-001',1,'水泥','stocks',29],['B','futures-market-001',2,'黃豆','futures',23000],['C','bond-fund-002',0,'政府公債','bonds',25000]]){
 const s=open(session(),id,trigger);assert.equal(s.active.id,trigger);assert.deepEqual(s.marketPhase.marketParticipants,[0,1,2,3]);assert.equal(s.trader.id,0);
 assert.equal(s.marketItems().find(i=>i.name===item).currentMarketPrice,price);
 unchanged(s,()=>s.finish());unchanged(s,()=>s.end());unchanged(s,()=>s.executeMarket(item,1,'buy',3,s.marketPhase.id));
 const snapshots=[];
 for(let n=0;n<4;n++){
  assert.equal(s.trader.id,n);const cash=s.trader.cash,others=s.state.players.filter(p=>p.id!==n).map(p=>JSON.stringify(p));
  const unitCost=kind==='futures'?3000:kind==='stocks'?price*1000+1000:price,sellCash=kind==='futures'?0:kind==='stocks'?price*1000-1000:price;
  s.buyMarket(item,2);assert.equal(s.trader.cash,cash-unitCost*2);assert.deepEqual(s.state.players.filter(p=>p.id!==n).map(p=>JSON.stringify(p)),others);
  s.sellMarket(item,1);assert.equal(s.trader.cash,cash-unitCost*2+sellCash);assert.equal(s.trader.assets[kind][0].units,kind==='stocks'?1000:1);
  const oldId=s.trader.id,marketId=s.marketPhase.id;s.completeMarket(oldId,marketId);
  if(n<3){assert.equal(s.state.phase,'resolving');unchanged(s,()=>s.completeMarket(oldId,marketId));}
  snapshots.push({playerId:n,cash:cash-unitCost*2+sellCash,bought:2,sold:1});
 }
 assert.equal(s.state.phase,'done');assert.equal(s.state.turn,trigger);assert.equal(s.state.lastMarket.completedParticipants.length,4);s.end();assert.equal(s.state.turn,(trigger+1)%4);
 result[label]={status:'PASS',card:id,triggerPlayerId:trigger,price,players:snapshots};
}
const personal=session();pending(personal,'daily-life-009',1);assert.equal(personal.isMarketCard(),false);const oldCash=personal.state.players.map(p=>p.cash);personal.apply();assert.deepEqual(personal.state.players.map(p=>p.cash),oldCash.map((x,i)=>i===1?x-1000:x));assert.equal(personal.marketPhase,null);result.D={status:'PASS',onlyPlayerId:1,expense:1000};
const disabled=open(session(),'stock-news-001',2);disabled.trader.cash=10;unchanged(disabled,()=>disabled.buyMarket('水泥',1));unchanged(disabled,()=>disabled.sellMarket('水泥',1));unchanged(disabled,()=>disabled.buyMarket('水泥',1,0.01));unchanged(disabled,()=>disabled.borrow(100,1));unchanged(disabled,()=>disabled.manual({cash:100}));
const excluded=session();excluded.state.players[2].eliminated=true;open(excluded,'bond-fund-002',3);assert.deepEqual(excluded.marketPhase.marketParticipants,[0,1,3]);for(let i=0;i<3;i++)excluded.completeMarket();assert.equal(excluded.state.phase,'done');
// Freeze a shared quote and restore at a non-trigger participant without reapplying effects.
const saved=open(session(),'stock-news-001',2);saved.buyMarket('水泥',3);saved.completeMarket();const restored=new E.play.Session(copyCards(),B,()=>0,saved.state);assert.equal(restored.trader.id,1);const exact=JSON.stringify(restored.state);restored.beginMarket();assert.equal(JSON.stringify(restored.state),exact);restored.byId.get('stock-news-001').effective.fields.水泥=999;assert.equal(restored.tradeQuote('水泥',1).unitPrice,29);
const forced=session();forced.state.players.forEach((p,i)=>{p.assets.stocks.push(holding('electronic-'+i,'電子','stocks',1000,{industry:'電子'}),holding('food-'+i,'食品','stocks',1000,{industry:'食品'}));E.play.calculate(p);});
open(forced,'stock-news-012',1);for(const p of forced.state.players){assert.equal(p.assets.stocks.some(a=>a.name==='電子'),false);assert.equal(p.assets.stocks.some(a=>a.name==='食品'),true);const price=forced.marketItems().find(i=>i.name==='電子').currentMarketPrice;assert.equal(p.cash,1000000+1000*price-1000);}
assert.equal(forced.tradeQuote('電子',1).allowed,false);const forcedBefore=JSON.stringify(forced.state);forced.beginMarket();assert.equal(JSON.stringify(forced.state),forcedBefore);
while(forced.marketPhase)forced.completeMarket();open(forced,'stock-news-001',0);assert.equal(forced.tradeQuote('電子',1).allowed,true);
const jobs=session();jobs.state.players.forEach((p,i)=>{p.characterId='characters-001';p.employment={industry:i<2?'紡織':'食品',isHighestRank:false};});const salaries=jobs.state.players.map(p=>p.salaryIncome);open(jobs,'stock-news-017',2);assert.deepEqual(jobs.state.players.map(p=>p.salaryIncome),[0,0,salaries[2],salaries[3]]);
const highest=session();highest.state.players.forEach((p,i)=>{p.characterId='characters-004';p.employment={industry:'金融',isHighestRank:i===0};});open(highest,'stock-news-029',1);assert.ok(highest.state.players[0].salaryIncome>0);assert.ok(highest.state.players.slice(1).every(p=>p.salaryIncome===0));
const futures=session();futures.state.players.forEach((p,i)=>p.assets.futures.push(holding('nikkei-'+i,'日經225指數','futures',2,{quantity:2,entryPrice:30000,margin:6000,unitType:'contract'})));open(futures,'futures-market-003',2);assert.ok(futures.state.players.every(p=>!p.assets.futures.length));assert.equal(futures.tradeQuote('日經225指數',1).allowed,false);assert.equal(futures.tradeQuote('黃豆',1).allowed,true);
const mixed=open(session(),'bond-fund-002',3);for(let i=0;i<4;i++){assert.equal(mixed.tradeQuote('新興市場',1).allowed,false);assert.equal(mixed.tradeQuote('海外高收益',1).allowed,false);const q=mixed.tradeQuote('東歐基金',1);assert.equal(q.fee,3000);mixed.buyMarket('東歐基金',1);mixed.completeMarket();}
const meetings=session();meetings.state.marketPrices={stocks:E.play.market.pricedItems(cards.find(c=>c.cardId==='stock-news-001'))};open(meetings,'stock-dividends-001',1);assert.deepEqual(meetings.marketItems(),[]);unchanged(meetings,()=>meetings.buyMarket('水泥',1));meetings.acknowledgeMarket();
const noQuote=open(session(),'stock-dividends-001',2);assert.equal(noQuote.marketItems().length,0);assert.equal(noQuote.marketPhase.marketParticipants.length,4);noQuote.acknowledgeMarket();
// Explicit dividend rules still apply to all holders before anyone can buy, exactly once.
const explicitCards=copyCards();const meeting=explicitCards.find(c=>c.cardId==='stock-dividends-001');meeting.effective.effect='股利每股領取';meeting.effective.fields={電子:2};const dividend=new E.play.Session(explicitCards,B,()=>0);dividend.start('真人','characters-009');dividend.state.players.forEach((p,i)=>p.assets.stocks.push(holding('div-'+i,'電子','stocks',100,{industry:'電子'})));const cashBefore=dividend.state.players.map(p=>p.cash);open(dividend,'stock-dividends-001',3);assert.deepEqual(dividend.state.players.map(p=>p.cash),cashBefore.map(v=>v+200));dividend.beginMarket();assert.deepEqual(dividend.state.players.map(p=>p.cash),cashBefore.map(v=>v+200));
function copyCards(){return JSON.parse(JSON.stringify(cards));}
for(const card of cards.filter(c=>c.category==='詭譎市場')){const s=open(session(),card.cardId,1);assert.ok(s.marketItems().length);assert.equal(s.marketPhase.marketParticipants.length,4);assert.equal(s.marketPhase.effectResults.filter(r=>r.type==='FORCED_PURCHASE').every(r=>r.playerId===1),true);s.validate();}
const ai=[];
for(const [id,trigger] of [['stock-news-001',1],['futures-market-001',2],['bond-fund-002',0]]){
 const s=open(session(),id,trigger),trace=[];
 while(s.marketPhase){const p=s.trader,actions=p.personality==='human'?[{name:s.marketItems().find(i=>!i.blockedBuy&&i.currentMarketPrice>0).name,units:1,side:'buy'}]:AI.decideMarket(s);for(const a of actions)s.executeMarket(a.name,a.units,a.side,p.id,s.marketPhase.id);trace.push({playerId:p.id,personality:p.personality,actions});s.completeMarket();}
 assert.equal(trace.length,4);assert.equal(trace.filter(p=>p.personality!=='human').length,3);assert.ok(trace.some(p=>p.personality!=='human'&&p.actions.some(a=>a.side==='buy')));ai.push({card:id,trigger,trace});
}
const seller=open(session(),'stock-news-001',0);seller.completeMarket();seller.trader.cash=0;seller.trader.assets.stocks.push(holding('sell-ai','水泥','stocks',1000));const aiSell=AI.decideMarket(seller);assert.ok(aiSell.some(a=>a.side==='sell'&&a.units>0));for(const a of aiSell)seller.executeMarket(a.name,a.units,a.side);
const classifications=cards.map(c=>({cardId:c.cardId,category:c.category,eventType:c.eventType,effectScope:c.effectScope}));const byCategory=classifications.filter(c=>c.eventType==='MARKET_EVENT').reduce((r,c)=>(r[c.category]=(r[c.category]||0)+1,r),{});
for(const [index,c] of cards.filter(c=>c.eventType==='MARKET_EVENT').entries()){
 const s=open(session(),c.cardId,index%4);s.validate();assert.deepEqual(s.marketPhase.marketParticipants,[0,1,2,3]);while(s.marketPhase){if(s.trader)s.completeMarket();else s.acknowledgeMarket();}s.validate();assert.equal(s.state.lastMarket.completedParticipants.length,c.category==='股東大會'?0:4);
}
const explicitOccupation=session();explicitOccupation.state.players[0].characterId='characters-001';explicitOccupation.state.players[0].occupation='紡織公司保全';explicitOccupation.state.players[0].employment={industry:'紡織業'};open(explicitOccupation,'stock-news-017',2);assert.equal(explicitOccupation.state.players[0].salaryIncome,0);
const shortcut=open(session(),'stock-news-001',3);shortcut.apply();assert.equal(shortcut.state.phase,'resolving');assert.equal(shortcut.trader.id,1);shortcut.skip();assert.equal(shortcut.state.phase,'resolving');assert.equal(shortcut.trader.id,2);
assert.equal(classifications.filter(c=>c.eventType==='MARKET_EVENT').length,96);assert.equal(classifications.filter(c=>c.eventType==='PLAYER_EVENT').length,296);
const report={passed:true,permissionFixture:'Default stock access; explicit fixtures for other markets',acceptance:result,marketCategories:byCategory,playerEventCount:296,marketEventCount:96,ai,additional:['價格固定／無跨玩家改帳','交易完成前禁止結束原回合','停用玩家排除','逐人完成和存檔恢復','全體股票強制賣出及禁買','合資格員工失業及最高階豁免','全體期貨平倉','未知債券基金分類禁止猜測費用','股東大會僅依持股結算，不開放交易','23 張詭譎市場全域行情、強制效果僅觸發者','AI 買進／賣出／不交易策略'],classifications};
fs.writeFileSync(path.join(__dirname,'market-all-players-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,classifications:classifications.length},null,2));
module.exports={session,pending,open,cards,E,B,report};

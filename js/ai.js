(function(root){
 const profiles={conservative:{label:'保守型',reserve:6,debtLimit:1,risk:0.12},balanced:{label:'平衡型',reserve:3,debtLimit:3,risk:0.45},aggressive:{label:'積極型',reserve:0.5,debtLimit:7,risk:0.8}};
 function decide(player,offer,rng=Math.random){
  if(!offer)return {action:'skip',reason:'MANUAL_RULE_SKIPPED'};
  if(offer.kind!=='purchase')return {action:'apply'};
  const p=profiles[player.personality]||profiles.balanced;
  const reserve=player.totalExpense*p.reserve;
  const debt=Object.values(player.liabilities).flat().reduce((n,l)=>n+l.principal,0);
  const projected=player.monthlyCashflow+offer.income-offer.expense;
  const affordable=player.cash-offer.cost>=reserve;
  const acceptableDebt=debt+offer.loan<=Math.max(player.salaryIncome*12*p.debtLimit,player.cash);
  const desirable=offer.income>offer.expense||rng()<p.risk;
  return {action:affordable&&acceptableDebt&&projected>0&&desirable?'buy':'skip'};
 }
 function decideMarket(session){
  const player=session.trader;if(!player||player.personality==='human')return [];
  const profile=profiles[player.personality]||profiles.balanced,items=session.marketItems(),actions=[];
  const reserve=player.totalExpense*profile.reserve;
  for(const item of items){
   const holdings=session.marketHoldings(item.name,item.asset),holdingId=item.asset==='futures'?holdings.find(a=>Number.isFinite(a.entryPrice)&&Number.isFinite(a.margin))?.id:null;
   const quote=session.tradeQuote(item.name,1,'sell',player.id,session.marketPhase.id,holdingId);
   if(!quote.maxQuantity||item.blockedSell)continue;
   const quantity=holdings.reduce((s,a)=>s+(a.quotedUnits||0),0),cost=holdings.reduce((s,a)=>s+a.cost,0),average=item.asset==='futures'?holdings.find(a=>a.id===holdingId)?.entryPrice:quantity?cost/quantity:0;
   if(player.cash<reserve||item.currentMarketPrice>average*1.2||(profile.risk<0.5&&item.currentMarketPrice<average*0.8)){
    actions.push({side:'sell',name:item.name,holdingId,units:Math.max(1,Math.floor(quote.maxQuantity/2))});break;
   }
  }
  const budget=Math.max(0,player.cash-reserve)*({conservative:0.1,balanced:0.2,aggressive:0.35}[player.personality]||0.1);
  const eligible=items.filter(i=>{const q=session.tradeQuote(i.name,1,'buy');return q.allowed&&q.cost<=budget&&!(i.asset==='futures'&&player.personality==='conservative')&&!actions.some(a=>a.name===i.name);});
  eligible.sort((a,b)=>session.marketHoldings(a.name,a.asset).length-session.marketHoldings(b.name,b.asset).length||a.currentMarketPrice-b.currentMarketPrice||a.name.localeCompare(b.name));
  if(eligible.length){const item=eligible[0],quote=session.tradeQuote(item.name,1,'buy'),units=Math.min(quote.maxQuantity,Math.floor(budget/quote.cost));if(units>0)actions.push({side:'buy',name:item.name,units});}
  return actions;
 }
 const api={profiles,decide,decideMarket};if(typeof module==='object')module.exports=api;else root.ComputerPlayers=api;
})(globalThis);

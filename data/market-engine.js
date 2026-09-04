(function(root,install){
 if(typeof module==='object'&&module.exports)module.exports=install;
 else install(root.GameData);
})(globalThis,function(G){
 'use strict';
 const P=G.play.Session.prototype,copy=x=>JSON.parse(JSON.stringify(x));
 const sum=a=>a.reduce((x,y)=>x+y,0),finite=n=>{if(!Number.isFinite(n)||Math.abs(n)>1e14)throw Error('交易金額超出有效範圍');return n;};
 const live=p=>p.inGame!==false&&!p.eliminated&&!['eliminated','out','withdrawn'].includes(p.status);
 const fields=c=>c?.effective?.fields||c?.fields||{},text=c=>(c?.effective?.title||'')+'；'+(c?.effective?.effect||'');
 const securityKinds=['bonds','funds','securities'];
 function stockIndustry(a,byId){return a.industry||a.sector||byId.get(a.cardId)?.effective?.fields?.industry||byId.get(a.cardId)?.effective?.fields?.sector||null;}
 function positionUnits(a,kind,byId){
  if(kind==='futures')return Number.isSafeInteger(a.quantity)&&a.quantity>=0?a.quantity:Number.isSafeInteger(a.units)?a.units:null;
  if(!Number.isFinite(a.units)||a.units<0)return null;
  if(kind!=='stocks')return a.units;
  if(a.unitType==='lot')return a.units*1000;
  if(a.unitType==='share'||(!a.manualTrade&&byId.get(a.cardId)?.category==='股票投資'))return a.units;
  return null;
 }
 function matches(a,item,kind,byId){
  if(kind!==item.asset&&!(securityKinds.includes(kind)&&securityKinds.includes(item.asset)))return false;
  return (a.marketKey||a.assetName||a.name)===item.name||(kind==='stocks'&&stockIndustry(a,byId)===item.name);
 }
 function positions(p,item,byId){
  return Object.entries(p.assets).flatMap(([kind,assets])=>assets.filter(a=>(a.quantity??a.units)>0&&matches(a,item,kind,byId)).map(a=>({a,kind,units:positionUnits(a,kind,byId)})));
 }
 function pricedItems(c,quotes=fields(c),assetHint=null){
  const stock=['股市行情','股票行情','新聞報導股票行情'].includes(c.category),futures=c.category==='期貨行情';
  return Object.entries(quotes||{}).filter(([,v])=>typeof v==='number'&&Number.isFinite(v)&&v>=0).map(([name,price])=>{
   const explicit=c.marketAssetTypes?.[name]||assetHint;
   const asset=explicit|| (stock?'stocks':futures?'futures':name.includes('基金')?'funds':/債/.test(name)?'bonds':'securities');
   if(!['stocks','futures',...securityKinds].includes(asset))throw Error('行情商品類型無效');
   const locked=['limit-up','limit-down','漲停','跌停'].includes(c.marketStatus?.[name]);
   return {name,currentMarketPrice:price,asset,assetType:({stocks:'stock',futures:'future',bonds:'bond',funds:'fund',securities:'bond-fund'})[asset],unitType:asset==='stocks'?'share':asset==='futures'?'contract':'unit',quoteCardId:c.cardId,blockedBuy:price===0||locked,blockedSell:locked};
  });
 }
 // Parse effects separately from prices. Scope applies across the participant snapshot.
 function compileEffects(c,items){
  const t=text(c),globalMarketEffect=[],playerSpecificEffect=[],issues=[];
  const forced=new Set();
  for(const item of items){
   if(item.asset==='stocks'){
    const below=t.match(/(\d+(?:\.\d+)?)元以下股票市價賣出/);
    if(t.includes(item.name+'股市價賣出')||(below&&item.currentMarketPrice<=Number(below[1])))forced.add(item.name);
    if(t.includes(item.name+'股當回合不能交易')||t.includes('當回合'+item.name+'股不能交易')||(below&&item.currentMarketPrice<=Number(below[1])&&t.includes('停止交易')))item.blockedBuy=item.blockedSell=true;
    if(t.includes('當回合'+item.name+'不得買進')||t.includes('當回合'+item.name+'股不得買進'))item.blockedBuy=true;
   }
   if(item.asset==='futures'&&t.includes('平倉')){
    const index=/指數|台指|電子期貨|金融期貨/.test(item.name);
    if(t.includes(item.name)||(t.includes('所有指數期貨')&&index)){
     forced.add(item.name);if(/不能交易|停止交易/.test(t))item.blockedBuy=item.blockedSell=true;
    }
   }
  }
  for(const name of forced)globalMarketEffect.push({type:'FORCED_SALE',name,effectScope:'ALL_PLAYERS'});
  if(/失業/.test(t)){
   const employee=t.match(/所有([^，；。]+?)公司員工失業/),company=t.match(/([^，；。]+?)公司(?:裁員|被借殼上市)/);
   const industry=employee?.[1]||company?.[1];
   if(industry&&items.some(i=>i.name===industry))playerSpecificEffect.push({type:'UNEMPLOYMENT',industry,highestRankExempt:t.includes('最高階例外'),effectScope:'QUALIFIED_PLAYERS'});
   else issues.push('失業條件的產業文字不明確，未猜測套用對象。');
  }
  if(t.includes('配股'))issues.push('員工配股的基數／持股對應未定義，未自行推算配股。');
  return {globalMarketEffect,playerSpecificEffect,issues};
 }
 const salary=p=>Number(p.salaryIncome??p.monthlySalary)||0;
 const canTradeFutures=p=>!!p&&!p.isStudent&&p.isEmployed!==false&&!p.employment?.unemployed&&salary(p)>0;
 const validFuture=a=>Number.isFinite(a.entryPrice)&&a.entryPrice>=0&&Number.isFinite(a.margin)&&a.margin>=0&&Number.isSafeInteger(a.quantity)&&a.quantity>0&&a.margin===a.quantity*3000;
 function settlement(item,units,side,lots){
  const quantity=item.asset==='stocks'?units*1000:units;
  const fee=finite(units*(item.asset==='stocks'?1000:item.asset==='funds'||item.asset==='futures'&&side==='sell'?3000:0));
  if(item.asset==='futures'){
   const selected=lots.filter(x=>!item.holdingId||x.a.id===item.holdingId);let remaining=units,pnl=0,margin=0;
   if(side==='sell')for(const {a,units:held} of selected){const n=Math.min(remaining,held);if(!n)continue;if(!validFuture(a))throw Error('舊期貨持倉缺少保證金／進場價，需核對原交易紀錄');pnl+=n*(item.currentMarketPrice-a.entryPrice);margin+=n*3000;remaining-=n;}
   if(side==='sell'&&remaining)throw Error('賣出數量超過持有量');
   const cashDelta=side==='buy'?-units*3000:margin+pnl-fee;
   return {quantity,fee,margin:side==='buy'?units*3000:margin,pnl:side==='buy'?0:pnl,netProfit:side==='sell'?pnl-fee:0,cashDelta:finite(cashDelta),entryPrice:selected.length===1?selected[0].a.entryPrice:null,spread:selected.length===1?item.currentMarketPrice-selected[0].a.entryPrice:null};
  }
  const gross=finite(quantity*item.currentMarketPrice);
  return {quantity,fee,margin:0,pnl:0,netProfit:0,cashDelta:finite(side==='buy'?-gross-fee:gross-fee)};
 }
 function mutateTrade(p,item,units,side,byId,id){
  const lots=positions(p,item,byId),s=settlement(item,units,side,lots),amount=side==='buy'?-s.cashDelta:s.cashDelta;
  if(item.asset==='futures'){
   if(side==='buy'){
    if(p.cash<amount)throw Error('現金不足，不能成交');
    (p.assets.futures??=[]).push({id,cardId:item.quoteCardId,sourceMarketCardId:item.quoteCardId,name:item.name,assetName:item.name,marketKey:item.name,assetType:'future',unitType:'contract',quantity:units,units,entryPrice:item.currentMarketPrice,margin:s.margin,cost:s.margin,value:s.margin,income:0,operatingExpense:0});
   }else{
    let remaining=units;
    for(const {a,units:held} of lots.filter(x=>!item.holdingId||x.a.id===item.holdingId)){const n=Math.min(held,remaining);if(!n)continue;a.quantity-=n;a.units=a.quantity;a.margin-=n*3000;a.cost=a.margin;a.value=a.margin+(item.currentMarketPrice-a.entryPrice)*a.quantity;remaining-=n;}
    p.assets.futures=p.assets.futures.filter(a=>(a.quantity??a.units)>0);
   }
   p.cash=finite(p.cash+s.cashDelta);G.play.calculate(p);return amount;
  }
  units=s.quantity;
  if(side==='buy'){
   if(p.cash<amount)throw Error('現金不足，不能成交');
   const holdings=p.assets[item.asset]??=[];
   let a=holdings.find(a=>(a.marketKey||a.assetName||a.name)===item.name&&!a.income&&!a.operatingExpense&&a.unitType===item.unitType);
   if(!a){a={id,cardId:item.quoteCardId,name:item.name,assetName:item.name,marketKey:item.name,assetType:item.assetType,units:0,quantity:0,cost:0,value:0,income:0,incomeStatus:'unconfirmed',operatingExpense:0,unitType:item.unitType,purchases:[]};if(item.asset==='stocks')a.industry=item.name;holdings.push(a);}
   a.purchases??=[];a.purchases.push({cardId:item.quoteCardId,quantity:units,unitPrice:item.currentMarketPrice});
   a.units+=units;a.quantity=a.units;a.cost=finite(a.cost+amount);a.value=finite(a.units*item.currentMarketPrice);a.unitPrice=item.currentMarketPrice;a.purchasePrice=a.cost/a.units;a.lastPurchasePrice=item.currentMarketPrice;p.cash=finite(p.cash-amount);
  }else{
   const lots=positions(p,item,byId);if(lots.some(x=>x.units===null))throw Error('持倉缺少股／張單位，不能猜測成交數量');
   if(units>sum(lots.map(x=>x.units)))throw Error('賣出數量超過持有量');
   let remaining=units;
   for(const {a,units:held} of lots){if(!remaining)break;const sold=Math.min(remaining,held),ratio=(held-sold)/held;
    a.units*=ratio;a.quantity=a.units;a.cost=finite(a.cost*ratio);a.value=finite((held-sold)*item.currentMarketPrice);a.income=finite((a.income||0)*ratio);a.operatingExpense=finite((a.operatingExpense||0)*ratio);remaining-=sold;
   }
   for(const kind of Object.keys(p.assets))p.assets[kind]=p.assets[kind].filter(a=>a.units>0);
   p.cash=finite(p.cash+amount);
  }
  G.play.calculate(p);return amount;
 }
 Object.defineProperties(P,{
  marketPhase:{get(){return this.state?.pending?.market||null;}},
  trader:{get(){const m=this.marketPhase;return m&&m.status==='trading'?this.state.players.find(p=>p.id===m.eligibleTraders[m.participantIndex]):null;}},
  triggerPlayer:{get(){return this.state.players.find(p=>p.id===(this.marketPhase?.triggerPlayerId??this.active.id));}}
 });
 P.isMarketCard=function(c=this.byId.get(this.state?.pending?.cardId)){return c?.eventType==='MARKET_EVENT';};
 P.canTradeFutures=function(p=this.trader){return canTradeFutures(p);};
 P.futuresQuota=function(p=this.trader){const maximum=canTradeFutures(p)?Math.floor(salary(p)/10000):0,used=this.marketPhase?.futuresBought?.[p?.id]||0;return {monthlySalary:salary(p||{}),maximum,used,remaining:Math.max(0,maximum-used)};};
 P.setEligibleTraders=function(kind,ids){
  if(this.marketPhase)throw Error('請在市場事件開始前設定交易權限');
  if(!['stocks','futures','bondsFunds','meeting','risk'].includes(kind)||!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!this.state.players.some(p=>p.id===id)))throw Error('交易權限設定無效');
  this.state.marketPolicy??={};this.state.marketPolicy.eligibleTraders??={};this.state.marketPolicy.eligibleTraders[kind]=[...ids];
 };
 P.beginMarket=function(){
  if(this.marketPhase)return this.marketPhase;
  if(this.state.phase!=='resolving'||!this.isMarketCard())return null;
  const c=this.byId.get(this.state.pending.cardId),participants=this.state.players.filter(live).map(p=>p.id),drafts=copy(this.state.players);
  if(!participants.length)throw Error('沒有仍在遊戲中的市場參與者');
  let quoteCard=c,items=[],forcePurchase=null,quoteOrigin='CARD';const issues=[];
  const exempt=c.category==='詭譎市場'&&this.active.cash<=300000;
  if(exempt){issues.push('現金 30 萬以下，免翻詭譎市場卡；不翻後續行情、不執行強制買入。');}
  else if(c.category==='股東大會'){
   // Meeting values are not silently reinterpreted as prices. Explicit quotations take precedence.
   if(c.marketQuotes)items=pricedItems(c,c.marketQuotes,'stocks');
   else if(/股價|成交價|市場報價/.test(c.effective.effect||''))items=pricedItems(c,fields(c),'stocks');
   else if(this.state.marketState?.stocks){items=pricedItems(c,this.state.marketState.stocks,'stocks');quoteOrigin='LATEST_STOCK_QUOTES';}
   else if(this.state.marketPrices?.stocks?.length){items=copy(this.state.marketPrices.stocks).map(i=>({...i,blockedBuy:i.currentMarketPrice===0,blockedSell:false}));quoteOrigin='LATEST_STOCK_QUOTES';}
   else if(this.state.quotes?.['新聞報導股票行情']){items=pricedItems(c,this.state.quotes['新聞報導股票行情'],'stocks');quoteOrigin='LATEST_STOCK_QUOTES';}
   if(!items.length)issues.push('尚無明確股票報價；所有玩家仍依序參與，取得報價前不開放成交。');
  }else if(c.category==='詭譎市場'&&!Object.keys(fields(c)).length){
   const m=(c.effective.effect||'').match(/^拿所有資金的一半買進(.+?)(股票|期貨)；翻一張報價；不足([\d萬千百]+)者買進所有資金$/);
   if(m){
    const cat=m[2]==='股票'?'新聞報導股票行情':'期貨行情',pool=this.cards.filter(x=>x.category===cat&&x.enabled&&pricedItems(x).length);
    if(pool.length){quoteCard=G.weightedDraw(pool,this.rng);quoteOrigin='FOLLOWUP_QUOTE';items=pricedItems(quoteCard);forcePurchase={name:({'道瓊指':'道瓊指數','恆生指':'恆生指數','S&P':'S&P指數','台指':'台指期貨'})[m[1]]||m[1],threshold:G.play.moneyValue(m[3]),effectScope:'CURRENT_PLAYER'};}
    else issues.push('沒有可翻開的有效報價卡，暫不成交。');
   }else issues.push('此市場事件缺少明確商品與後續報價規則，暫不成交。');
  }else items=pricedItems(c,c.marketQuotes||fields(c));
  const compiled=compileEffects(quoteCard,items);
  const market={id:'market-'+this.state.round+'-'+this.state.events.length+'-'+c.cardId,cardId:c.cardId,triggerPlayerId:this.active.id,marketParticipants:participants,participantIndex:0,completedParticipants:[],status:'trading',quoteCardId:quoteOrigin==='LATEST_STOCK_QUOTES'&&items.length?items[0].quoteCardId:quoteCard.cardId,quoteOrigin:items.length?quoteOrigin:'NONE',items,globalMarketEffect:compiled.globalMarketEffect,playerSpecificEffect:compiled.playerSpecificEffect,issues:[...issues,...compiled.issues],effectsApplied:true,effectResults:[],trades:[]};
  market.version=2;market.futuresBought={};market.exempt=exempt;
  const policyKind=c.category==='詭譎市場'?'risk':c.category==='股東大會'?'meeting':items.some(i=>i.asset==='futures')?'futures':items.some(i=>i.asset==='stocks')?'stocks':'bondsFunds';
  const configured=this.state.marketPolicy?.eligibleTraders?.[policyKind];market.policyKind=policyKind;market.permissionStatus=Array.isArray(configured)?'configured':'unconfigured';
  market.eligibleTraders=exempt?[]:participants.filter(id=>configured?.includes(id));
  if(!Array.isArray(configured)&&!exempt)market.issues.push('主動交易權限尚未設定；本次只更新全域行情與既有持倉，不授權任何玩家主動交易。');
  for(const item of items)item.previousMarketPrice=this.state.marketState?.[item.asset]?.[item.name]??this.state.marketPrices?.[item.asset]?.find(i=>i.name===item.name)?.currentMarketPrice??null;
  if(c.category==='股東大會')for(const p of drafts.filter(live)){
   const result=this.shareholderMeeting(p,c);
   if(result.manualResolution)market.issues.push(p.name+'：'+result.issues.join('；'));
   else{p.cash=finite(result.remainingCash);market.effectResults.push({type:'SHAREHOLDER_MEETING',playerId:p.id,amount:result.amount,message:result.message});}
  }
  if(items.some(i=>i.asset==='stocks'))for(const p of drafts.filter(live))for(const a of p.assets.stocks){
   if(a.units>0&&!stockIndustry(a,this.byId)&&!items.some(i=>i.asset==='stocks'&&(a.marketKey||a.assetName||a.name)===i.name))market.issues.push(p.name+' 的 '+a.name+' 缺少股票產業對照，無法依產業報價交易或強制賣出。');
  }
  for(const effect of market.globalMarketEffect){const item=items.find(i=>i.name===effect.name);
   for(const p of drafts.filter(live)){
    const held=positions(p,item,this.byId);
    if(held.some(x=>x.units===null)){market.issues.push(p.name+' 的 '+item.name+' 持倉缺少單位，無法強制結算。');item.blockedBuy=item.blockedSell=true;continue;}
    if(item.asset==='futures')continue; // Futures use the common liquidation handler below, once per position.
    const shares=sum(held.map(x=>x.units)),units=item.asset==='stocks'?shares/1000:shares;
    if(!Number.isInteger(units)){market.issues.push(p.name+' 的 '+item.name+' 持股不足整張，強制出售手續費規則待確認。');continue;}
    if(units){const amount=mutateTrade(p,item,units,'sell',this.byId,market.id);market.effectResults.push({type:'FORCED_SALE',playerId:p.id,name:item.name,quantity:units,price:item.currentMarketPrice,amount});}
   }
  }
  for(const effect of market.playerSpecificEffect)for(const p of drafts.filter(live)){
   const industry=p.employment?.industry||p.employmentIndustry||p.industry||this.byId.get(p.characterId)?.effective?.fields?.industry||items.find(i=>i.asset==='stocks'&&(p.occupation||'').startsWith(i.name+'公司'))?.name;
   if(!industry){market.issues.push(p.name+' 未記錄任職產業，無法判定 '+effect.industry+' 員工條件。');continue;}
   if(industry!==effect.industry)continue;
   if(effect.highestRankExempt&&typeof p.employment?.isHighestRank!=='boolean'){market.issues.push(p.name+' 的最高階職位條件未記錄，未套用失業。');continue;}
   if(effect.highestRankExempt&&p.employment.isHighestRank)continue;
   p.employment={...p.employment,industry,unemployed:true,previousSalary:p.employment?.previousSalary??p.salaryIncome};
   const amount=-p.salaryIncome;p.salaryIncome=0;p.isEmployed=false;if('monthlySalary' in p)p.monthlySalary=0;market.effectResults.push({type:'UNEMPLOYMENT',playerId:p.id,industry,amount});
  }
  // Rule page says "高於" but its explicit 13,000 -> 10,000 example is a loss.
  // Follow that concrete example: decline >= 3,000; return margin + P/L - 3,000 fee.
  // https://www.getrichwithzack.com/instructions-of-marketing-war-life/
  for(const p of drafts.filter(live))for(const item of items.filter(i=>i.asset==='futures'))for(const {a,units} of positions(p,item,this.byId)){
   if(!validFuture(a)){market.issues.push(p.name+' 的 '+item.name+' 為舊制持倉，缺少可信進場價／保證金，未猜測換算或退款。');continue;}
   if(a.entryPrice-item.currentMarketPrice>=3000||market.globalMarketEffect.some(e=>e.type==='FORCED_SALE'&&e.name===item.name)){
    const quote={...item,holdingId:a.id},detail=settlement(quote,units,'sell',positions(p,item,this.byId)),amount=mutateTrade(p,quote,units,'sell',this.byId,market.id);
    market.effectResults.push({type:'FUTURES_LIQUIDATION',playerId:p.id,name:item.name,quantity:units,amount,...detail});
   }
  }
  if(forcePurchase){const item=items.find(i=>i.name===forcePurchase.name),p=drafts.find(p=>p.id===market.triggerPlayerId);
   market.playerSpecificEffect.push({type:'FORCED_PURCHASE',...forcePurchase,playerId:p.id});
   if(item&&!item.blockedBuy&&item.currentMarketPrice>0&&live(p)){
    const budget=p.cash<forcePurchase.threshold?p.cash:p.cash/2;
    // The cash-fraction risk text does not specify how it interacts with the salary cap.
    // Do not silently invent an exception or convert a cash position to margin contracts.
    if(item.asset==='futures')market.issues.push('詭譎市場強制期貨的現金比例與月薪口數上限如何併用尚未明定；行情與全體強平已處理，未猜測強制買入口數。');
    const units=item.asset==='futures'?0:Math.max(0,Math.floor(budget/(item.currentMarketPrice*(item.asset==='stocks'?1000:1)+(item.asset==='stocks'?1000:0))));
    if(units){const amount=mutateTrade(p,item,units,'buy',this.byId,market.id+'-forced');market.effectResults.push({type:'FORCED_PURCHASE',playerId:p.id,name:item.name,quantity:units,amount});}
   }else market.issues.push('觸發玩家的指定買入商品無可用價格或本回合禁止買進，未成交。');
  }
  // Mark to this fixed quote without changing historical acquisition cost.
  for(const p of drafts.filter(live)){for(const item of items)for(const {a,units} of positions(p,item,this.byId))if(units!==null){if(item.asset!=='futures')a.value=finite(units*item.currentMarketPrice);else if(validFuture(a))a.value=finite(a.margin+(item.currentMarketPrice-a.entryPrice)*units);}G.play.calculate(p);}
  if(policyKind==='futures')market.eligibleTraders=market.eligibleTraders.filter(id=>canTradeFutures(drafts.find(p=>p.id===id)));
  if(!market.eligibleTraders.length)market.status='awaiting-ack';
  market.issues=[...new Set(market.issues)];
  const marketState=copy(this.state.marketState||{});for(const item of items){marketState[item.asset]??={};marketState[item.asset][item.name]=item.currentMarketPrice;}
  this.state.players.forEach((p,i)=>Object.assign(p,drafts[i]));this.state.marketState=marketState;
  this.state.pending.market=market;
  this.log(exempt?'RISK_EXEMPT':'MARKET_OPEN',this.active.name+' 觸發市場，'+market.eligibleTraders.length+' 位玩家取得本次交易權限',c.cardId,market.triggerPlayerId);
  for(const result of market.effectResults)this.log(result.type,JSON.stringify(result),c.cardId,result.playerId);
  return market;
 };
 P.marketItems=function(){return this.marketPhase?copy(this.marketPhase.items):[];};
 P.marketHoldings=function(name,asset,playerId=this.trader?.id){
  const p=this.state.players.find(p=>p.id===playerId),item=this.marketPhase?.items.find(i=>i.name===name&&i.asset===asset);if(!p||!item)return [];
  return positions(p,item,this.byId).map(x=>({...copy(x.a),quotedUnits:x.units,storageKind:x.kind}));
 };
 P.requireTrader=function(playerId,marketId){
  const m=this.marketPhase,p=this.trader;
  if(this.state.phase!=='resolving'||!m||m.status!=='trading'||!p||!live(p))throw Error('目前沒有可操作的市場交易者');
  if(playerId!==p.id||marketId!==m.id)throw Error('不是目前交易玩家，或市場階段已變更');
  return p;
 };
 P.tradeQuote=function(name,units,side='buy',playerId=this.trader?.id,marketId=this.marketPhase?.id,holdingId=null){
  const p=this.requireTrader(playerId,marketId),item=this.marketPhase.items.find(i=>i.name===name);
  if(!['buy','sell'].includes(side)||!item)throw Error('交易商品或方向無效');
  if(!Number.isSafeInteger(units)||units<1)throw Error('數量必須是正整數');
  const all=positions(p,item,this.byId),lots=holdingId?all.filter(x=>x.a.id===holdingId):all,unknown=lots.some(x=>x.units===null),held=unknown?null:sum(lots.map(x=>x.units))/(item.asset==='stocks'?1000:1),quota=this.futuresQuota(p);
  let reason=side==='buy'?(item.blockedBuy||item.currentMarketPrice<=0?'本次禁止買進或無有效價格':''):(item.blockedSell||unknown?'本次禁止賣出或持倉單位待確認':'');
  if(item.asset==='securities')reason='此商品尚未明確分類為債券或基金，不能猜測手續費';
  if(item.asset==='futures'){
   if(!canTradeFutures(p))reason='學生、未就業或無月薪玩家不能交易期貨';
   if(side==='sell'&&(lots.some(x=>!validFuture(x.a))||(!holdingId&&lots.length>1)))reason='請選擇具有進場價與保證金的單筆期貨持倉';
  }
  if(holdingId&&!lots.length)reason='找不到指定持倉';
  const unitCost=item.asset==='futures'?3000:item.currentMarketPrice*(item.asset==='stocks'?1000:1)+(item.asset==='stocks'?1000:item.asset==='funds'?3000:0);
  const maxQuantity=reason?0:side==='buy'?Math.max(0,Math.min(Math.floor(p.cash/unitCost),item.asset==='futures'?quota.remaining:Infinity)):Math.floor(held);
  let detail={fee:0,margin:0,pnl:0,netProfit:0,cashDelta:0};
  if(!(item.asset==='futures'&&side==='sell'&&(reason||units>maxQuantity)))detail=settlement({...item,holdingId},units,side,lots);
  const amount=side==='buy'?-detail.cashDelta:detail.cashDelta,remainingCash=finite(p.cash+detail.cashDelta);
  return {...copy(item),...detail,holdingId,quota,playerId,triggerPlayerId:this.marketPhase.triggerPlayerId,marketEventId:marketId,side,units,quantity:units,unitPrice:item.currentMarketPrice,amount,cost:side==='buy'?amount:0,proceeds:side==='sell'?amount:0,currentCash:p.cash,remainingCash,held,maxQuantity,allowed:!reason&&units<=maxQuantity,affordable:remainingCash>=0,blocked:!!reason,reason:reason||(units>maxQuantity?'現金不足、超過持有數量或本次月薪口數上限':'')};
 };
 P.executeMarket=function(name,units,side='buy',playerId=this.trader?.id,marketId=this.marketPhase?.id,holdingId=null){
  const q=this.tradeQuote(name,units,side,playerId,marketId,holdingId);if(!q.allowed)throw Error(q.reason);
  const p=this.requireTrader(playerId,marketId),draft=copy(p);mutateTrade(draft,q,units,side,this.byId,'asset-'+marketId+'-'+this.state.events.length);
  Object.assign(p,draft);this.marketPhase.trades.push(copy(q));
  if(q.asset==='futures'&&side==='buy')this.marketPhase.futuresBought[p.id]=(this.marketPhase.futuresBought[p.id]||0)+units;
  this.log(side==='buy'?'BUY':'SELL',p.name+' '+(side==='buy'?'買進':'賣出')+' '+name+' × '+units+'，單價 '+q.unitPrice+'，金額 '+q.amount,this.marketPhase.cardId,p.id);
  this.checkFreedom(p);return q;
 };
 P.buyMarket=function(name,units,...extra){if(extra.length)throw Error('價格由行情卡固定，不接受人工價格');return this.executeMarket(name,units,'buy');};
 P.sellMarket=function(name,units){return this.executeMarket(name,units,'sell');};
 P.completeMarket=function(playerId=this.trader?.id,marketId=this.marketPhase?.id){
  const p=this.requireTrader(playerId,marketId),m=this.marketPhase;
  m.completedParticipants.push(p.id);m.participantIndex++;
  this.log('MARKET_PARTICIPANT_DONE',p.name+' 完成本次交易',m.cardId,p.id);
  while(m.participantIndex<m.eligibleTraders.length&&!live(this.state.players.find(p=>p.id===m.eligibleTraders[m.participantIndex]))){m.completedParticipants.push(m.eligibleTraders[m.participantIndex++]);}
  if(m.participantIndex===m.eligibleTraders.length){m.status='complete';this.state.lastMarket=copy(m);this.log('MARKET_CLOSED','獲授權參與者已完成，返回觸發玩家回合',m.cardId,m.triggerPlayerId);this.finish();return {complete:true};}
  return {complete:false,traderId:this.trader.id};
 };
 P.acknowledgeMarket=function(playerId=this.triggerPlayer.id,marketId=this.marketPhase?.id){const m=this.marketPhase;if(!m||m.status!=='awaiting-ack'||playerId!==m.triggerPlayerId||marketId!==m.id)throw Error('不能確認此市場事件');m.status='complete';this.state.lastMarket=copy(m);this.log('MARKET_CLOSED','行情與持倉更新完成；未開放主動交易',m.cardId,playerId);this.finish();return {complete:true};};
  const oldRoll=P.roll,oldPreview=P.preview,oldApply=P.apply,oldSkip=P.skip,oldFinish=P.finish,oldValidate=P.validate,oldManual=P.manual,oldBorrow=P.borrow,oldEnd=P.end;
 P.roll=function(){const result=oldRoll.call(this);if(this.isMarketCard())this.beginMarket();return result;};
 P.preview=function(){if(this.isMarketCard())return {kind:'market',triggerPlayerId:this.marketPhase?.triggerPlayerId??this.active.id,traderId:this.trader?.id};return oldPreview.call(this);};
 P.apply=function(){if(this.isMarketCard()){this.beginMarket();return this.marketPhase.status==='awaiting-ack'?this.acknowledgeMarket():this.completeMarket();}return oldApply.call(this);};
 P.skip=function(){if(this.isMarketCard())return this.apply();return oldSkip.call(this);};
 P.completeMeeting=function(){this.beginMarket();return this.apply();};
 P.finish=function(){if(this.marketPhase&&this.marketPhase.status!=='complete')throw Error('必須完成市場交易或確認行情更新');return oldFinish.call(this);};
 P.end=function(){oldEnd.call(this);let skipped=0;while(!live(this.active)&&skipped++<this.state.players.length){this.state.phase='done';oldEnd.call(this);}if(!live(this.active))throw Error('沒有仍在遊戲中的玩家');};
 P.manual=function(values){if(this.isMarketCard())throw Error('市場階段不接受人工改帳');return oldManual.call(this,values);};
 P.borrow=function(...args){if(this.isMarketCard())throw Error('市場階段不接受人工借款');return oldBorrow.apply(this,args);};
 P.validate=function(){
  oldValidate.call(this);const m=this.marketPhase;if(!m)return true;
  if(m.version!==2){m.version=2;m.eligibleTraders=[];m.participantIndex=0;m.completedParticipants=[];m.status='awaiting-ack';m.futuresBought={};m.permissionStatus='unconfigured';m.issues??=[];m.issues.push('舊存檔交易權限已停用，既有結算不重複執行；下次行情使用新版規則。');}
  const ids=this.state.players.map(p=>p.id);
  if(this.state.phase!=='resolving'||!this.isMarketCard()||m.cardId!==this.state.pending.cardId||m.triggerPlayerId!==this.active.id||!Array.isArray(m.marketParticipants)||!m.marketParticipants.length||new Set(m.marketParticipants).size!==m.marketParticipants.length||m.marketParticipants.some(id=>!ids.includes(id))||!Array.isArray(m.eligibleTraders)||new Set(m.eligibleTraders).size!==m.eligibleTraders.length||m.eligibleTraders.some(id=>!m.marketParticipants.includes(id))||!Number.isInteger(m.participantIndex)||m.participantIndex<0||!['trading','awaiting-ack'].includes(m.status)||m.status==='trading'&&m.participantIndex>=m.eligibleTraders.length||m.status==='awaiting-ack'&&m.eligibleTraders.length!==0||!m.effectsApplied||JSON.stringify(m.completedParticipants)!==JSON.stringify(m.eligibleTraders.slice(0,m.participantIndex))||!m.futuresBought||Object.values(m.futuresBought).some(n=>!Number.isSafeInteger(n)||n<0))throw Error('市場階段存檔結構不一致');
  if(!Array.isArray(m.items)||m.items.some(i=>!this.byId.has(i.quoteCardId)||!Number.isFinite(i.currentMarketPrice)||i.currentMarketPrice<0||!['stocks','futures',...securityKinds].includes(i.asset)))throw Error('市場行情快照不合法');
  return true;
 };
 G.play.market={live,pricedItems,compileEffects,positionUnits,canTradeFutures,settlement,validFuture};
});

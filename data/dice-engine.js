(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else factory(root.GameData);})(globalThis,function(G){
 'use strict';
 const P=G.play.Session.prototype,copy=v=>JSON.parse(JSON.stringify(v)),money=G.play.moneyValue;
 const title=c=>c.effective.title||c.effective.titleCandidate||c.cardId;
 function compile(c){
  if(c.category==='角色')return null;
  const e=c.effective?.effect||'',t=c.effective?.title||'',count=e.match(/([123一二兩三])顆骰/),numbers={'一':1,'二':2,'兩':2,'三':3};
  if(!/骰/.test(e))return null;
  const dice=count?(numbers[count[1]]||Number(count[1])):/骰子[1-6]|擲骰子；點數/.test(e)?1:null;
  if(!dice)return null;
  const cost=e.match(/投資金額([\d.,萬千百億]+)元/),r={dice,cost:cost?money(cost[1]):0,optional:!!cost||/可以選擇|可以.*賣出/.test(e)};
  if(cost||/可以選擇接受這個挑戰/.test(e)){
   const outcomes={};for(const m of e.matchAll(/(?:骰子)?([1-6](?:、[1-6])*)：([^；。]+)/g)){
    const value=m[2].match(/(-?[\d.,萬千百億]+)元$/);if(!value)return null;
    const amount=value[1].startsWith('-')?-money(value[1].slice(1)):money(value[1]);if(!Number.isFinite(amount))return null;
    for(const n of m[1].split('、'))outcomes[n]={amount,text:m[2]};
   }
   if(Object.keys(outcomes).length===6)return {...r,type:'cash',outcomes,transfer:/轉讓給其他玩家/.test(e)};
  }
  if(e==='擲骰子；點數為奇數得獎金10萬元；點數為偶數損失10萬元')return {...r,type:'odd-even'};
  if(e==='擲1顆骰子；點數1-3個債增加30萬元；點數4-6個債增加20萬元')return {...r,type:'debt'};
  if(e==='擲1顆骰子；點數1-4損失10000元；點數5-6為抓小偷受傷，送醫院')return {...r,type:'hospital'};
  if(e==='三顆骰子大於14；可進一階'||e==='擲3顆骰子；點數14-18可進一階')return {...r,type:'promotion',threshold:e.includes('大於14')?15:14};
  if(e==='擲1顆骰子；點數乘以1000為花費；有小孩者買小孩衣服花費3000元')return {...r,type:'clothes'};
  if(e==='擲骰子；點數1-3損失一半現金；點數4-6支付贍養費5萬元')return {...r,type:'divorce',skipTurns:/暫停一次/.test(t)?1:0};
  if(e==='擲3顆骰子；點數9-12中獎500元；點數4-8中獎10000元；點數3中獎100萬元')return {...r,type:'lottery',cost:1000,optional:true};
  if(e==='如果手中持有市區建地；擲一顆骰子，點數1-4可以2億價格賣出，點數5-6可以3億價格賣出；僅限翻卡玩家')return {...r,type:'property',tokens:['市區','建地'],prices:[200000000,300000000],optional:true};
  if(e==='持有郊區透天者，擲1顆骰子；點數1-4可以買進價1.2倍賣出；點數5-6可以買進價1.5倍賣出；僅限翻卡玩家')return {...r,type:'property',tokens:['郊區','透天'],factors:[1.2,1.5],optional:true};
  if(e==='玩家持有任何郊區物件者；擲1顆骰子，點數1-4所有物件7折出清；點數5-6所有物件5折出清')return {...r,type:'property',tokens:['郊區'],factors:[.7,.5],all:true};
  return null;
 }
 const oldPreview=P.preview,oldApply=P.apply,oldSkip=P.skip,oldRoll=P.rollEventDie,oldFunding=P.investmentFunding,oldManual=P.manual,oldBorrow=P.borrow,oldValidate=P.validate,oldEnd=P.end;
 P.diceCard=function(){const c=this.byId.get(this.state.pending?.cardId);return c?.resolver?.op==='dice-event'?c:null;};
 P.dicePlayer=function(){return this.state.players.find(p=>p.id===this.state.pending?.dicePlayerId)||this.active;};
 P.eventDiceCount=function(){const c=this.state.pending?.kind==='childbirth'?this.childbirthCard():this.byId.get(this.state.pending?.cardId);return c?.resolver?.dice||compile(c||{})?.dice||null;};
 P.diceProperties=function(c){return this.dicePlayer().assets.properties.filter(a=>c.resolver.tokens.every(t=>(a.name||'').includes(t)));};
 P.investmentFunding=function(){const c=this.diceCard();if(!c)return oldFunding.call(this);if(!c.resolver.optional||c.resolver.type==='property'||this.state.pending.diceAccepted)return null;const p=this.dicePlayer(),cost=c.resolver.cost;return {cost,cash:p.cash,shortfall:Math.max(0,cost-p.cash),canAfford:p.cash>=cost};};
 P.preview=function(){
  const pendingCard=this.byId.get(this.state.pending?.cardId);if(this.active?.employment?.industry==='無產業'&&pendingCard&&!this.isMarketCard(pendingCard)&&/失業/.test((pendingCard.effective.title||'')+(pendingCard.effective.effect||'')))return {kind:'employment-exempt',message:'此角色為無產業，不受失業事件影響。'};
  const c=this.diceCard();if(!c)return oldPreview.call(this);
  const r=c.resolver,q=this.state.pending,rolls=q.eventRolls||[],result=q.diceResult;
  if(result)return {kind:'dice-event',...result,settled:true,message:result.message};
  const noProperties=r.type==='property'&&!this.diceProperties(c).length;
  const waitingDecision=r.optional&&!q.diceAccepted&&!noProperties;
  return {kind:'dice-event',waitingDecision,waitingDice:!waitingDecision&&!noProperties&&rolls.length<r.dice,noProperties,dice:r.dice,cost:r.cost,transfer:r.transfer,optional:r.optional,
   message:noProperties?'沒有符合條件的房產，本次無影響。':waitingDecision?'確認參與'+(r.cost?'並支付 '+r.cost+' 元':'')+'後，擲 '+r.dice+' 顆骰子。':'請擲 '+r.dice+' 顆骰子（已完成 '+rolls.length+' 顆）。'};
 };
 P.acceptDice=function(playerId=this.active.id){
  const c=this.diceCard(),q=this.state.pending;if(this.state.phase!=='resolving'||!c||!this.preview().waitingDecision)throw Error('目前不需要確認投資');
  const p=this.state.players.find(p=>p.id===playerId);if(!p||!G.play.market.live(p)||playerId!==this.active.id&&!c.resolver.transfer)throw Error('不能轉讓給此玩家');
  if(p.cash<c.resolver.cost)throw Error('資金不足，只能放棄');
  q.dicePlayerId=p.id;q.diceAccepted=true;q.diceInitialCash=p.cash;q.eventRolls=[];p.cash-=c.resolver.cost;G.play.calculate(p);
  this.log('DICE_ACCEPT',title(c)+'：'+p.name+' 確認參與，支付 '+c.resolver.cost+' 元',c.cardId,p.id);
 };
 P.recordDice=function(code,c,result){const rolls=this.state.pending.eventRolls||[],data={cardName:title(c),diceCount:this.eventDiceCount(),rolls:[...rolls],sum:rolls.reduce((a,b)=>a+b,0),...result};this.log(code,data.cardName+'：'+JSON.stringify(data),c.cardId,this.dicePlayer().id);Object.assign(this.state.events.at(-1),data);};
 P.settleDice=function(){
  const c=this.diceCard(),q=this.state.pending,r=c.resolver,p=this.dicePlayer(),rolls=q.eventRolls||[];
  if(q.diceResult||rolls.length!==r.dice)return;
  const die=rolls[0],sum=rolls.reduce((a,b)=>a+b,0),before=copy(p);let amount=0,message='',review=null;
  if(r.type==='cash'){const o=r.outcomes[die];amount=o.amount;message=o.text;}
  if(r.type==='odd-even'){amount=die%2?100000:-100000;message=die%2?'奇數獎金':'偶數損失';}
  if(r.type==='clothes'){amount=-die*1000-(p.children?3000:0);message='衣服花費'+(p.children?'，另付小孩衣服 3000 元':'');}
  if(r.type==='divorce'){amount=die<=3?-p.cash/2:-50000;p.skipTurns=(p.skipTurns||0)+(r.skipTurns||0);message='離婚支出；暫停 '+(r.skipTurns||0)+' 次';}
  if(r.type==='lottery'){amount=sum===3?1000000:sum<=8?10000:sum<=12?500:0;message=amount?'樂透中獎':'未中獎';}
  if(r.type==='debt'){const principal=die<=3?300000:200000;p.liabilities.loans.push({id:'event-debt-'+this.state.events.length,cardId:c.cardId,principal,monthlyPayment:0,interestStatus:'unconfigured'});message='個人負債增加 '+principal+' 元；牌面未列月息，未新增月息';}
  if(r.type==='hospital'){if(die<=4){amount=-10000;message='遭小偷，損失 10000 元';}else{const tile=this.board.zone(p.zone).find(t=>t.type==='hospital');if(tile){p.position=this.board.zone(p.zone).indexOf(tile);message='移動到醫院';}else review='送醫院：目前棋盤沒有醫院格，無法決定目的地';}}
  if(r.type==='promotion'){if(sum<r.threshold)message='未達升遷點數，資料不變';else review='符合升一階條件；目前沒有職位階級及對應薪資表，需人工處理升遷';}
  if(r.type==='property'){if(!r.prices&&this.diceProperties(c).some(a=>!Number.isFinite(a.purchasePrice??G.play.normalizeProperty(this.byId.get(a.cardId))?.propertyPrice))){review='舊持倉缺少買進總價，無法計算售價，需人工確認';}else{q.diceResult={message:'骰出 '+rolls.join('、')+'；'+(r.prices?'售價 '+r.prices[die<=4?0:1]+' 元':'以買進價 × '+r.factors[die<=4?0:1]+' 出售'),salePending:true};return;}}
  p.cash+=amount;G.play.calculate(p);
  const changes={cash:p.cash-before.cash,debtPrincipal:p.debtTotal-before.debtTotal,monthlyIncome:p.totalIncome-before.totalIncome,monthlyExpense:p.totalExpense-before.totalExpense,position:p.position-before.position,skipTurns:(p.skipTurns||0)-(before.skipTurns||0)};
  const result={message:'骰出 '+rolls.join('、')+(rolls.length>1?'，合計 '+sum:'')+'：'+(review||message)+'。現金變動 '+amount+' 元'+(r.cost?'；含本金淨變動 '+(p.cash-q.diceInitialCash)+' 元':'')+'。',changes,review};
  q.diceResult=result;this.recordDice('DICE_RESULT',c,result);
 };
 P.rollEventDie=function(){
  const c=this.diceCard();if(!c){const value=oldRoll.call(this),card=this.state.pending.kind==='childbirth'?this.childbirthCard():this.byId.get(this.state.pending.cardId);this.recordDice('DICE_PROGRESS',card,{result:'已擲骰，等待結算'});return value;}
  const o=this.preview();if(this.state.phase!=='resolving'||o.waitingDecision||o.settled||o.noProperties||!o.waitingDice)throw Error('請先確認參與，且不可重擲');
  const value=this.random(6)+1;(this.state.pending.eventRolls??=[]).push(value);this.recordDice('DICE_PROGRESS',c,{result:'擲骰'});this.settleDice();return value;
 };
 P.apply=function(){
  if(this.preview()?.kind==='employment-exempt'){this.log('UNEMPLOYMENT_EXEMPT',this.active.name+' 為無產業，不受失業事件影響',this.state.pending.cardId);this.finish();return;}
  const c=this.diceCard();if(!c){const card=this.state.pending?.kind==='childbirth'?this.childbirthCard():this.byId.get(this.state.pending?.cardId),rolls=copy(this.state.pending?.eventRolls||[]),before=copy(this.active);const result=oldApply.call(this);if(rolls.length){this.log('DICE_RESULT',title(card)+'：'+rolls.join('、')+'；現金 '+(this.active.cash-before.cash)+'；小孩 '+(this.active.children-before.children),card.cardId);Object.assign(this.state.events.at(-1),{cardName:title(card),diceCount:card.resolver.dice,rolls,changes:{cash:this.active.cash-before.cash,children:this.active.children-before.children,monthlyExpense:this.active.totalExpense-before.totalExpense}});}return result;}
  const q=this.state.pending;if(!q.diceResult&&(q.eventRolls||[]).length===c.resolver.dice&&(!c.resolver.optional||q.diceAccepted))this.settleDice();const o=this.preview();if(o.waitingDecision)return this.acceptDice();if(o.waitingDice)throw Error('請先完成指定骰數');
  if(o.salePending){const p=this.dicePlayer(),r=c.resolver,branch=q.eventRolls[0]<=4?0:1,options=this.diceProperties(c),selected=r.all?options:options.filter(a=>a.id===(q.saleAssetId||options[0]?.id));let amount=0;
   const sales=selected.map(a=>{const basis=a.purchasePrice??G.play.normalizeProperty(this.byId.get(a.cardId))?.propertyPrice;if(!r.prices&&!Number.isFinite(basis))throw Error('舊持倉未記錄買進總價，需確認後才能出售');return {id:a.id,name:a.name,price:r.prices?r.prices[branch]:basis*r.factors[branch],loan:p.liabilities.mortgage.filter(l=>l.id===a.id).reduce((n,l)=>n+l.principal,0)};});
   for(const a of sales){amount+=a.price-a.loan;p.assets.properties=p.assets.properties.filter(x=>x.id!==a.id);p.liabilities.mortgage=p.liabilities.mortgage.filter(x=>x.id!==a.id);}p.cash+=amount;G.play.calculate(p);this.recordDice('DICE_RESULT',c,{result:'出售房產並清償房貸',sales,changes:{cash:amount}});
  }else if(o.noProperties)this.recordDice('DICE_RESULT',c,{result:o.message,changes:{cash:0}});
  this.finish();
 };
 P.skip=function(){const c=this.diceCard();if(!c)return oldSkip.call(this);const o=this.preview();if(!o.waitingDecision&&!(o.salePending&&c.resolver.optional))throw Error('事件已開始，請完成擲骰與結算');this.recordDice('DICE_DECLINED',c,{result:o.salePending?'放棄出售':'放棄參與',changes:{cash:0}});this.finish();};
 P.manual=function(v){if(this.diceCard())throw Error('骰子事件由系統依結果結算');return oldManual.call(this,v);};
 P.borrow=function(...v){if(this.diceCard())throw Error('此骰子事件未允許貸款支付');return oldBorrow.apply(this,v);};
 P.validate=function(){oldValidate.call(this);const rolls=this.state.pending?.eventRolls,n=this.eventDiceCount();if(rolls&&(!Array.isArray(rolls)||rolls.some(v=>!Number.isInteger(v)||v<1||v>6)||n&&rolls.length>n))throw Error('事件骰存檔點數錯誤');return true;};
 P.end=function(){oldEnd.call(this);let count=0;while(this.active.skipTurns>0&&count++<100){this.active.skipTurns--;this.log('SKIP_TURN',this.active.name+' 依事件暫停一次');this.state.phase='done';oldEnd.call(this);}};
 G.play.dice={compile};
});

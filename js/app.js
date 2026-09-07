(async function(){
 'use strict';const U=GameUI,$=U.$,wait=ms=>new Promise(r=>setTimeout(r,ms));let cards,session,busy=false,paused=false,drawn=false,loopRunning=false,marketLoopRunning=false;
 const logger=e=>console.info('[GAME]',e.code,e);
 function persist(){GameSave.write(session.state);$('saveStatus').textContent=GameSave.error||'已自動儲存 · 本機瀏覽器';}
 function render(positions=true){U.render(session.state,busy,positions);$('home').disabled=busy;if($('cardDialog').open){U.account(session.state);if(!$('tradeForm').hidden)quoteTrade();}}
 function fail(e){console.error(e);$('cardError').textContent=e.message;$('loadStatus').textContent=e.message;}
 function showBank(){
  let dialog=$('bankDialog');
  if(!dialog){
   dialog=document.createElement('dialog');dialog.id='bankDialog';dialog.style.cssText='width:min(520px,90vw);padding:28px;border:0;border-radius:20px';
   dialog.innerHTML='<h2>銀行貸款機會</h2><p id="bankTrigger"></p><h3 id="bankApplicant"></h3><p id="bankProgress"></p><p id="bankLimit"></p><form id="bankForm"><label>申請本金（元）<input id="bankPrincipal" type="number" min="1" step="any" required></label><label>每月利息（元）<input id="bankInterest" type="number" min="0" step="any" required></label><p id="bankError" role="alert"></p><button id="bankApply" type="submit" class="primary">申請貸款</button></form><button id="bankDecline" type="button">不申請</button>';
   dialog.addEventListener('cancel',e=>e.preventDefault());document.body.append(dialog);
  }
  const b=session.bankPhase,p=session.bankApplicant,limit=session.bankLoanLimit();busy=false;
  U.setViewed(p.id);render();$('bankTrigger').textContent='停在銀行：'+session.active.name+'；全體仍在遊戲中的玩家各有一次機會。';
  $('bankApplicant').textContent='目前選擇：'+p.name;$('bankProgress').textContent='已完成 '+b.decisions.length+' / '+b.participants.length+' 位';
  $('bankLimit').textContent='目前現金：'+U.money(p.cash)+' 元；剩餘可借：'+U.money(limit)+' 元';
  $('bankPrincipal').value='';$('bankPrincipal').max=limit;$('bankInterest').value='';$('bankError').textContent='';$('bankApply').disabled=limit<=0;
  const bankId=b.id,playerId=p.id;
  const decide=async action=>{if(busy)return;busy=true;try{const result=action();persist();if(result.complete){dialog.close();await afterResolution();}else showBank();}catch(e){$('bankError').textContent=e.message;busy=false;}};
  $('bankForm').onsubmit=e=>{e.preventDefault();decide(()=>session.chooseBankLoan(Number($('bankPrincipal').value),Number($('bankInterest').value),playerId,bankId));};
  $('bankDecline').onclick=()=>decide(()=>session.declineBankLoan(playerId,bankId));
  if(!dialog.open)dialog.showModal();
 }
 function showPending(){if(session.bankPhase){showBank();return {kind:'bank'};}const c=session.state.pending?.kind==='childbirth'?session.childbirthCard():session.byId.get(session.state.pending?.cardId);if(c){
  $('marketProgress')?.remove();$('marketQuoteTable')?.remove();$('futuresLotLabel')?.remove();
  if(session.isMarketCard(c)){session.beginMarket();showMarket(c);return c;}
  for(const child of $('humanActions').children)child.hidden=false;
  $('apply').disabled=false;$('skip').textContent='放棄';
  U.card(session.state,c,session.preview());setupTrade();
  $('eventRoll').closest('.event-dice').hidden=!session.requiresEventDie();
  const payment=session.mandatoryPayment();if(payment!==null){
   for(const child of $('humanActions').children)child.hidden=child.id!=='apply';
   $('apply').textContent='確定';$('decisionTitle').textContent=payment?'扣款 '+U.money(payment)+' 元':'免付此筆支出';
   $('suggestion').textContent=payment?'按下確定後，系統將直接從現金扣除 '+U.money(payment)+' 元。':'已符合保險免付條件，按確定完成結算。';
  }
  const dividend=session.dividend();if(dividend?.kind==='dividend'){
   for(const child of $('humanActions').children)child.hidden=child.id!=='apply';
   $('apply').textContent='確定';$('decisionTitle').textContent='發放股利 '+U.money(dividend.amount)+' 元';
   $('suggestion').textContent=dividend.stock+'：'+U.money(dividend.perLot)+' 元 × '+dividend.lots+' 張 = '+U.money(dividend.amount)+' 元。'+(dividend.lots?'按確定後一次性入帳，不增加月收入。':'目前沒有持有這檔股票，本次不發放股利。');
  }else if(dividend?.kind==='dividend-review')$('suggestion').textContent=dividend.reason;
  const meeting=session.shareholderMeeting();if(meeting){
   for(const child of $('humanActions').children)child.hidden=child.id!=='apply';
   $('decisionTitle').textContent='股東大會';$('apply').textContent=meeting.status==='ready'?'確認入帳':meeting.manualResolution?'記錄待補規則並繼續':'繼續';
   const holdings=meeting.holdings.map(h=>h.name+' × '+(h.lots!==null?h.lots+' 張':h.quantity+' 單位'));
   const lines=meeting.lines.map(l=>l.name+'：'+U.money(l.perUnit)+' 元 × '+l.quantity+' '+l.unit+' = '+U.money(l.amount)+' 元');
   $('suggestion').textContent=(holdings.length?'【你的目前持股】\n'+holdings.join('\n')+'\n\n':'')+meeting.message+(lines.length?'\n'+lines.join('\n'):'')+(meeting.manualResolution?'\n'+meeting.issues.join('\n'):'\n預計收入：'+U.money(meeting.amount)+'\n目前現金：'+U.money(meeting.currentCash)+'\n事件後現金：'+U.money(meeting.remainingCash));
  }
  const preview=session.preview(),dev=new URLSearchParams(location.search).get('dev')==='1';
  $('saleChoice')?.remove();
  const property=preview?.type==='PROPERTY_PURCHASE';
  $('manualToggle').hidden=!dev||!!preview;$('manualForm').hidden=true;$('loanForm').closest('details').hidden=!dev||!!preview;
  if(property){
   const p=session.active,o=preview,shortfall=Math.max(0,o.cost-p.cash);
   $('decisionTitle').textContent='購買房產';$('apply').hidden=false;$('skip').hidden=false;
   $('apply').disabled=shortfall>0;$('apply').textContent=shortfall?'資金不足，無法購買':'確認購買';
   $('suggestion').textContent=(c.effective.title||'房產')+'\n總價：'+U.money(o.value)+'\n頭期款：'+U.money(o.downPayment)+'\n貸款：'+U.money(o.loan)+(o.monthlyInterest===undefined?'\n房貸月付款：':'\n每月利息：')+U.money(o.expense)+'\n預估租金：'+U.money(o.income)+'\n每月淨現金流：'+(o.income-o.expense>=0?'+':'')+U.money(o.income-o.expense)+(o.renovationCost?'\n整修／裝潢：'+U.money(o.renovationCost):'')+'\n\n你的可用現金：'+U.money(p.cash)+'\n本次支付：'+U.money(o.cost)+(shortfall?'\n資金不足：-'+U.money(shortfall):'\n成交後現金：'+U.money(p.cash-o.cost))+(o.explanation?'\n'+o.explanation:'');
  }else if(preview?.kind==='property-sale'){
   $('decisionTitle').textContent='出售房產';$('apply').textContent=preview.selected?'確認出售':'繼續';
   $('suggestion').textContent=preview.selected?'售價：'+U.money(preview.selected.price)+'\n清償房貸：'+U.money(preview.selected.loan)+'\n成交後現金：'+U.money(preview.remainingCash):'沒有符合本次收購條件的房產，本卡無影響。';
   if(preview.selected){const select=document.createElement('select');select.id='saleChoice';for(const a of preview.options)select.append(new Option(a.name,a.id));select.value=preview.selected.id;select.onchange=()=>{session.state.pending.saleAssetId=select.value;showPending();};$('humanActions').prepend(select);}
  }else if(preview?.kind==='state-auto'){
   $('suggestion').textContent=preview.message;$('apply').textContent='確認結算';$('apply').disabled=!!preview.waitingDice||!!preview.waitingChildLimit;
   $('skip').hidden=true;$('eventRoll').disabled=!preview.waitingDice;
  }else if(!preview){
   $('apply').hidden=!dev;$('skip').textContent='繼續';
   $('suggestion').textContent=dev?'此卡尚未建立自動規則\ncardId: '+c.cardId:'此事件暫不可結算，本次不變更你的財務。';
  }
  const funding=session.investmentFunding();
  if(funding){
   if(preview?.kind==='purchase'&&!property){
    $('apply').textContent='確認購買';$('decisionTitle').textContent='投資資產';
    $('suggestion').textContent='投資成本：'+U.money(funding.cost)+' 元\n可用現金：'+U.money(funding.cash)+' 元';
   }
   if(!funding.canAfford){
    for(const child of $('humanActions').children)child.hidden=child.id!=='skip';
    $('apply').disabled=true;$('skip').textContent='放棄';
    $('decisionTitle').textContent='資金不足，只能放棄';
    $('suggestion').textContent='投資成本／本次需支付：'+U.money(funding.cost)+' 元\n可用現金：'+U.money(funding.cash)+' 元\n尚缺：'+U.money(funding.shortfall)+' 元';
   }
  }
 }return c;}
 function showMarket(c){
  const m=session.marketPhase,p=session.trader,actor=p||session.triggerPlayer,human=actor.personality==='human';
  U.card(session.state,c,{kind:'market'});$('saleChoice')?.remove();
  $('decisionTitle').textContent=m.items.some(i=>i.asset==='futures')?'期貨市場更新':p?'市場交易階段':'市場行情更新';
  $('cardPlayer').textContent='本次觸發玩家：'+session.triggerPlayer.name+'\n目前交易玩家：'+(p?.name||'未開放主動交易')+'\n剩餘待交易玩家：'+Math.max(0,m.eligibleTraders.length-m.participantIndex-1);
  const progress=U.el('div','','market-progress');progress.id='marketProgress';
  for(const id of m.eligibleTraders){const player=session.state.players.find(p=>p.id===id);progress.append(U.el('span',player.name+' · '+(m.completedParticipants.includes(id)?'已完成':id===p?.id?'目前交易':'等待中'),id===p?.id?'current':''));}
  $('decisionTitle').after(progress);
  $('humanActions').hidden=!human;$('aiThinking').hidden=human;$('aiThinking').textContent=actor.name+(p?' 正依自己的現金、持倉與策略決定交易…':' 正確認行情與持倉更新…');
  for(const child of $('humanActions').children)child.hidden=!['tradeForm','tradeDone'].includes(child.id);
  $('tradeForm').hidden=!human||!p||!m.items.length;$('tradeDone').hidden=!human;$('tradeDone').textContent=p?'完成本次交易':'確認更新並繼續';$('tradeDone').disabled=false;
  $('eventRoll').closest('.event-dice').hidden=true;$('manualForm').hidden=true;$('loanForm').closest('details').hidden=true;
  const source=session.byId.get(m.quoteCardId),effectLines=m.effectResults.map(r=>{
   const who=session.state.players.find(p=>p.id===r.playerId)?.name;
   return who+'：'+(r.type==='FUTURES_LIQUIDATION'?'強制平倉 '+r.name+' × '+r.quantity+'，返還保證金 '+U.money(r.margin)+'，價差損益 '+U.money(r.pnl)+'，手續費 '+U.money(r.fee)+'，現金變動 '+U.money(r.amount):r.type==='FORCED_SALE'?'強制賣出 '+r.name+' × '+r.quantity+'，入帳 '+U.money(r.amount):r.type==='UNEMPLOYMENT'?'符合 '+r.industry+' 員工失業條件，工作收入停止':r.type==='FORCED_PURCHASE'?'依觸發事件買進 '+r.name+' × '+r.quantity:r.message);
  });
  $('suggestion').textContent='行情對全體既有持倉生效；一般市場交易開放所有仍在遊戲中的玩家，特殊卡牌限制依牌面處理。'+(m.quoteCardId!==c.cardId?'\n本次報價來源：'+(source?.effective.title||m.quoteCardId):'')+(m.items.some(i=>i.asset==='futures')?'\n期貨只能做多；每口保證金 3,000，平倉每口手續費 3,000。':'')+(effectLines.length?'\n'+effectLines.join('\n'):'')+(m.issues.length?'\n待確認：'+m.issues.join('\n'):'');
  if(m.quoteCardId!==c.cardId){$('cardValues').replaceChildren();for(const i of m.items)$('cardValues').append(U.el('dt',i.name),U.el('dd',U.money(i.currentMarketPrice)));}
  $('marketQuoteTable')?.remove();
  if(m.items.some(i=>i.asset==='futures')){const table=U.el('table','');table.id='marketQuoteTable';const head=U.el('tr','');for(const label of ['商品','上期','本期'])head.append(U.el('th',label));table.append(head);for(const i of m.items){const row=U.el('tr','');for(const value of [i.name,i.previousMarketPrice===null?'—':U.money(i.previousMarketPrice),U.money(i.currentMarketPrice)])row.append(U.el('td',value));table.append(row);}$('suggestion').after(table);}
  $('tradeSide').value='buy';if(human&&p)populateTrade();
  if(c.category==='股東大會'){
   $('decisionTitle').textContent='股東大會持股結算';$('cardPlayer').textContent='觸發玩家：'+session.triggerPlayer.name;
   $('marketProgress')?.remove();$('tradeForm').hidden=true;$('tradeDone').textContent='確認結果並繼續';
   $('suggestion').textContent='只依本次既有股票持倉結算；沒有持有股票的玩家略過。'+(effectLines.length?'\n'+effectLines.join('\n'):'')+(m.issues.length?'\n待確認：'+m.issues.join('\n'):'');
  }
  U.account(session.state);persist();
 }
 async function driveMarket(){
  if(marketLoopRunning)return false;marketLoopRunning=true;
  try{
   while(session.marketPhase&&!paused){
    const p=session.trader;showPending();
    if((p||session.triggerPlayer).personality==='human'){busy=false;render();return false;}
    busy=true;render();await wait(500);if(paused)return false;
    if(!p){session.acknowledgeMarket();persist();render();continue;}
    const marketId=session.marketPhase.id,actions=ComputerPlayers.decideMarket(session);
    for(const a of actions)session.executeMarket(a.name,a.units,a.side,p.id,marketId,a.holdingId);
    session.completeMarket(p.id,marketId);persist();render();
   }
   return !session.marketPhase;
  }catch(e){busy=false;render();throw e;}finally{marketLoopRunning=false;}
 }
 function quoteTrade(){
  const name=$('tradeItem').value,side=$('tradeSide').value,item=session.marketItems().find(x=>x.name===name);
  if(!item){$('tradeEstimate').textContent=side==='sell'?'你沒有本張行情表可賣出的資產。':'沒有可交易商品。';$('tradeBuy').disabled=true;$('tradeMinus').disabled=true;$('tradePlus').disabled=true;return;}
  document.querySelector('label[for="tradeUnits"]').textContent=item.asset==='stocks'?(side==='buy'?'買幾張':'賣幾張'):item.asset==='futures'?'數量（口）':'數量（單位）';
  try{
   const holdingId=$('futuresLot')?.value||null,limits=session.tradeQuote(name,1,side,session.trader.id,session.marketPhase.id,holdingId),unit=item.asset==='futures'?'口':item.asset==='stocks'?'張':'單位';$('tradeUnits').max=limits.maxQuantity;$('tradeLimit').textContent=side==='buy'?'最多可買 '+limits.maxQuantity+' '+unit:'目前持有 '+limits.held+' '+unit+'，最多可賣 '+limits.maxQuantity+' '+unit;
   const quantity=Number($('tradeUnits').value),q=session.tradeQuote(name,quantity,side,session.trader.id,session.marketPhase.id,holdingId);
   $('tradeEstimate').textContent=(item.asset==='futures'?'月薪：'+U.money(q.quota.monthlySalary)+'\n本次最多 '+q.quota.maximum+' 口／已買 '+q.quota.used+' 口／剩餘 '+q.quota.remaining+' 口\n目前持倉：'+session.marketHoldings(name,item.asset).reduce((n,a)=>n+(a.quotedUnits||0),0)+' 口\n'+(side==='sell'?'買進價格：'+U.money(q.entryPrice)+'\n價差：'+U.money(q.spread)+'\n價差損益：'+U.money(q.pnl)+'\n扣除手續費後損益：'+U.money(q.netProfit)+'\n返還保證金：':'需要保證金：')+U.money(q.margin)+'\n':'')+'目前行情：'+U.money(q.unitPrice)+'\n數量：'+q.units+' '+unit+'\n手續費：'+U.money(q.fee)+'\n'+(side==='buy'?'預計扣款：':'結算現金變動：')+U.money(q.amount)+'\n目前現金：'+U.money(q.currentCash)+'\n成交後現金：'+U.money(q.remainingCash)+(q.allowed?'':'\n'+q.reason);
   $('tradeBuy').disabled=!q.allowed;$('tradeMinus').disabled=quantity<=1;$('tradePlus').disabled=quantity>=q.maxQuantity;
  }catch(e){$('tradeEstimate').textContent=e.message;$('tradeBuy').disabled=true;}
 }
 function selectTrade(){const item=session.marketItems().find(x=>x.name===$('tradeItem').value);$('tradePrice').textContent=item?U.money(item.currentMarketPrice)+(item.asset==='futures'?' 點':item.asset==='stocks'?' 元／股（每張 1,000 股）':' 元／單位'):'—';$('tradeUnits').value=1;$('tradeBuy').textContent=$('tradeSide').value==='buy'?'確認買進':'確認賣出';$('futuresLotLabel')?.remove();if(item?.asset==='futures'&&$('tradeSide').value==='sell'){const label=U.el('label','平倉持倉');label.id='futuresLotLabel';const select=U.el('select','');select.id='futuresLot';for(const a of session.marketHoldings(item.name,item.asset))select.append(new Option('進場 '+U.money(a.entryPrice)+' · '+a.quotedUnits+' 口',a.id));select.onchange=quoteTrade;label.append(select);$('tradeEstimate').before(label);}quoteTrade();}
 function populateTrade(){
  const previous=$('tradeItem').value,side=$('tradeSide').value;
  const items=session.marketItems().filter(item=>item.asset&&(side==='buy'||session.marketHoldings(item.name,item.asset).length));
  $('tradeItem').replaceChildren();for(const item of items)$('tradeItem').append(new Option(item.name+' · '+U.money(item.currentMarketPrice)+'／單位',item.name));
  if(items.some(i=>i.name===previous))$('tradeItem').value=previous;
  $('tradeUnavailable').textContent=session.marketItems().filter(i=>i.blockedBuy||i.blockedSell).map(i=>i.name+'：'+(i.blockedSell?'本次禁止交易':'本次禁止買進')).join(' ');
  selectTrade();
 }
 function setupTrade(){
  const items=session.marketItems(),show=items.length>0&&session.state.turn===0;$('tradeForm').hidden=!show;$('apply').hidden=show;$('tradeDone').hidden=!show;if(!show)return;
  for(const child of $('humanActions').children)child.hidden=!['tradeForm','tradeDone'].includes(child.id);
  $('tradeSide').value='buy';populateTrade();$('suggestion').textContent='成交價格依本張行情卡固定。選擇商品與數量，系統會直接更新現金及持倉。';
 }

 async function announce(){if(!session.state.freedomNotice)return;render();$('noticeName').textContent=session.state.freedomNotice+'，世界圈已開放，可以繼續遊戲。';if(session.state.turn===0){$('notice').showModal();await new Promise(resolve=>{$('noticeClose').onclick=()=>{$('notice').close();resolve();};});}else{$('phaseLabel').textContent=session.state.freedomNotice+' 進入財務自由圈！';await wait(900);}session.clearNotice();persist();}
 async function afterResolution(){if($('cardDialog').open)$('cardDialog').close();persist();render();await announce();session.end();persist();busy=false;render();if(!paused)runAI();}
 async function animateRoll(){
  busy=true;render();$('die').classList.add('rolling');await wait(450);const move=session.roll();persist();$('die').classList.remove('rolling');render(false);
  for(const index of move.route){U.position(session.active,index,move.zone);await wait(650/move.route.length);}render();
  return showPending();
 }
 async function runAI(){
  if(loopRunning||paused)return;loopRunning=true;
  try{
   while(!paused&&session.state.turn!==0){
    busy=true;U.setViewed(session.state.turn);render();
    if(session.state.phase==='ready'){await wait(650);if(paused)break;await animateRoll();}
    if(session.state.phase==='resolving'){
     if(session.bankPhase){showBank();break;}
     else if(session.marketPhase){if(!await driveMarket())break;}
     else{
     const c=showPending();await wait(800);if(paused)break;
     while(session.preview()?.waitingDice)session.rollEventDie();
     const decision=ComputerPlayers.decide(session.active,session.preview());
     try{if(c&&['buy','apply'].includes(decision.action))session.apply();else session.skip();}catch(e){logger({code:'AI_FALLBACK',text:e.message});session.skip();}
     if($('cardDialog').open)$('cardDialog').close();persist();render();await announce();
     }
    }
    if(session.state.phase==='done'){if($('cardDialog').open)$('cardDialog').close();await announce();session.end();persist();}render();
   }
  }catch(e){fail(e);}finally{loopRunning=false;busy=false;U.setViewed(session.bankApplicant?.id??session.state.turn);render();}
 }
 async function humanRoll(){if(busy||paused||session.state.turn!==0)return;try{const c=await animateRoll();if(session.bankPhase){showBank();return;}if(session.marketPhase){if(await driveMarket())await afterResolution();}else if(!c){session.finish();await afterResolution();}else{busy=false;render();}}catch(e){busy=false;fail(e);render();}}
 function act(fn){return async e=>{e?.preventDefault();if(busy||session.state.turn!==0)return;try{fn();busy=true;await afterResolution();}catch(err){busy=false;fail(err);render();}};}
 function openGame(saved){session=new GameData.play.Session(cards,BoardData,Math.random,saved,logger);paused=false;U.screen('game');U.board();render();if(session.state.phase==='resolving'){
  const c=showPending();if(session.bankPhase)return;if(session.marketPhase){driveMarket().then(done=>{if(done)return afterResolution();}).catch(fail);}else if(session.state.turn!==0)runAI();else if(!c){session.finish();afterResolution();}
 }else if(session.state.phase==='done'){afterResolution();}else if(session.state.turn!==0)runAI();}
 function setup(){drawn=false;U.screen('setup');$('playerName').disabled=false;$('begin').textContent='抽取職業卡 ✦';$('roles').replaceChildren(U.el('p','每位玩家各自從 14 種職業隨機抽取，可以抽到相同職業。'));
 }
 $('start').disabled=true;
 try{cards=await CardLibrary.load();$('loadStatus').textContent='392 筆卡牌已就緒 · 不需要網路';$('start').disabled=false;const saved=GameSave.read();$('continue').hidden=!saved;$('restart').hidden=!saved;$('start').hidden=!!saved;if(GameSave.error)$('loadStatus').textContent=GameSave.error;}catch(e){fail(e);return;}
 for(const r of BoardData.rules){$('rules').append(U.el('li',r));$('rulesCopy').append(U.el('p',r));}
 $('start').onclick=setup;$('restart').onclick=setup;$('back').onclick=()=>U.screen('welcome');
 $('begin').onclick=()=>{try{
  if(drawn){openGame(session.state);return;}
  session=new GameData.play.Session(cards,BoardData,Math.random,null,logger);session.start($('playerName').value);persist();drawn=true;
  const c=session.byId.get(session.state.players[0].characterId),f=c.effective.fields,b=U.el('article','','role selected');b.dataset.cardId=c.cardId;
  b.append(U.el('small','你抽到的職業'),U.el('strong',c.effective.title),U.el('span','★'.repeat(f.stars)),U.el('small','月收入 '+U.money(f.workIncome)+' / 支出 '+U.money(f.totalExpenses)),U.el('small','月現金流 '+U.money(f.monthlyCashflow)),U.el('small','初始儲蓄 '+U.money(f.startingSavings)));
  if(f.skill)b.append(U.el('small',f.skill,'skill'));$('roles').replaceChildren(b);$('playerName').disabled=true;$('begin').textContent='帶著這份職業，出發 ↗';
 }catch(e){fail(e);alert(e.message);}};
 $('continue').onclick=()=>{try{openGame(GameSave.read());}catch(e){fail(e);}};
 $('roll').onclick=humanRoll;
 $('tradeItem').onchange=selectTrade;$('tradeSide').onchange=populateTrade;$('tradeUnits').oninput=quoteTrade;
 $('tradeMinus').onclick=()=>{$('tradeUnits').value=Math.max(1,Number($('tradeUnits').value)-1);quoteTrade();};
 $('tradePlus').onclick=()=>{$('tradeUnits').value=Math.min(Number($('tradeUnits').max),Number($('tradeUnits').value)+1);quoteTrade();};
 $('tradeForm').onsubmit=e=>{e.preventDefault();if(busy||session.trader?.personality!=='human')return;try{const q=session.executeMarket($('tradeItem').value,Number($('tradeUnits').value),$('tradeSide').value,session.trader.id,session.marketPhase.id,$('futuresLot')?.value||null);persist();render();U.account(session.state);if(q.side==='sell')populateTrade();else quoteTrade();$('cardError').textContent=(q.side==='buy'?'買進':'賣出')+'完成：'+q.name+' × '+q.units+'，'+(q.side==='buy'?'扣款':'現金變動')+U.money(q.amount)+' 元；目前現金 '+U.money(q.remainingCash)+' 元。';}catch(err){fail(err);}};
 $('tradeDone').onclick=async()=>{if(busy||(session.trader||session.triggerPlayer)?.personality!=='human')return;busy=true;try{if(session.trader)session.completeMarket(session.trader.id,session.marketPhase.id);else session.acknowledgeMarket();persist();if(await driveMarket())await afterResolution();}catch(e){busy=false;fail(e);render();}};
 $('eventRoll').onclick=async()=>{
  if(busy||session.state.turn!==0)return;busy=true;
  const buttons=[...$('humanActions').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  try{const value=session.rollEventDie();persist();$('eventDie').classList.add('rolling');$('eventDiceResult').textContent='事件骰擲骰中…';await wait(450);$('eventDie').textContent=['⚀','⚁','⚂','⚃','⚄','⚅'][value-1];$('eventDiceResult').textContent='本次 '+value+' 點 · 已擲點數：'+session.state.pending.eventRolls.join('、');render();}
  catch(e){fail(e);}finally{$('eventDie').classList.remove('rolling');buttons.forEach(b=>b.disabled=false);busy=false;showPending();}
 };
 $('apply').onclick=async()=>{if(!session.preview()){$('manualForm').hidden=false;$('manualAmount').focus();return;}await act(()=>session.apply())();};
 $('skip').onclick=act(()=>session.skip());$('manualToggle').onclick=()=>{$('manualForm').hidden=!$('manualForm').hidden;if(!$('manualForm').hidden)$('manualAmount').focus();};
 $('manualForm').onsubmit=act(()=>session.manual({[$('manualField').value]:Number($('manualAmount').value)}));
 $('loanForm').onsubmit=e=>{e.preventDefault();try{session.borrow(Number($('loanAmount').value),Number($('loanInterest').value));persist();render();$('cardError').textContent='借款已記錄，請選擇購買或略過。';}catch(err){fail(err);}};
 $('cardDialog').addEventListener('cancel',e=>{e.preventDefault();if(!session.marketPhase&&session.state.turn===0&&!busy&&session.mandatoryPayment()===null&&session.dividend()?.kind!=='dividend'&&!session.shareholderMeeting())$('skip').click();});
 $('notice').addEventListener('cancel',e=>e.preventDefault());
 $('home').onclick=()=>{paused=true;persist();if($('cardDialog').open)$('cardDialog').close();U.screen('welcome');$('start').hidden=true;$('continue').hidden=false;$('restart').hidden=false;};
 $('settings').onclick=()=>$('rulesDialog').showModal();$('rulesClose').onclick=()=>$('rulesDialog').close();
 window.addEventListener('beforeunload',()=>{if(session)persist();});
})();

(function(root){
 const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(n),colors=['#318c78','#5d9acb','#b79655','#ca7865'];
 const el=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
 let viewed=0;
 function screen(id){for(const s of ['welcome','setup','game'])$(s).hidden=s!==id;}
 function board(){
  const palette={childbirth:'#d58f9c',bank:'#507c91',start:'#6b9e73',cashflow:'#6b9e73',stock:'#398dc9',property:'#249f78',business:'#da6560',life:'#c99226',investment:'#a68bc2',futures:'#9b79ae',bonds:'#698cac'};
  $('tiles').replaceChildren();for(const s of BoardData.spaces){const t=el('div','',`tile ${s.zone}`);t.id=s.id;t.style.left=s.position.x+'%';t.style.top=s.position.y+'%';t.style.width=s.size.width+'%';t.style.height=s.size.height+'%';t.style.setProperty('--tile',palette[s.type]);t.append(el('b',s.icon),el('span',s.label));$('tiles').append(t);}
  $('pawns').replaceChildren();for(let i=0;i<4;i++){const p=el('div',String(i+1),'pawn'+(i===0?' human':''));p.id='pawn-'+i;p.style.setProperty('--pawn',colors[i]);$('pawns').append(p);}
 }
 function position(p,index=p.position,zone=p.zone){const t=BoardData.zone(zone)[index],e=$('pawn-'+p.id);e.style.left=(t.position.x+(p.id%2?1:-1)*t.size.width*0.23)+'%';e.style.top=(t.position.y+(p.id>1?1:-1)*t.size.height*0.23)+'%';}
 function render(s,busy=false,positions=true){
  $('round').textContent='第 '+s.round+' 輪';$('turnName').textContent='目前回合：'+s.players[s.turn].name;
  const market=s.pending?.market,trader=market?s.players.find(p=>p.id===market.eligibleTraders?.[market.participantIndex]):null;
  $('phaseLabel').textContent=s.pending?.bank?'銀行貸款階段':trader?'市場交易階段 · '+trader.name:s.players[s.turn].personality==='human'?'輪到你了':'電腦玩家思考中…';
  $('playerTabs').replaceChildren();for(const p of s.players){const b=el('button','','player-tab'+(p.id===viewed?' selected':'')+(p.id===s.turn?' current':''));b.style.setProperty('--pawn',colors[p.id]);b.append(el('span',p.id===0?'◉':'●'),el('strong',p.id===0?'你':p.name.replace('AI・','')));b.title=p.name+' · '+p.occupation;b.onclick=()=>{viewed=p.id;render(s,busy);};$('playerTabs').append(b);if(positions)position(p);}
  for(const t of document.querySelectorAll('.tile.active'))t.classList.remove('active');$(s.players[s.turn].zone+'-'+s.players[s.turn].position).classList.add('active');
  const p=s.players[viewed];$('personName').textContent=p.name;$('occupation').textContent=p.occupation+' · '+(p.employment?.industry||'產業待指定')+' · '+'★'.repeat(p.stars);$('personType').textContent=viewed===0?'你的財務帳本':ComputerPlayers.profiles[p.personality].label+' · 財務帳本';$('personAvatar').style.setProperty('--pawn',colors[viewed]);
  $('cashflow').textContent=(p.monthlyCashflow>=0?'+':'')+money(p.monthlyCashflow);$('income').textContent=money(p.totalIncome);$('expense').textContent=money(p.totalExpense);$('cash').textContent='$ '+money(p.cash)+(p.cash<0?' · 現金缺口':'');
  $('goalText').textContent=p.financialFreedom?'已進入財務自由圈':'目前目標：持續性收入 > 總支出';$('goalProgress').value=p.totalExpense>0?Math.max(0,Math.min(1,p.passiveIncome/p.totalExpense)):(p.passiveIncome>0?1:0);$('passive').textContent='持續性收入 '+money(p.passiveIncome)+' / 總支出 '+money(p.totalExpense);
  $('holdings').replaceChildren();for(const [label,value] of [['小孩',p.children],['股票',p.assets.stocks.length+' 筆'],['房地產',p.assets.properties.length+' 間'],['事業',p.assets.businesses.length+' 家'],['期貨',p.assets.futures.length+' 筆'],['基金',p.assets.funds.length+' 筆'],['債券',p.assets.bonds.length+' 筆'],['貸款',money(p.debtTotal)]]){const d=el('div',label);d.append(el('b',String(value)));$('holdings').append(d);}
  if(p.assets.securities?.length){const d=el('div','其他債券基金');d.append(el('b',p.assets.securities.length+' 筆'));$('holdings').append(d);}
  const detail=$('financialDetails');detail.replaceChildren();const dl=el('dl','');for(const [k,v] of [['工作收入',p.salaryIncome],['持續性收入',p.passiveIncome],['基本支出',p.livingExpense],['小孩支出',p.childExpense],['貸款利息',p.loanInterest],['房產支出',p.propertyExpense],['事業支出',p.businessExpense]])dl.append(el('dt',k),el('dd',money(v)));detail.append(dl);
  if(p.skill)detail.append(el('p','角色技能：'+p.skill+(p.characterId==='characters-005'?'（股價骰未定，請人工處理）':'')));
  for(const a of Object.values(p.assets).flat())detail.append(el('p',a.name+' · '+a.units+' 單位 · 月收入 '+money(a.income)));
  for(const l of Object.values(p.liabilities).flat())detail.append(el('p','貸款 '+money(l.principal)+' · 月息 '+money(l.monthlyPayment)));
  $('events').replaceChildren();for(const e of s.events.slice(-8).reverse()){const li=el('li','');li.append(el('small','第'+e.round+'輪'),document.createTextNode(e.text));$('events').append(li);}
  $('die').textContent=s.dice?['⚀','⚁','⚂','⚃','⚄','⚅'][s.dice-1]:'⚀';$('roll').disabled=busy||s.turn!==0||s.phase!=='ready';$('roll').textContent=s.turn===0?'擲骰子 ↗':'電腦玩家思考中…';$('actionStatus').textContent=s.turn===0?(s.phase==='resolving'?'請處理抽到的卡牌':'輪到你了，擲骰出發'):'電腦玩家思考中…';
 }
 function account(s){
  const market=s.pending?.market,p=(market?s.players.find(p=>p.id===market.eligibleTraders?.[market.participantIndex]):null)||s.players[s.turn],d=$('tradeAccount'),expanded=d.querySelector('details')?.open;d.replaceChildren();d.append(el('strong',p.name+' · '+p.occupation+' · '+(p.employment?.industry||'產業待指定')+(market?.status==='trading'?' · 目前交易玩家':'')));
  const dl=el('dl','');for(const [label,value] of [['可用現金',p.cash],['月現金流',p.monthlyCashflow],['月收入',p.totalIncome],['月支出',p.totalExpense],['貸款本金',p.debtTotal]])dl.append(el('dt',label),el('dd',money(value)));d.append(dl);
  const holdings=Object.values(p.assets).flat(),list=el('details','');list.open=!!expanded;list.append(el('summary','目前持倉（'+holdings.length+' 筆）'));if(!holdings.length)list.append(el('p','尚無投資'));for(const a of holdings)list.append(el('p',a.name+' × '+a.units+' · 成本 '+money(a.cost)+(a.incomeStatus==='unconfirmed'?' · 配息待確認':'')));d.append(list);
 }
 function card(s,c,o){
  account(s);
  $('drawnCard').style.setProperty('--deck',CardLibrary.color(c));$('cardCategory').textContent=c.category;$('cardTitle').textContent=c.effective.title||c.effective.titleCandidate||'標題待確認';$('cardEffect').textContent=c.effective.effect||'數值詳見下表';$('cardValues').replaceChildren();for(const [k,v] of Object.entries(c.effective.fields||{}))$('cardValues').append(el('dt',k),el('dd',typeof v==='object'?JSON.stringify(v):String(v)));
  $('cardPlayer').textContent=s.players[s.turn].name+' / '+c.gameModule;$('cardError').textContent='';$('manualForm').hidden=true;$('manualAmount').value='';
  const rolls=s.pending?.eventRolls||[];$('eventDie').textContent=rolls.length?['⚀','⚁','⚂','⚃','⚄','⚅'][rolls.at(-1)-1]:'⚀';$('eventDiceResult').textContent=rolls.length?'已擲點數：'+rolls.join('、'):'依牌面需要擲骰；不移動棋子。';
  $('suggestion').textContent=o?.kind==='purchase'?'支付 '+money(o.cost)+' 元；月收入 '+money(o.income)+' 元'+(o.loan?'；牌面房貸 '+money(o.loan)+' 元，月息 '+money(o.expense)+' 元':'')+'。'+(o.explanation||''):o?.kind==='auto'?'此效果可由資料層直接結算。':c.rulesStatus==='printed-value-review'?'原印刷數值待確認。請查閱牌面，再人工輸入金額或略過。':'此效果需人工判斷。套用會開啟人工結算，不會推測金額。';
  $('apply').textContent=o?.kind==='purchase'?'購買／套用':'套用';$('humanActions').hidden=s.turn!==0;$('aiThinking').hidden=s.turn===0;$('decisionTitle').textContent=s.turn===0?'你的下一步？':'電腦玩家思考中…';if(!$('cardDialog').open)$('cardDialog').showModal();
 }
 root.GameUI={$ ,money,el,screen,board,render,position,card,account,setViewed:id=>{viewed=id;}};
})(globalThis);

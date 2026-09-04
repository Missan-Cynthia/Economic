(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameData = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const modules = {
    '角色系統': ['角色'],
    '房地產系統': ['市區房地產','郊區房地產','一般住宅','投資套房','房產機會與風險'],
    '事業系統': ['事業','創業','加盟','事業機會與風險'],
    '生活／支出系統': ['生活','支出','保險'],
    '股票系統': ['股東大會','新聞報導股票行情','股票投資','現金股利'],
    '期貨系統': ['期貨行情','詭譎市場'],
    '債券基金系統': ['債券＆基金行情'],
    '投資事件': ['投資機會']
  };
  const categoryModule = Object.fromEntries(Object.entries(modules).flatMap(([m, cats]) => cats.map(c => [c,m])));
  const printedReviews = new Set(['daily-life-072','bond-fund-001','bond-fund-007','futures-market-007']);
  const titleOnly = new Set(['real-estate-city-022','daily-life-025','daily-life-041']);
  const clone = x => x === undefined ? null : JSON.parse(JSON.stringify(x));
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const cleanObject = x => x && typeof x === 'object' && !Array.isArray(x);
  const numericTree = x => typeof x === 'number' ? Number.isFinite(x) : cleanObject(x) && Object.keys(x).length > 0 && Object.entries(x).every(([k,v]) => !['__proto__','constructor','prototype'].includes(k) && numericTree(v));
  function overlay(source, corrections) {
    const card = clone(source); card.normalizedValueOverride = undefined; card.reviewDecision = 'unreviewed'; card.corrections = [];
    for (const c of corrections.filter(x => x.cardId === source.cardId)) {
      if(c.field === 'title' || c.field === 'effect') card[c.field] = c.newValue;
      else if(c.field === 'normalizedValue') card.normalizedValueOverride = clone(c.newValue);
      else if(c.field === 'reviewDecision') card.reviewDecision = c.newValue;
      else if(c.field.startsWith('fields.')) { const k=c.field.slice(7); if(Object.hasOwn(card.fields || {},k)) card.fields[k]=clone(c.newValue); }
      card.corrections.push(c);
    }
    return card;
  }
  function currentField(source, corrections, field) {
    const c=overlay(source,corrections);
    if(field === 'normalizedValue') return derive(source,corrections).normalizedValue;
    if(field.startsWith('fields.')) return clone(c.fields?.[field.slice(7)]);
    return clone(c[field]);
  }
  function validateCorrection(source, corrections, proposal) {
    if(!source || proposal.cardId !== source.cardId) throw Error('找不到cardId');
    const f=proposal.field, v=proposal.newValue;
    const allowed = ['title','effect','normalizedValue','reviewDecision'].includes(f) || (typeof f==='string' && f.startsWith('fields.') && Object.hasOwn(source.fields || {},f.slice(7)) && typeof source.fields[f.slice(7)] === 'number');
    if(!allowed) throw Error('不允許修改此欄位');
    if(['title','effect'].includes(f) && (typeof v !== 'string' || !v.trim() || v.length > 20000)) throw Error('文字不得留白或超過20000字');
    if(f.startsWith('fields.') && (typeof v !== 'number' || !Number.isFinite(v))) throw Error('請輸入有效數值');
    if(f==='normalizedValue' && !numericTree(v)) throw Error('normalizedValue必須是有限數字，或只含數字的JSON物件');
    if(f==='reviewDecision' && !['confirmed-original','deferred'].includes(v)) throw Error('無效驗收動作');
    if(typeof proposal.note !== 'string' || proposal.note.length > 4000) throw Error('備註格式錯誤');
    if(!equal(currentField(source,corrections,f),proposal.oldValue)) throw Error('資料已被另一個視窗更新，請重新載入後再儲存');
    return true;
  }
  // Only whole, exact effect strings are compiled; partial regex matches never execute.
  function compile(card) {
    const e=card.effect || '', cat=card.category;
    if(cat==='角色' && card.fields && !card.fields.skill && /^每生一個小孩支出\+\d+元$/.test(card.fields.childText))
      return {op:'initialize-character', values:clone(card.fields), requiredInput:[]};
    if(cat==='支出') {
      const m=e.match(/^職業★花費(\d+)元；★★花費×2；★★★花費×3(；如有保險卡則不須支付此費用)?$/);
      if(m) return {op:'star-expense',baseAmount:Number(m[1]),insuranceExempt:!!m[2],requiredInput:m[2]?['cash','stars','hasInsurance']:['cash','stars']};
    }
    if(cat==='債券＆基金行情' || (['新聞報導股票行情','期貨行情'].includes(cat) && card.title==='新聞報導'))
      return {op:'set-market-quotes',market:cat,values:clone(card.fields),requiredInput:[]};
    if(cat==='生活') {
      let m=e.match(/^(?:花費|支出)(\d+)元$/);
      if(m) return {op:'cash-delta',amount:-Number(m[1]),requiredInput:['cash']};
      const exact={
        '洗+剪+燙花費5000元':-5000,'愛心捐款1000元幫助失學兒童':-1000,'獲得績效獎金3000元':3000,
        '買新衣服，花費3000元':-3000,'中統一發票1000元':1000,'包3000元白包':-3000,'包紅包3000元':-3000
      };
      if(Object.hasOwn(exact,e)) return {op:'cash-delta',amount:exact[e],requiredInput:['cash']};
      m=e.match(/^(月收入|月支出)(?:加|\+)(\d+)元$/);
      if(m) return {op:m[1]==='月收入'?'monthly-income-delta':'monthly-expense-delta',amount:Number(m[2]),requiredInput:[m[1]==='月收入'?'monthlyIncome':'monthlyExpenses']};
    }
    return null;
  }
  function cardType(c) {
    if(c.category==='角色')return 'character';
    if(c.category==='股東大會')return 'dividend-table';
    if(['新聞報導股票行情','期貨行情','債券＆基金行情'].includes(c.category))return 'market-table';
    if(c.category==='股票投資')return 'stock-asset';
    if(c.category==='現金股利')return 'cash-dividend';
    if(c.category==='保險')return 'insurance';
    if(['一般住宅','投資套房'].includes(c.category))return 'property-asset';
    if(c.category==='支出')return 'expense';
    if(['創業','加盟'].includes(c.category)&&/投資成本/.test(c.effect || ''))return 'business-asset';
    return 'event';
  }
  function derive(source, corrections=[]) {
    const c=overlay(source,corrections), notes=(source.contentReviewNotes || []).join(' ');
    const printed=printedReviews.has(c.cardId) || /印刷|混印/.test(notes);
    const textOnly=titleOnly.has(c.cardId);
    const missing=/待確認|暫○|出框|裁掉|遮住|骰子顆數|邊界|收入\/支出|混印/.test(notes+' '+(c.effect || ''));
    const editedRules=c.corrections.some(x=>x.field==='effect'||x.field==='normalizedValue'||x.field.startsWith('fields.'));
    const correctedNumbers=c.corrections.some(x=>x.field==='normalizedValue'||x.field.startsWith('fields.'));
    const contentBlock=!!source.contentNeedsReview && !textOnly;
    let plan=compile(c), status='ready', reason='已有完整且已實作的處理器';
    if(printed && !correctedNumbers) {status='printed-value-review';reason='原印刷值需確認；不自動更正或套用';plan=null;}
    else if(editedRules){status='corrected-rules-review';reason='人工修正已套用，執行語意仍需確認／實作';plan=null;}
    else if(contentBlock || (missing && !textOnly)){status='incomplete-rules';reason='規則文字、數值或邊界尚不完整／明確';plan=null;}
    else if(!plan){status=textOnly?'title-review-manual':'manual-required';reason='目前沒有完整可執行處理器；不推測選擇、結算、骰數或隱含規則';}
    else if(textOnly && !c.corrections.some(x=>x.field==='title'))status='title-review';
    let normalized=plan ? (plan.values ? clone(plan.values) : (plan.op==='star-expense'?{baseAmount:plan.baseAmount}:{amount:plan.amount})) : clone(c.fields);
    if(printed && !correctedNumbers)normalized=null;
    if(c.normalizedValueOverride!==undefined)normalized=clone(c.normalizedValueOverride);
    const enabled=!(printed&&!correctedNumbers) && !contentBlock && !(missing&&!textOnly) && !editedRules;
    const game={cardId:c.cardId,category:c.category,sourceImages:clone(source.sourceImages),gameModule:categoryModule[c.category],cardType:cardType(c),
      autoResolvable:!!plan,manualResolution:!plan,originalPrintedValue:{effect:clone(source.effect),fields:clone(source.fields)},
      normalizedValue:normalized,rulesStatus:status,drawWeight:1,enabled,
      physicalDuplicateHint:source.quantityLowerBound>1?{quantityLowerBound:source.quantityLowerBound,note:'實體重複提示，不影響drawWeight'}:null,
      resolutionReason:reason,resolver:plan,reviewDecision:c.reviewDecision,
      effective:{title:c.title,titleCandidate:c.titleCandidate,effect:c.effect,fields:c.fields},correctionCount:c.corrections.length};
    if(!game.gameModule)throw Error('分類缺少模組映射：'+c.category);
    return game;
  }
  function requireNumber(input,key,integer=false) {
    const v=input[key];if(typeof v!=='number'||!Number.isFinite(v)||(integer&&!Number.isInteger(v)))throw Error('缺少或無效輸入：'+key);return v;
  }
  function resolve(card,input={}) {
    if(!card.enabled||!card.autoResolvable||!card.resolver)throw Error('此卡需要人工判斷，不能自動執行');
    const p=card.resolver;
    // Pure data projection; no game loop, random dice, loans, bankruptcy or implicit payment policy.
    if(p.op==='initialize-character')return {character:clone(p.values)};
    if(p.op==='set-market-quotes')return {market:p.market,quotes:clone(p.values)};
    let key='cash',delta=p.amount;
    if(p.op==='star-expense') {
      const stars=requireNumber(input,'stars',true);if(stars<1||stars>3)throw Error('職業星數必須為1至3');
      if(p.insuranceExempt && typeof input.hasInsurance!=='boolean')throw Error('請明確提供hasInsurance');
      delta=p.insuranceExempt&&input.hasInsurance?0:-p.baseAmount*stars;
    } else if(p.op==='monthly-income-delta')key='monthlyIncome';
    else if(p.op==='monthly-expense-delta')key='monthlyExpenses';
    else if(p.op!=='cash-delta')throw Error('未知處理器');
    const before=requireNumber(input,key),after=before+delta;
    if(!Number.isFinite(after))throw Error('結果超出數值範圍');
    if(key==='cash' && after<0)throw Error('現金不足；借款或清償方式需要人工判斷');
    return {field:key,before,delta,after};
  }
  function weightedDraw(cards,rng=Math.random) {
    const pool=cards.filter(c=>c.enabled && Number.isFinite(c.drawWeight)&&c.drawWeight>0);
    if(!pool.length)throw Error('無啟用卡牌');
    const r=rng();if(typeof r!=='number'||!Number.isFinite(r)||r<0||r>=1)throw Error('亂數必須介於0（含）至1（不含）');
    let cursor=r*pool.reduce((sum,c)=>sum+c.drawWeight,0);
    for(const c of pool){cursor-=c.drawWeight;if(cursor<0)return c;}
    return pool[pool.length-1];
  }
  function summarize(cards) {return {total:cards.length,autoResolvable:cards.filter(c=>c.autoResolvable).length,manualResolution:cards.filter(c=>c.manualResolution).length,enabled:cards.filter(c=>c.enabled).length};}
  return {modules,categoryModule,derive,overlay,resolve,weightedDraw,summarize,validateCorrection,currentField};
});

// Phase 3 extends the existing data engine; all player mutations stay here.
(function(root){
 const G=typeof module==='object'?module.exports:root.GameData;
 const copy=x=>JSON.parse(JSON.stringify(x));
 const num=v=>{if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e14)throw Error('金額必須是有限數值，且不超過100兆');return v;};
 const total=xs=>xs.reduce((s,x)=>s+x,0);
 // Strict decimal/Chinese-unit amounts; reject shorthand such as 4萬5.
 function moneyValue(value){
  if(typeof value==='number')return Number.isFinite(value)&&value>=0&&value<=1e14?value:null;
  if(typeof value!=='string')return null;
  const s=value.replace(/,/g,'').replace(/元$/,'').trim();
  if(/^\d+(?:\.\d+)?$/.test(s))return moneyValue(Number(s));
  const big=s.match(/^(.*?)(億|萬)(.*)$/);
  if(big){const a=moneyValue(big[1]),b=big[3]?moneyValue(big[3]):0;
   if(a===null||b===null||(big[3]&&!/[千百萬億]/.test(big[3])))return null;
   return moneyValue(a*(big[2]==='億'?1e8:1e4)+b);}
  if(!/^(?:\d+(?:\.\d+)?千)?(?:\d+(?:\.\d+)?百)?$/.test(s)||!s)return null;
  return moneyValue(total([...s.matchAll(/(\d+(?:\.\d+)?)(千|百)/g)].map(m=>+m[1]*(m[2]==='千'?1000:100))));
 }
 const propertyAliases={propertyPrice:['propertyPrice','總價','售價','房價'],downPayment:['downPayment','頭期','頭期款','自備款'],monthlyInterest:['monthlyInterest','月付利息','每月利息','月利息','月息'],monthlyPayment:['monthlyPayment','月付'],monthlyRent:['monthlyRent','可租','可出租','月可租','租金','月租','每月租金','每月收租'],loanPrincipal:['loanPrincipal','銀行貸款','貸款本金']};
 function normalizeProperty(c){
  if(!c)return null;
  const v=c.effective||c,f=v.fields||{},e=v.effect||'',out={},errors=[];
  if(/骰|如果|擲|所有玩家|另付|條件|待確認/.test(e))return null;
  const add=(key,value)=>{if(value===null){errors.push('數值格式不明：'+key);return;}if(out[key]!==undefined&&out[key]!==value)errors.push('數值衝突：'+key);out[key]=value;};
  // Explicit all-cash purchase has no mortgage; a missing rent is still missing.
  const cashPurchase=e.match(/(?:^|；)(?:現金)?([0-9.,億萬千百]+元?)一次付清(?:；|$)/);
  if(cashPurchase){const price=moneyValue(cashPurchase[1]);add('propertyPrice',price);add('downPayment',price);add('monthlyInterest',0);}
  const leadingPrice=e.match(/^([0-9.,億萬千百]+元?)；頭期/);
  if(leadingPrice&&/出售$/.test(v.title||''))add('propertyPrice',moneyValue(leadingPrice[1]));
  for(const [name,value] of Object.entries(f)){
   const m=name.match(/^(.*?)(?:[（(](萬元|元)[）)])?$/);
   const key=Object.keys(propertyAliases).find(k=>propertyAliases[k].includes(m[1]));
   if(key){const n=moneyValue(value);add(key,n===null?null:n*(m[2]==='萬元'?10000:1));}
  }
  for(const part of e.split(/[；;。\n]/).map(x=>x.trim()).filter(Boolean)){
   if(part==='無頭期款'){add('downPayment',0);continue;}
   for(const [key,names] of Object.entries(propertyAliases)){
    const m=part.match(new RegExp('^(?:'+names.join('|')+')(?:[（(](萬元|元)[）)])?[:：]?([0-9.,億萬千百]+元?)$'));
    if(m){const n=moneyValue(m[2]);add(key,n===null?null:n*(m[1]==='萬元'?10000:1));}
   }
   const repair=part.match(/^需([0-9.,億萬千百]+元?)(?:整修|裝潢)$/);if(repair)add('renovationCost',moneyValue(repair[1]));
  }
  const required=['propertyPrice','downPayment','monthlyRent'];
  if(out.monthlyInterest===undefined&&out.monthlyPayment===undefined)return null;
  if(out.monthlyInterest!==undefined&&out.monthlyPayment!==undefined&&out.monthlyInterest!==out.monthlyPayment)return null;
  if(!required.every(k=>out[k]!==undefined)||errors.length)return null;
  if(out.propertyPrice<=0||out.downPayment>out.propertyPrice)return null;
  const loan=out.propertyPrice-out.downPayment;
  if(out.loanPrincipal!==undefined&&out.loanPrincipal!==loan)return null;
  const monthlyDebtPayment=out.monthlyInterest??out.monthlyPayment;
  return {...out,monthlyDebtPayment,loanPrincipal:loan,monthlyNetCashflow:out.monthlyRent-monthlyDebtPayment,renovationCost:out.renovationCost||0};
 }
 function propertyPurchaseHandler(c){
  if(!c||['printed-value-review','incomplete-rules','corrected-rules-review'].includes(c.rulesStatus))return null;
  const v=normalizeProperty(c);if(!v)return null;
  return {kind:'purchase',type:'PROPERTY_PURCHASE',asset:'properties',cost:v.downPayment+v.renovationCost,value:v.propertyPrice,loan:v.loanPrincipal,expense:v.monthlyDebtPayment,income:v.monthlyRent,units:1,...v};
 }
 function upgradeCard(c){return classifyCard(upgradeCardCore(c));}
 function classifyCard(c){
  const text=(c.effective?.title||c.title||'')+' '+(c.effective?.effect||c.effect||'');
  const categories=['股市行情','股票行情','股東大會','新聞報導股票行情','期貨行情','詭譎市場','債券＆基金行情','投資行情','市場報價'];
  const market=categories.includes(c.category)||c.eventType==='MARKET_EVENT'||!!c.marketQuotes||c.resolver?.op==='set-market-quotes'||(/行情|市場報價/.test(text)&&Object.values(c.effective?.fields||c.fields||{}).some(v=>typeof v==='number'));
  const eventScopes=market?['GLOBAL_MARKET_UPDATE','HOLDING_DEPENDENT_EVENT']:['CURRENT_PLAYER_EVENT'];
  if(c.category==='詭譎市場')eventScopes.unshift('CURRENT_PLAYER_EVENT');
  if(/失業|員工/.test(text))eventScopes.push('QUALIFIED_PLAYER_EVENT');
  if(c.category==='期貨行情')eventScopes.push('QUALIFIED_PLAYER_RULE');
  return {...c,eventType:market?'MARKET_EVENT':'PLAYER_EVENT',eventScopes,effectScope:c.category==='詭譎市場'?'CURRENT_PLAYER':market?'MARKET_ALL_PLAYERS':c.resolver?.allPlayers||/所有玩家|全場玩家/.test(text)?'ALL_PLAYERS':c.effectScope==='QUALIFIED_PLAYERS'?'QUALIFIED_PLAYERS':'CURRENT_PLAYER'};
 }
 function upgradeCardCore(c){
  const p=propertyPurchaseHandler(c);
  if(p)return {...c,autoResolvable:true,manualResolution:false,cardType:'PROPERTY_PURCHASE',rulesStatus:'ready',normalizedValue:normalizeProperty(c),resolver:{op:'PROPERTY_PURCHASE'},resolutionReason:'完整房產數值：共用購買處理器'};
  if(['printed-value-review','incomplete-rules','corrected-rules-review'].includes(c.rulesStatus))return c;
  const stateRule=compileStateRule(c);
  if(stateRule)return {...c,autoResolvable:true,manualResolution:false,resolver:{op:'state-rule',...stateRule},resolutionReason:'依既有帳本／明確骰數自動結算'};
  const sale=compileSale(c);if(sale)return {...c,autoResolvable:true,manualResolution:false,resolver:{op:'property-sale',...sale},resolutionReason:'牌面固定收購價格，選擇持有房產並自動清償房貸'};
  if(['新聞報導股票行情','期貨行情'].includes(c.category)&&!c.effective.effect&&!/員工|失業|配股|平倉|停止交易|不能交易/.test(c.effective.title||'')&&Object.values(c.effective.fields||{}).length&&Object.values(c.effective.fields).every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0))return {...c,autoResolvable:true,manualResolution:false,resolver:{op:'set-market-quotes',market:c.category,values:copy(c.effective.fields)},resolutionReason:'既有行情表處理器（不推測期貨合約交易條件）'};
  const e=c.effective?.effect||'';let m,plan;
  if((m=e.match(/^(?:支出|花費|損失|賠償|修繕費用)([\d.,萬千百億]+元?)$/))&&moneyValue(m[1])!==null)plan={op:'cash-delta',amount:-moneyValue(m[1])};
  if((m=e.match(/^(?:獲得獎金|獲得|獲利|收入)([\d.,萬千百億]+元?)$/))&&moneyValue(m[1])!==null)plan={op:'cash-delta',amount:moneyValue(m[1])};
  if(plan)return {...c,autoResolvable:true,manualResolution:false,resolver:plan,rulesStatus:'ready',resolutionReason:'完整固定金額規則'};
  const existing=offer(c);
  if(existing?.kind==='purchase')return {...c,autoResolvable:true,manualResolution:false,resolver:{op:'asset-purchase'},resolutionReason:'既有資產購買處理器'};
  if(c.category==='現金股利'&&/^領取現金\d+元\/張。?（此收入為一次性領取）$/.test(e))return {...c,autoResolvable:true,manualResolution:false,resolver:{op:'cash-dividend'},resolutionReason:'按實際股票持倉配息'};
  return c;
 }
 function compileStateRule(c){
  const e=c.effective?.effect||'';let m;
  if((m=e.match(/^花費金額(\d+)元。（如果手中沒有房產則不需支付）$/)))return {field:'cash',amount:-Number(m[1]),holding:'properties'};
  if((m=e.match(/^損失金額(\d+)元。（如果你手頭有創業或加盟的話）$/)))return {field:'cash',amount:-Number(m[1]),holding:'businesses'};
  if(e==='繳納手中所有房產每月收租×2。（如果手中沒有房產則不需支付）')return {field:'cash',factor:-2,metric:'rent'};
  if(e==='租金總收入少收一次')return {field:'cash',factor:-1,metric:'rent'};
  if(e==='持有房屋數乘以1000元')return {field:'cash',factor:-1000,metric:'propertyCount'};
  if(e==='領一個月薪水')return {field:'cash',factor:1,metric:'salary'};
  if(e==='少一半現金')return {field:'cash',factor:-0.5,metric:'cash'};
  if(e==='過年包6000元紅包給父母；有小孩者，每位小孩紅包1000元')return {field:'cash',amount:-6000,childAmount:-1000};
  if((m=e.match(/^所有房屋[、]?土地；每[間件]收買價(\d+)%$/)))return {field:'cash',factor:-Number(m[1])/100,metric:'propertyValue',allPlayers:/所有玩家/.test(c.effective.title||'')};
  if((m=e.match(/^(?:花費|支出)(\d+)元；無小孩者免$/)))return {field:'cash',amount:-Number(m[1]),childrenRequired:true};
  if((m=e.match(/^每個小孩(?:每月增加支出|\+)(\d+)元(?:月支出)?；無小孩者免$/)))return {field:'manualChildExpense',factor:Number(m[1]),metric:'children'};
  if((m=e.match(/^每月支出增加(\d+)元；(有小孩者免|已創業者免)$/)))return {field:'livingExpense',amount:Number(m[1]),exempt:m[2]};
  if(e==='扣獎金1000元；已創業者免')return {field:'cash',amount:-1000,exempt:'已創業者免'};
  if((m=e.match(/^花費(\d+)元；有小孩者另加每位小孩花費(\d+)元$/)))return {field:'cash',amount:-Number(m[1]),childAmount:-Number(m[2])};
  if((m=e.match(/^擲([12])顆骰子；點數乘以(\d+)為花費(?:金額)?$/)))return {field:'cash',dice:Number(m[1]),dieFactor:-Number(m[2])};
  if(e==='捐一顆骰子×1000')return {field:'cash',dice:1,dieFactor:-1000};
  if(e==='擲1顆骰子；點數1-4損失5萬元；點數5-6損失20萬元')return {field:'cash',dice:1,outcomes:[-50000,-50000,-50000,-50000,-200000,-200000]};
  if(e==='擲1顆骰子；點數1-3被騙5萬元；點數4-6聰明沒被騙')return {field:'cash',dice:1,outcomes:[-50000,-50000,-50000,0,0,0]};
  if(e==='擲1顆骰子；點數1-3國內旅遊花費10000元；點數4-6為國外旅遊花費30000元；有小孩者另加每位小孩花費5000元')return {field:'cash',dice:1,outcomes:[-10000,-10000,-10000,-30000,-30000,-30000],childAmount:-5000};
  return null;
 }
 function stateRulePreview(c,p,rolls=[]){
  const r=c?.resolver;if(r?.op!=='state-rule')return null;
  if(r.dice&&rolls.length<r.dice)return {kind:'state-auto',waitingDice:true,dice:r.dice,message:'請擲 '+r.dice+' 顆事件骰，系統會依結果計算。'};
  const exempt=(r.holding&&!p.assets[r.holding].some(a=>a.units>0))||(r.childrenRequired&&!p.children)||(r.exempt==='有小孩者免'&&p.children>0)||(r.exempt==='已創業者免'&&p.assets.businesses.length>0);
  const metrics={rent:total(p.assets.properties.map(a=>a.income)),propertyValue:total(p.assets.properties.map(a=>a.value)),propertyCount:p.assets.properties.length,salary:p.salaryIncome,cash:p.cash,children:p.children};
  let amount=r.amount??(r.metric?r.factor*metrics[r.metric]:r.outcomes?r.outcomes[rolls[0]-1]:r.dieFactor*total(rolls));
  amount+=r.childAmount?r.childAmount*p.children:0;if(exempt)amount=0;
  return {kind:'state-auto',field:r.field,amount:num(amount),message:exempt?'不符合持有條件或符合豁免，本卡無影響。':'系統結算：'+r.field+' '+(amount>=0?'+':'')+amount+' 元。'};
 }
 function compileSale(c){
  if(!['市區房地產','郊區房地產'].includes(c.category))return null;
  const title=c.effective.title||'',m=(c.effective.effect||'').match(/^(?:出價?|出售)([\d.,萬千百億]+元?)$/);
  if(!m||!/^買方急[尋購]/.test(title)||moneyValue(m[1])===null)return null;
  const target=title.replace(/^買方急[尋購]/,'').replace(/二房|2房/g,'兩房');
  const tokens=target.match(/市區|郊區|套房|兩房|三房|透天|公寓|別墅|店面|電梯|華廈|華夏|捷運/g);
  if(!tokens||tokens.join('')!==target)return null;
  return {price:moneyValue(m[1]),tokens};
 }
 function offer(c){
  const property=propertyPurchaseHandler(c);if(property)return property;
  if(['printed-value-review','incomplete-rules','corrected-rules-review'].includes(c.rulesStatus))return null;
  const e=c.effective.effect||'',f=c.effective.fields||{};let m;
  if(c.category==='股票投資'&&(m=e.match(/^起始股價([\d.]+)元；股價範圍[\d.]+～[\d.]+元；年配息([\d.]+)元；一張股票：股價×1000；股息收入([\d.]+)元。$/)))
   return {kind:'purchase',asset:'stocks',cost:+m[1]*1000,value:+m[1]*1000,income:+m[3],expense:0,loan:0,units:1000,explanation:'購買一張＝1000股；月股息依牌面列示（年配息÷12）。'};
  if(['創業','加盟'].includes(c.category)&&(m=e.match(/^投資成本([\d.]+)萬元；股東收入([\d.]+)元。$/)))
   return {kind:'purchase',asset:'businesses',cost:+m[1]*10000,value:+m[1]*10000,income:+m[2],expense:0,loan:0,units:1};
  if(c.autoResolvable&&!['initialize-character','PROPERTY_PURCHASE'].includes(c.resolver?.op))return {kind:'auto'};
  return null;
 }
 function calculate(p){
  // monthlySalary is an alias, not a second independent salary balance.
  if(p.salaryIncome===undefined)p.salaryIncome=p.monthlySalary||0;
  Object.defineProperty(p,'monthlySalary',{enumerable:true,configurable:true,get(){return this.salaryIncome;},set(value){this.salaryIncome=num(value);}});
  p.isStudent??=/學生/.test(p.occupation||'');p.isEmployed??=!p.isStudent&&!p.employment?.unemployed&&p.salaryIncome>0;
  p.passiveIncome=num(p.basePassiveIncome+p.manualPassiveIncome+total(Object.values(p.assets).flat().map(a=>a.income)));
  p.childExpense=num(p.manualChildExpense+(p.childUnitExpense||0)*p.children);
  p.loanInterest=num(total(Object.values(p.liabilities).flat().map(l=>l.monthlyPayment)));
  p.propertyExpense=num(p.manualPropertyExpense+total(p.assets.properties.map(a=>a.operatingExpense||0)));
  p.businessExpense=num(p.manualBusinessExpense+total(p.assets.businesses.map(a=>a.operatingExpense||0)));
  p.totalIncome=num(p.salaryIncome+p.passiveIncome);
  p.totalExpense=num(p.livingExpense+p.childExpense+p.loanInterest+p.propertyExpense+p.businessExpense);
  p.monthlyCashflow=num(p.totalIncome-p.totalExpense);num(p.cash);
  p.debtTotal=total(Object.values(p.liabilities).flat().map(l=>l.principal));
  return p;
 }
 function player(id,name,c,personality){
  const f=c.effective.fields;
  for(const key of ['workIncome','passiveIncome','totalExpenses','startingSavings','monthlyCashflow','stars','maxLoan'])num(f[key]);
  if(f.totalIncome-f.totalExpenses!==f.monthlyCashflow)throw Error('角色卡收支不一致，請先驗收：'+c.cardId);
  const child=f.childText.match(/^每生一個小孩支出\+(\d+)元$/);
  return calculate({id,name,personality,characterId:c.cardId,occupation:c.effective.title,stars:f.stars,skill:f.skill,skillUsed:false,
   cash:f.startingSavings,salaryIncome:f.workIncome,isStudent:false,isEmployed:f.workIncome>0,basePassiveIncome:f.passiveIncome,manualPassiveIncome:0,livingExpense:f.totalExpenses,
   children:0,childUnitExpense:child?+child[1]:null,manualChildExpense:0,manualPropertyExpense:0,manualBusinessExpense:0,maxLoan:f.maxLoan,
   assets:{stocks:[],properties:[],businesses:[],futures:[],bonds:[],funds:[]},liabilities:{loans:[],carLoan:[],mortgage:[],businessLoan:[]},
   hasInsurance:false,financialFreedom:false,zone:'taiwan',position:0});
 }
 class Session {
  constructor(cards,board,rng=Math.random,saved=null,logger=()=>{}){
   cards=cards.map(upgradeCard);this.cards=cards;this.byId=new Map(cards.map(c=>[c.cardId,c]));this.board=board;this.rng=rng;this.logger=logger;
   this.state=saved?copy(saved):null;
   if(saved){this.validate();this.state.players.forEach(calculate);}
  }
  random(n){const r=this.rng();if(!Number.isFinite(r)||r<0||r>=1)throw Error('亂數範圍錯誤');return Math.floor(r*n);}
  start(name,id){
   const roles=this.cards.filter(c=>c.category==='角色');
   const chosen=id===undefined?roles[this.random(roles.length)]:this.byId.get(id);if(!chosen||chosen.category!=='角色')throw Error('找不到角色卡');
   const pool=roles;
   const pcs=[player(0,String(name).trim().slice(0,24)||'玩家',chosen,'human')];
   ['conservative','balanced','aggressive'].forEach((personality,i)=>{const c=pool[this.random(pool.length)];pcs.push(player(i+1,['AI・保守','AI・平衡','AI・積極'][i],c,personality));});
   this.state={version:1,round:1,turn:0,phase:'ready',dice:null,pending:null,players:pcs,events:[],quotes:{},freedomNotice:null};
   this.log('NEW_GAME','四位玩家準備出發');return this.state;
  }
  get active(){return this.state.players[this.state.turn];}
  log(code,text,cardId=null,playerId=this.active.id){const m=this.state.pending?.market;const e={sequence:this.state.events.length+1,round:this.state.round,playerId,code,text,cardId,...(m?{triggerPlayerId:m.triggerPlayerId,marketEventId:m.id}:{})};this.state.events.push(e);this.logger(e);}
  checkFreedom(p){calculate(p);if(!p.financialFreedom&&p.passiveIncome>p.totalExpense){p.financialFreedom=true;p.zone='world';p.position=0;this.state.freedomNotice=p.name;this.log('FINANCIAL_FREEDOM',p.name+' 進入財務自由圈！');}}
  clearNotice(){this.state.freedomNotice=null;}
  pay(p){calculate(p);p.cash=num(p.cash+p.monthlyCashflow);this.log('CASHFLOW',p.name+' 領取月現金流 '+p.monthlyCashflow+'元');
   if(p.characterId==='characters-004'){const bonus=(this.random(6)+1)*10000;p.cash=num(p.cash+bonus);this.log('ROLE_BONUS',p.name+' 業績獎金 '+bonus+'元');}
  }
  roll(){
   if(this.state.phase!=='ready')throw Error('回合尚未結算');
   const p=this.active,n=this.random(6)+1,spaces=this.board.zone(p.zone),from=p.position,route=[];
   for(let i=1;i<=n;i++)route.push((from+i)%spaces.length);
   if(from+n>=spaces.length&&this.board.settings.payOnPassStart)this.pay(p);
   p.position=route.at(-1);this.state.dice=n;this.log('ROLL',p.name+' 擲出 '+n+' 點');
   const tile=spaces[p.position];this.state.phase='resolving';
   if(tile.effect.kind==='pay-cashflow'){this.pay(p);this.state.pending={kind:'cashflow',tileId:tile.id};}
   else if(tile.cardPool){
    let pool=this.cards.filter(c=>c.gameModule===tile.cardPool.gameModule&&!tile.cardPool.excludeCardTypes.includes(c.cardType));
    if(tile.cardPool.highValue){const high=pool.filter(c=>{const o=offer(c);return !o||o.kind!=='purchase'||o.value>=this.board.settings.worldInvestmentMinimum;});if(high.length)pool=high;}
    // Manual cards remain drawable, including unresolved printed values. Never auto-apply them.
    const eligible=pool.filter(c=>Number.isFinite(c.drawWeight)&&c.drawWeight>0);if(!eligible.length)throw Error('空牌池：'+tile.id);
    const sum=total(eligible.map(c=>c.drawWeight));let cursor=(this.random(1000000)/1000000)*sum;let c=eligible.at(-1);
    for(const item of eligible){cursor-=item.drawWeight;if(cursor<0){c=item;break;}}
    if(c.category==='詭譎市場'&&p.cash<=300000){this.state.pending={kind:'rest',tileId:tile.id};this.log('RISK_EXEMPT',p.name+' 現金 30 萬以下，免翻詭譎市場卡');}
    else{this.state.pending={kind:'card',cardId:c.cardId,tileId:tile.id};this.log('DRAW',p.name+' 抽到 '+(c.effective.title||c.effective.titleCandidate||c.cardId),c.cardId);}
   }else this.state.pending={kind:'rest',tileId:tile.id};
   return {dice:n,route,zone:p.zone};
  }
  requiresEventDie(){const c=this.byId.get(this.state.pending?.cardId);return !!c&&/骰/.test((c.effective.effect||'')+' '+JSON.stringify(c.effective.fields||{}));}
  dividend(){
   const c=this.byId.get(this.state.pending?.cardId);if(c?.category!=='現金股利')return null;
   const title=(c.effective.title||'').match(/^(.+)發送現金股利$/),effect=(c.effective.effect||'').match(/^領取現金(\d+)元\/張。?（此收入為一次性領取）$/);
   if(!title||!effect)return null;
   const stock=title[1],holdings=this.active.assets.stocks.filter(a=>a.name===stock);let lots=0;
   for(const a of holdings){
    if(a.unitType==='lot')lots+=num(a.units);
    else if(a.unitType==='share'||(!a.manualTrade&&this.byId.get(a.cardId)?.category==='股票投資'))lots+=num(a.units)/1000;
    else return {kind:'dividend-review',stock,reason:'持倉的股／張單位尚未確認，不能猜測股利金額。'};
   }
   if(!Number.isInteger(lots)||lots<0)return {kind:'dividend-review',stock,reason:'持有零股的配息規則尚未確認。'};
   return {kind:'dividend',stock,lots,perLot:Number(effect[1]),amount:num(lots*Number(effect[1]))};
  }
  mandatoryPayment(){
   const c=this.byId.get(this.state.pending?.cardId);if(!c?.autoResolvable||!c.resolver||this.requiresEventDie())return null;
   if(c.resolver.op==='cash-delta'&&c.resolver.amount<0)return -c.resolver.amount;
   if(c.resolver.op==='star-expense')return c.resolver.insuranceExempt&&this.active.hasInsurance?0:c.resolver.baseAmount*this.active.stars;
   return null;
  }
  // Market access and transactions are installed by market-engine.js; active remains the turn owner.
  shareholderMeeting(participant=this.active,card=this.byId.get(this.state.pending?.cardId)){
   const c=card;if(c?.category!=='股東大會')return null;
   const positions=participant.assets.stocks.filter(a=>a.units>0&&(!a.assetType||a.assetType==='stock')).map(a=>{
    const source=this.byId.get(a.cardId),unitType=a.unitType||(!a.manualTrade&&source?.category==='股票投資'?'share':null);
    return {id:a.id,name:a.assetName||a.name,quantity:a.units,unitType,lots:unitType==='lot'?a.units:unitType==='share'?a.units/1000:null,industry:a.industry||a.sector||source?.effective.fields?.industry||source?.effective.fields?.sector||null};
   });
   const holdings=[];for(const h of positions){const group=holdings.find(x=>x.name===h.name&&x.unitType===h.unitType&&x.industry===h.industry);if(group){group.quantity+=h.quantity;if(group.lots!==null)group.lots+=h.lots;}else holdings.push({...h});}
   const result={kind:'meeting',holdings,lines:[],issues:[],amount:0,currentCash:participant.cash,remainingCash:participant.cash,manualResolution:false};
   if(!holdings.length)return {...result,status:'no-stocks',message:'你目前沒有持有股票。本次股東大會不產生影響。'};
   // Interpret only explicitly stated cash-per-share/lot effects. Bare industry numbers have no known unit.
   const effect=c.effective.effect||'',perShare=/每股/.test(effect),perLot=/每張/.test(effect),cashRule=/股利|配息|領取|收益/.test(effect);
   for(const h of holdings){
    const key=Object.hasOwn(c.effective.fields||{},h.name)?h.name:h.industry;
    if(!key){result.issues.push(h.name+'：缺少股票對應產業資料');continue;}
    if(!Object.hasOwn(c.effective.fields||{},key))continue;
    const value=c.effective.fields[key];
    if(!cashRule||perShare===perLot){result.issues.push(key+'：行情數值的單位及股利／價格／倍率規則未定義');continue;}
    if(typeof value!=='number'||!Number.isFinite(value)){result.issues.push(key+'：效果数值待確認');continue;}
    const count=perLot?h.lots:h.unitType==='share'?h.quantity:h.unitType==='lot'?h.quantity*1000:null;
    if(count===null){result.issues.push(h.name+'：舊持倉缺少股／張單位');continue;}
    const amount=num(count*value);result.lines.push({name:h.name,quantity:count,unit:perLot?'張':'股',perUnit:value,amount});result.amount=num(result.amount+amount);
   }
   if(result.issues.length)return {...result,status:'rules-review',amount:null,remainingCash:null,manualResolution:true,message:'已讀取持股，但缺少必要規則；本次不推測、不自動改動資產。'};
   result.remainingCash=num(result.currentCash+result.amount);
   return {...result,status:result.lines.some(l=>l.amount!==0)?'ready':'unaffected',message:result.lines.some(l=>l.amount!==0)?'確認後依持股計算入帳。':'你的持股未受到本次股東大會影響。'};
  }

  rollEventDie(){
   if(this.state.phase!=='resolving'||this.state.pending?.kind!=='card')throw Error('請在卡牌結算時擲事件骰');
   if(!this.requiresEventDie())throw Error('此卡不需要事件骰');
   const rule=this.byId.get(this.state.pending.cardId)?.resolver;
   if(rule?.dice&&(this.state.pending.eventRolls||[]).length>=rule.dice)throw Error('已完成指定骰數，不可重擲');
   const value=this.random(6)+1;
   (this.state.pending.eventRolls??=[]).push(value);
   this.log('EVENT_DICE',this.active.name+' 事件骰擲出 '+value+' 點（不移動棋子）',this.state.pending.cardId);
   return value;
  }
  preview(){const meeting=this.shareholderMeeting();if(meeting)return meeting;const dividend=this.dividend();if(dividend?.kind==='dividend')return dividend;const c=this.byId.get(this.state.pending?.cardId);if(!c)return null;
   if(c.resolver?.op==='property-sale'){
    const r=c.resolver,options=this.active.assets.properties.filter(a=>r.tokens.every(t=>(a.name||'').replace(/二房|2房/g,'兩房').includes(t))).map(a=>({id:a.id,name:a.name,price:r.price,loan:total(this.active.liabilities.mortgage.filter(l=>l.id===a.id).map(l=>l.principal))}));
    const selected=options.find(a=>a.id===this.state.pending.saleAssetId)||options[0];
    return {kind:'property-sale',options,selected,remainingCash:selected?this.active.cash+selected.price-selected.loan:this.active.cash};
   }
   if(c.manualResolution&&c.gameModule==='事業系統'&&/小生意|小事業|大企業|無事業者/.test(c.effective.effect||'')&&!this.active.assets.businesses.length)return {kind:'state-auto',field:'cash',amount:0,message:'沒有持有事業，本卡無影響。'};
   const stateResult=stateRulePreview(c,this.active,this.state.pending.eventRolls||[]);if(stateResult)return stateResult;
   const o=offer(c);if(o?.kind==='purchase'&&this.active.characterId==='characters-013'&&!this.active.skillUsed&&o.asset==='properties')return {...o,cost:o.downPayment/2+(o.renovationCost||0),explanation:'角色技能：首次房產頭期款半價（整修費不折扣，房貸不變）。'};return o;}
  apply(){
   if(this.state.phase!=='resolving')throw Error('目前沒有待結算事件');
   if(this.shareholderMeeting())return this.completeMeeting();
   const dividend=this.dividend();if(dividend?.kind==='dividend'){
    this.active.cash=num(this.active.cash+dividend.amount);
    this.log('CASH_DIVIDEND',this.active.name+' 領取 '+dividend.stock+' 現金股利：'+dividend.perLot+'元 × '+dividend.lots+'張 = '+dividend.amount+'元',this.state.pending.cardId);
    this.finish();return;
   }
   const c=this.byId.get(this.state.pending?.cardId),o=this.preview(),p=this.active;
   if(!c||!o)throw Error('此牌需人工輸入結算值，或選擇略過');
   if(o.kind==='state-auto'){
    if(o.waitingDice)throw Error('請先完成指定骰數');
    const targets=c.resolver?.allPlayers?this.state.players:[p];
    const drafts=targets.map(target=>{const q=target===p?o:stateRulePreview(c,target),draft=copy(target);draft[q.field]=num(draft[q.field]+q.amount);calculate(draft);return draft;});
    targets.forEach((target,i)=>Object.assign(target,drafts[i]));
    this.log('AUTO_STATE',o.message,c.cardId);this.finish();return;
   }
   if(o.kind==='property-sale'){
    const draft=copy(p),a=o.selected;
    if(a){draft.cash=num(o.remainingCash);draft.assets.properties=draft.assets.properties.filter(x=>x.id!==a.id);draft.liabilities.mortgage=draft.liabilities.mortgage.filter(l=>l.id!==a.id);calculate(draft);Object.assign(p,draft);}
    this.log('PROPERTY_SALE',a?'出售 '+a.name+'，售價 '+a.price+'，清償房貸 '+a.loan:'沒有符合本次收購條件的房產，本卡無影響。',c.cardId);this.finish();return;
   }
   if(o.kind==='purchase')return this.buy(c,o);
   const op=c.resolver.op;
   // Engine handles finite negative cash as a visible shortfall; no implicit debt/rate.
   if(op==='cash-delta')p.cash=num(p.cash+c.resolver.amount);
   else if(op==='star-expense')p.cash=num(p.cash-(c.resolver.insuranceExempt&&p.hasInsurance?0:c.resolver.baseAmount*p.stars));
   else if(op==='monthly-income-delta')p.salaryIncome=num(p.salaryIncome+c.resolver.amount);
   else if(op==='monthly-expense-delta')p.livingExpense=num(p.livingExpense+c.resolver.amount);
   else if(op==='set-market-quotes')this.state.quotes[c.resolver.market]=copy(c.resolver.values);
   else throw Error('未支援處理器');
   this.log('APPLY',p.name+' 套用 '+(c.effective.title||c.cardId),c.cardId);this.finish();
  }
  buy(c,o){
   if(this.state.phase!=='resolving'||this.state.pending?.cardId!==c.cardId)throw Error('目前沒有此購買事件');
   o=this.preview();if(o?.kind!=='purchase')throw Error('不是購買事件');
   const actual=this.active,p=copy(actual);if(p.cash<o.cost)throw Error('資金不足，無法購買');
   p.cash=num(p.cash-o.cost);const assetId='asset-'+this.state.events.length;
   p.assets[o.asset].push({id:assetId,cardId:c.cardId,name:c.effective.title||c.cardId,cost:o.cost,value:o.value,income:o.income,units:o.units,operatingExpense:0});
   if(o.loan)p.liabilities.mortgage.push({id:assetId,cardId:c.cardId,principal:o.loan,monthlyPayment:o.expense});
   if(p.characterId==='characters-013'&&o.asset==='properties')p.skillUsed=true;
   if(p.characterId==='characters-003'&&o.asset==='businesses'&&!p.skillUsed){p.cash=num(p.cash+2000000);p.skillUsed=true;this.log('ROLE_BONUS',p.name+' 首次加盟／創業獎勵200萬元');}
   calculate(p);Object.assign(actual,p);
   this.log('BUY',p.name+' 購買 '+(c.effective.title||c.cardId)+'，支付 '+o.cost+'元'+(o.loan?'；依牌面房貸 '+o.loan+'元':''),c.cardId);this.finish();
  }
  manual(values){
   if(propertyPurchaseHandler(this.byId.get(this.state.pending?.cardId)))throw Error('房產由系統結算');
   if(this.shareholderMeeting()||this.marketItems().length)throw Error('此事件直接讀取持倉，不接受人工改帳');
   if(this.mandatoryPayment()!==null||this.dividend()?.kind==='dividend')throw Error('此卡請按確定，由系統結算');
   if(this.state.phase!=='resolving')throw Error('目前沒有待處理卡牌');
   const allowed=['cash','salaryIncome','manualPassiveIncome','livingExpense','manualChildExpense','manualPropertyExpense','manualBusinessExpense'];
   const draft=copy(this.active);
   for(const [key,value] of Object.entries(values)){if(!allowed.includes(key))throw Error('無效手動欄位');draft[key]=num(draft[key]+num(value));if(key!=='cash'&&draft[key]<0)throw Error('收入／支出不得小於零');}
   calculate(draft);Object.assign(this.active,draft);
   this.log('MANUAL_APPLY',this.active.name+' 人工結算 '+JSON.stringify(values),this.state.pending?.cardId||null);this.finish();
  }
  borrow(principal,monthlyPayment){
   if(propertyPurchaseHandler(this.byId.get(this.state.pending?.cardId)))throw Error('房貸由牌面計算，不提供額外融資');
   if(this.shareholderMeeting()||this.marketItems().length)throw Error('此事件不提供借款操作');
   num(principal);num(monthlyPayment);const p=this.active;
   if(this.state.phase!=='resolving'||p.personality!=='human')throw Error('只可在真人卡牌結算時借款');
   if(principal<=0||monthlyPayment<0||p.debtTotal+principal>p.maxLoan)throw Error('請檢查本金、月息及角色貸款上限');
   num(p.cash+principal);num(p.totalExpense+monthlyPayment);
   p.liabilities.loans.push({id:'loan-'+this.state.events.length,principal,monthlyPayment});p.cash+=principal;calculate(p);this.log('MANUAL_LOAN',p.name+' 人工借款 '+principal+'元；每月利息 '+monthlyPayment+'元');
  }
  skip(){if(this.state.phase!=='resolving')throw Error('沒有待處理回合');if(this.preview()?.kind==='state-auto'||this.mandatoryPayment()!==null||this.dividend()?.kind==='dividend')throw Error('此卡不能略過，請按確定');const c=this.byId.get(this.state.pending?.cardId);this.log(c?.manualResolution?'MANUAL_RULE_SKIPPED':'SKIP',this.active.name+' 略過'+(c?' '+(c.effective.title||c.cardId):''),c?.cardId||null);this.finish();}
  finish(){this.checkFreedom(this.active);this.state.phase='done';this.state.pending=null;}
  end(){if(this.state.phase!=='done')throw Error('回合尚未完成');this.state.turn=(this.state.turn+1)%4;if(!this.state.turn)this.state.round++;this.state.phase='ready';}
  validate(){
   const s=this.state;if(!s||s.version!==1||s.players?.length!==4||!Number.isInteger(s.turn)||s.turn<0||s.turn>3||!Number.isInteger(s.round)||s.round<1||!['ready','resolving','done'].includes(s.phase))throw Error('存檔結構不相容');
   if(s.pending?.cardId&&!this.byId.has(s.pending.cardId))throw Error('不存在的 cardId');
   for(const p of s.players){if(!this.byId.has(p.characterId)||!['taiwan','world'].includes(p.zone)||!Number.isInteger(p.position)||p.position<0||p.position>=this.board.zone(p.zone).length)throw Error('存檔玩家位置錯誤');calculate(p);for(const a of Object.values(p.assets).flat())if(!this.byId.has(a.cardId))throw Error('資產 cardId 不存在');}
   for(const e of s.events)if(e.cardId&&!this.byId.has(e.cardId))throw Error('紀錄 cardId 不存在');
   const walk=v=>{if(typeof v==='number')num(v);else if(v&&typeof v==='object')Object.values(v).forEach(walk);};walk(s);return true;
  }
 }
 G.play={Session,offer,calculate,normalizeProperty,propertyPurchaseHandler,upgradeCard,moneyValue,classifyCard};
 if(typeof module==='object'&&module.exports)require('./market-engine.js')(G);
})(globalThis);

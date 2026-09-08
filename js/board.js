(function(root){
 const types={start:['起點','↗',null],stock:['股票','↗','股票系統'],business:['事業','▥','事業系統'],property:['房地產','⌂','房地產系統'],life:['生活事件','♡','生活／支出系統'],cashflow:['現金流','$',null],investment:['投資機會','✦','投資事件'],futures:['期貨市場','≈','期貨系統'],bonds:['債券基金','▤','債券基金系統']};
 types.bank=['銀行','＄',null];
 types.childbirth=['生小孩','♡',null];
 const inner=['start','stock','life','property','business','cashflow','investment','property','life','stock','business','bonds','cashflow','property','futures','life','bank','childbirth'];
 const outer=['start','property','futures','business','stock','investment','property','cashflow','business','futures','bonds','investment','property','stock','business','life','cashflow','futures','investment','property','business','bonds','stock','life','bank'];
 function spaces(list,zone,inset,thickness){
  const end=100-inset-thickness,run=100-2*inset-2*thickness,remaining=list.length-4,rects=[];
  for(let side=0;side<4;side++){
   const count=Math.floor(remaining/4)+(side<remaining%4?1:0),step=run/count;
   rects.push([[end,end],[inset,end],[inset,inset],[end,inset]][side].concat([thickness,thickness]));
   for(let j=0;j<count;j++)rects.push(side===0?[end-(j+1)*step,end,step,thickness]:side===1?[inset,end-(j+1)*step,thickness,step]:side===2?[inset+thickness+j*step,inset,step,thickness]:[end,inset+thickness+j*step,thickness,step]);
  }
  return list.map((type,i)=>{const [x,y,width,height]=rects[i];return {id:zone+'-'+i,zone,type,label:types[type][0],icon:types[type][1],position:{x:x+width/2,y:y+height/2},size:{width,height},cardPool:types[type][2]?{gameModule:types[type][2],excludeCardTypes:['character'],highValue:zone==='world'}:null,effect:{kind:type==='childbirth'?'childbirth':type==='bank'?'bank':type==='cashflow'?'pay-cashflow':type==='start'?'start':'draw-card'}};});
 }
 const api={spaces:[...spaces(inner,'taiwan',23,9),...spaces(outer,'world',2,10)],settings:{maxChildren:3,diceSides:6,worldInvestmentMinimum:1000000,payOnPassStart:true,negativeCashPolicy:'保留現金缺口，不自動創造貸款；可人工借貸或繼續回合'},rules:['使用一顆六面骰；每人一次移動為一回合。','通過或抵達起點領取一次月現金流；停在現金流格再結算一次。','內外圈都有銀行格；生小孩格只在內圈。','持續性收入大於總支出後進入世界圈，世界圈優先提供百萬元以上投資。','銀行每次抽出 2%、3%、4% 或 5% 年利率，再由全體玩家決定貸款本金；每月利息自動計算。'],zone:z=>api.spaces.filter(s=>s.zone===z)};
 if(typeof module==='object')module.exports=api;else root.BoardData=api;
})(globalThis);

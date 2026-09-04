(function(root){
 const types={start:['起點','↗',null],stock:['股票','↗','股票系統'],business:['事業','▥','事業系統'],property:['房地產','⌂','房地產系統'],life:['生活事件','♡','生活／支出系統'],cashflow:['現金流','$',null],investment:['投資機會','✦','投資事件'],futures:['期貨市場','≈','期貨系統'],bonds:['債券基金','▤','債券基金系統']};
 const inner=['start','stock','life','property','business','cashflow','investment','property','life','stock','business','bonds','cashflow','property','futures','life'];
 const outer=['start','property','futures','business','stock','investment','property','cashflow','business','futures','bonds','investment','property','stock','business','life','cashflow','futures','investment','property','business','bonds','stock','life'];
 const spaces=(list,zone,rx,ry)=>list.map((type,i)=>{const a=2*Math.PI*i/list.length+Math.PI/2;return {id:zone+'-'+i,zone,type,label:types[type][0],icon:types[type][1],position:{x:50+rx*Math.cos(a),y:50+ry*Math.sin(a)},cardPool:types[type][2]?{gameModule:types[type][2],excludeCardTypes:['character'],highValue:zone==='world'}:null,effect:{kind:type==='cashflow'?'pay-cashflow':type==='start'?'start':'draw-card'}};});
 const api={spaces:[...spaces(inner,'taiwan',24,30),...spaces(outer,'world',44,44)],settings:{diceSides:6,worldInvestmentMinimum:1000000,payOnPassStart:true,negativeCashPolicy:'保留現金缺口，不自動創造貸款；可人工借貸或繼續回合'},rules:['使用一顆六面骰；每人一次移動為一回合。','通過或抵達起點領取一次月現金流；停在現金流格再結算一次。','持續性收入大於總支出後進入世界圈，世界圈優先提供百萬元以上投資。','未明確的貸款利率、技能與事件由真人輸入；電腦無法判斷便略過。'],zone:z=>api.spaces.filter(s=>s.zone===z)};
 if(typeof module==='object')module.exports=api;else root.BoardData=api;
})(globalThis);

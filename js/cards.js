(function(root){
 const colors={'灰色人物背景':'#728594','深紫色':'#73549d','淺紫色':'#ae96c8','青綠色':'#459f9c','淺綠色':'#83b883','桃紅色':'#d95591','米黃色':'#c3ac71','綠色':'#249f78','紅色':'#da6560','藍色':'#398dc9','黃色':'#c99226','紫色':'#8c71b6','橘色':'#d98945','粉紅色':'#ce749d'};
 async function load(){
  let cards=root.PHASE3_CARDS,raw=root.GAME_SOURCE_BUNDLE.sources;
  if(location.protocol!=='file:'){
   const r=await fetch('data/game-cards.json',{cache:'no-store'});if(!r.ok)throw Error('無法讀取 game-cards.json');cards=await r.json();
   const cr=await fetch('data/manual-corrections.json',{cache:'no-store'});if(!cr.ok)throw Error('無法讀取人工修正');const corrections=await cr.json();
   if(corrections.length)cards=raw.map(c=>GameData.derive(c,corrections));
  }
  if(!cards||cards.length!==392)throw Error('卡牌資料不完整');
  const byId=new Map(raw.map(c=>[c.cardId,c]));
  return cards.map(c=>GameData.play.upgradeCard({...c,deckColor:byId.get(c.cardId)?.deckColor||'',sourceImages:byId.get(c.cardId)?.sourceImages||c.sourceImages}));
 }
 function color(card){const name=card.deckColor||'';return colors[name]||Object.entries(colors).find(([k])=>name.includes(k))?.[1]||'#478fc0';}
 root.CardLibrary={load,color};
})(globalThis);

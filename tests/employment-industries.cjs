'use strict';
const assert=require('node:assert/strict');global.window=global;require('../data/game-data-bundle.js');
const E=require('../data/game-engine.js'),B=require('../js/board.js'),cards=GAME_SOURCE_BUNDLE.sources.map(c=>E.derive(c));
function session(id){const s=new E.play.Session(cards,B,()=>0);s.start('產業測試',id);return s;}
const expected={'characters-001':'保全服務業','characters-002':'教育業','characters-004':'金融業','characters-005':'金融業','characters-006':'餐飲業','characters-007':'醫療業','characters-008':'醫療業','characters-012':'公務行政業','characters-013':'房地產業','characters-014':'水電工程業'};
for(const [id,industry] of Object.entries(expected)){
 const s=session(id);assert.equal(s.active.employment.industry,industry);const cash=s.active.cash,salary=s.active.salaryIncome;
 delete s.active.employment;const restored=new E.play.Session(cards,B,()=>0,s.state);assert.equal(restored.active.employment.industry,industry);assert.equal(restored.active.cash,cash);assert.equal(restored.active.salaryIncome,salary);
 restored.active.employment={industry:'航運',isHighestRank:true,unemployed:true,previousSalary:12345};const r=new E.play.Session(cards,B,()=>0,restored.state);assert.deepEqual(r.active.employment,restored.active.employment);
 const legacy=session(id);legacy.active.employment={isHighestRank:false,unemployed:true};legacy.active.employmentIndustry='金融';const old=new E.play.Session(cards,B,()=>0,legacy.state);assert.equal(old.active.employment.industry,'金融');assert.equal(old.active.employment.unemployed,true);assert.equal(old.active.employment.isHighestRank,false);
}
const s=session('characters-005');s.active.employment.isHighestRank=false;s.state.phase='resolving';s.state.pending={kind:'card',cardId:'stock-news-029',tileId:'taiwan-9'};s.beginMarket();assert.equal(s.active.salaryIncome,0);assert.equal(s.active.employment.unemployed,true);assert.equal(s.active.employment.industry,'金融業');assert.ok(s.state.players.slice(1).every(p=>p.salaryIncome>0));
const highest=session('characters-005');highest.active.employment.isHighestRank=true;highest.state.phase='resolving';highest.state.pending={kind:'card',cardId:'stock-news-029',tileId:'taiwan-9'};highest.beginMarket();assert.ok(highest.active.salaryIncome>0);
const chef=session('characters-006');chef.active.employment.isHighestRank=false;chef.state.phase='resolving';chef.state.pending={kind:'card',cardId:'stock-news-029',tileId:'taiwan-9'};const salary=chef.active.salaryIncome;chef.beginMarket();assert.equal(chef.active.salaryIncome,salary);assert.equal(chef.active.employment.industry,'餐飲業');
console.log('PASS: role industries, missing-field restore, existing employment/rank preserved, financial news matching and highest-rank exemption, unrelated industry unaffected');
module.exports={session};

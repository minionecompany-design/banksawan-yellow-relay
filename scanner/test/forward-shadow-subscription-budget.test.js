import test from 'node:test';
import assert from 'node:assert/strict';
import {ForwardSubscriptionBudget,SHADOW_TIMEFRAMES} from '../scripts/lib/forward-shadow-subscription-budget.mjs';
const s=i=>'S'+i+'USDT';
test('four TF data channels share one WS; one control per 1s regardless of arriving symbol burst',()=>{
 const budget=new ForwardSubscriptionBudget();
 budget.noteControlSent(1000); // !ticker@arr subscription at WS open
 budget.enqueue(Array.from({length:50},(_,i)=>s(i)));
 assert.equal(budget.take(1500),null);
 const first=budget.take(2000);
 assert.equal(first.symbols.length,20);
 assert.equal(first.params.length,20*SHADOW_TIMEFRAMES.length);
 assert.equal(first.activeStreams,201);
 assert.equal(budget.take(2999),null);
 assert.equal(budget.take(3000).symbols.length,20);
 assert.equal(budget.take(4000).symbols.length,10);
 assert.equal(budget.take(5000),null);
 assert.equal(budget.stats().estimatedStreams,201);
 assert.equal(budget.stats().controlMessages,4);
});
test('deduplicates repeated LONG A per symbol, never creating extra subscription pressure',()=>{
 const budget=new ForwardSubscriptionBudget();
 budget.enqueue(['AINUSDT','AINUSDT','EVAAUSDT']);
 budget.enqueue(['AINUSDT','EVAAUSDT']);
 assert.equal(budget.stats().tracked,2);
 assert.equal(budget.take(6000).params.length,8);
 assert.equal(budget.stats().pending,0);
});
test('symbol and stream hard caps always reject rather than drop losing candidate silently',()=>{
 const budget=new ForwardSubscriptionBudget();
 budget.enqueue(Array.from({length:200},(_,i)=>s(i)));
 assert.equal(budget.stats().estimatedStreams,801);
 assert.equal(budget.stats().tracked,200);
 assert.throws(()=>budget.enqueue([s(201)]),/SHADOW_SUBSCRIPTION_CAPACITY_STOP/);
 const all=[];
 for(let i=0;i<10;i++)all.push(budget.take(1000+i*1000));
 assert.equal(all.flatMap(x=>x.params).length,800);
 assert.ok(all.every(x=>x.params.length<=80));
 assert.ok(all.every(x=>x.activeStreams<=801));
});
test('clock reversal, invalid symbols and unsafe configuration fail closed',()=>{
 assert.throws(()=>new ForwardSubscriptionBudget({minGapMs:100}),/INVALID_SHADOW_SUBSCRIPTION_BUDGET/);
 assert.throws(()=>new ForwardSubscriptionBudget({maxSymbols:300}),/INVALID_SHADOW_SUBSCRIPTION_BUDGET/);
 const gate=new ForwardSubscriptionBudget();
 assert.throws(()=>gate.enqueue(['../../SECRET']),/INVALID_SHADOW_SYMBOL/);
 assert.throws(()=>gate.take(-2),/INVALID_SUBSCRIBE_CLOCK/);
 assert.throws(()=>gate.noteControlSent(1.5),/INVALID_SUBSCRIBE_CLOCK/);
});

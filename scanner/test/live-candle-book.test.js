import test from 'node:test';import assert from 'node:assert/strict';
import {CandleBook,CandleGap} from '../src/live-candle-book.js';
const END=Date.UTC(2026,9,15,12);
const oldRows=(span)=>Array.from({length:160},(_,i)=>{let start=END-(160-i)*span;
 return [start,'1','1.1','0.9','1.02','100',start+span-1,'102',20,'40','43','0'];});
test('bootstrap only closed candles, then append exactly one WS completed candle',()=>{
 const book=new CandleBook('WALUSDT');book.bootstrap('1m',oldRows(60_000),END);
 assert.equal(book.latest('1m').endMs,END);
 const event={k:{s:'WALUSDT',i:'1m',x:true,t:END,T:END+59999,o:'1',h:'1.1',l:'.9',c:'1.02',v:'100'}};
 assert.equal(book.ingestKline(event,END+60001).status,'APPENDED');
 assert.equal(book.ingestKline(event,END+60001).status,'DUPLICATE');
 assert.equal(book.latest('1m').endMs,END+60000);
});
test('gap, unfinished candle and future candle must not enter evidence',()=>{
 const book=new CandleBook('WALUSDT');book.bootstrap('1m',oldRows(60000),END);
 let k={s:'WALUSDT',i:'1m',x:false,t:END,T:END+59999,o:'1',h:'1.1',l:'.9',c:'1.02',v:'100'};
 assert.equal(book.ingestKline({k},END+60000).status,'IGNORED');
 k={...k,x:true,t:END+60000,T:END+119999};
 assert.throws(()=>book.ingestKline({k},END+120000),CandleGap);
});

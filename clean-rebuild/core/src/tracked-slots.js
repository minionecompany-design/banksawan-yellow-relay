import {POLICY,screenedUniverse} from './product-policy.js';
/** Deterministic offline allocator: incumbent eligible slots kept; fill vacancies by 24H gain. */
export class TrackedSlots {
 constructor(capacity=POLICY.maxTracked){if(!Number.isInteger(capacity)||capacity<1||capacity>50)throw Error('INVALID_CAPACITY');this.capacity=capacity;this.symbols=[];}
 update(rows){
  const eligible=screenedUniverse(rows),valid=new Set(eligible.map(x=>x.symbol));
  const retained=this.symbols.filter(x=>valid.has(x));
  const occupied=new Set(retained);
  for(const x of eligible){if(retained.length>=this.capacity)break;if(!occupied.has(x.symbol)){retained.push(x.symbol);occupied.add(x.symbol);}}
  this.symbols=retained;
  return Object.freeze({tracked:[...retained],eligible:eligible.length,uncovered:Math.max(0,eligible.length-retained.length)});
 }
}

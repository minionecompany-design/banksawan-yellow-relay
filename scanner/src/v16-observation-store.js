/** Worker-only bounded journal. No market-data or notification dependencies. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function verifyObservation(raw){
 if(raw&&!raw.endsWith('\n'))throw Error('TORN_JOURNAL');
 let previous='0'.repeat(64),sequence=0;
 const rows=[];
 for(const line of raw.trimEnd().split('\n').filter(Boolean)){
  const row=JSON.parse(line),{hash:actual,...body}=row;
  if(body.sequence!==sequence++||body.previous!==previous||hash(body)!==actual)throw Error('JOURNAL_INTEGRITY');
  rows.push(row);previous=actual;
 }
 return {rows,previous,sequence};
}
export class V16ObservationStore {
 constructor({directory,maxBytes=128*1024*1024,retentionMs=3*86400000,autoSync=true,clock=()=>Date.now()}={}){
  if(!path.isAbsolute(directory||'')||!Number.isSafeInteger(maxBytes)||maxBytes<4096||maxBytes>256*1024*1024||retentionMs<86400000||retentionMs>7*86400000)throw Error('STORE_CONFIG');
  this.autoSync=autoSync;this.directory=directory;this.maxBytes=maxBytes;this.retentionMs=retentionMs;this.clock=clock;
 }
 open(){
  fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
  if(fs.lstatSync(this.directory).isSymbolicLink())throw Error('STORE_UNSAFE');
  // Stale lock is deliberately not auto-broken. Operator verifies no other writer.
  this.lock=fs.openSync(path.join(this.directory,'writer.lock'),'wx',0o600);
  fs.writeSync(this.lock,JSON.stringify({pid:process.pid,at:this.clock()}));fs.fsyncSync(this.lock);
  this.bytes=0;this.recovered=[];this.heads={};
  const files=fs.readdirSync(this.directory).filter(n=>/^\d{4}-\d{2}-\d{2}\.ndjson$/.test(n)).sort();
  for(const name of files){
   const p=path.join(this.directory,name),s=fs.lstatSync(p);
   if(!s.isFile()||s.isSymbolicLink()||s.size>this.maxBytes)throw Error('STORE_UNSAFE');
   const expired=Date.parse(name.slice(0,10))+86400000<this.clock()-this.retentionMs;
   const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
   let pending='',previous='0'.repeat(64),sequence=0;const buffer=Buffer.alloc(65536);
   try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))){
    pending+=buffer.subarray(0,n).toString('utf8');
    let end;while((end=pending.indexOf('\n'))>=0){
     const line=pending.slice(0,end);pending=pending.slice(end+1);
     if(Buffer.byteLength(line)>128*1024)throw Error('STORE_UNSAFE');
     const row=JSON.parse(line),{hash:actual,...body}=row;
     if(body.sequence!==sequence++||body.previous!==previous||hash(body)!==actual)throw Error('JOURNAL_INTEGRITY');
     previous=actual;
     if(!expired&&['START','FINISH'].includes(row.type))this.recovered.push({type:row.type,eventId:row.eventId});
     if(this.recovered.length>20000)throw Error('RECOVERY_CAPACITY');
    }
    if(Buffer.byteLength(pending)>128*1024)throw Error('STORE_UNSAFE');
   }if(pending)throw Error('TORN_JOURNAL');}finally{fs.closeSync(fd);}
   this.heads[name]={previous,sequence};
   if(expired){fs.unlinkSync(p);continue;}
   this.bytes+=s.size;if(this.bytes>this.maxBytes)throw Error('STORE_FULL');
  }
  this.rotate();return this.recovered;
 }
 rotate(){
  const day=new Date(this.clock()).toISOString().slice(0,10);
  if(this.day===day)return;
  if(this.fd!==undefined){fs.fsyncSync(this.fd);fs.closeSync(this.fd);}
  for(const name of fs.readdirSync(this.directory).filter(n=>/^\d{4}-\d{2}-\d{2}\.ndjson$/.test(n))){
   if(Date.parse(name.slice(0,10))+86400000<this.clock()-this.retentionMs){
    const p=path.join(this.directory,name),s=fs.lstatSync(p);
    if(!s.isFile()||s.isSymbolicLink())throw Error('STORE_UNSAFE');
    fs.unlinkSync(p);this.bytes-=s.size;
   }
  }
  this.day=day;
  const p=path.join(this.directory,day+'.ndjson');
  const exists=fs.existsSync(p);
  const v=this.heads?.[day+'.ndjson']??{previous:'0'.repeat(64),sequence:0};
  if(exists&&!this.heads?.[day+'.ndjson'])throw Error('UNKNOWN_SEGMENT');this.previous=v.previous;this.sequence=v.sequence;
  this.fd=fs.openSync(p,fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
  if(!exists){const d=fs.openSync(this.directory,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
 }
 append(data){
  this.rotate();
  const body={sequence:this.sequence,previous:this.previous,...data};
  const row={...body,hash:hash(body)},line=JSON.stringify(row)+'\n';
  if(Buffer.byteLength(line)>128*1024||this.bytes+Buffer.byteLength(line)>this.maxBytes)throw Error('STORE_FULL');
  // Blocking I/O occurs ONLY in worker. Each acknowledged transaction is durable.
  const b=Buffer.from(line);let n=0;while(n<b.length)n+=fs.writeSync(this.fd,b,n,b.length-n);
  if(this.autoSync)fs.fsyncSync(this.fd);this.bytes+=b.length;this.sequence++;this.previous=row.hash;
  return row;
 }
 sync(){if(this.fd!==undefined)fs.fsyncSync(this.fd);}
 close(){
  this.sync();
  if(this.fd!==undefined){fs.closeSync(this.fd);this.fd=undefined;}
  if(this.lock!==undefined){fs.closeSync(this.lock);this.lock=undefined;fs.unlinkSync(path.join(this.directory,'writer.lock'));}
 }
}

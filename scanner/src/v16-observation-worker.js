import {parentPort,workerData} from 'node:worker_threads';
import {V16ObservationStore} from './v16-observation-store.js';
import {V16ObservationEngine} from './v16-observation-engine.js';
const store=new V16ObservationStore({directory:workerData.directory,autoSync:false});
const engine=new V16ObservationEngine({store,startedAtMs:workerData.startedAtMs});
store.sync();
let queue=[],timer=null,failed=false;
function flush(){
 timer=null;if(failed)return;
 try{
  const batch=queue;queue=[];
  for(const input of batch){
   if(input.type==='CLOSE'){engine.close();parentPort.postMessage({closed:true});parentPort.close();return;}
   engine.apply(input);
  }
  store.sync();parentPort.postMessage({ack:batch.length,durable:{day:store.day,sequence:store.sequence,hash:store.previous,bytes:store.bytes}});
 }catch{failed=true;parentPort.postMessage({failed:true});}
}
parentPort.on('message',input=>{
 if(failed)return;
 if(queue.length>=256){failed=true;parentPort.postMessage({failed:true});return;}
 queue.push(input);if(!timer)timer=setTimeout(flush,250);
});
parentPort.postMessage({ready:true});

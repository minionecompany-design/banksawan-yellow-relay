/** node src/replay-cli.js path/to/historical-bundle.json — offline only */
import {readFile} from 'node:fs/promises';
import {replayHistorical} from './replay.js';
import {replayParallelHistorical} from './parallel-replay.js';
const parallel=process.argv.includes('--parallel');
const filename=process.argv.slice(2).find(v=>v!=='--parallel');
if(!filename){console.error('Usage: node src/replay-cli.js [--parallel] historical-bundle.json');process.exitCode=2;}
else {
  try{
    const data=JSON.parse(await readFile(filename,'utf8'));
    const result=parallel?replayParallelHistorical(data):replayHistorical(data);
    console.log(JSON.stringify(result,null,2));
  }catch(err){console.error('Replay failed:',err.message);process.exitCode=1;}
}

import { loadConfig } from '../src/config.js';
import { PncpClient } from '../src/pncp.js';
import { QueryService } from '../src/query.js';
import { demoFetch } from '../src/demo.js';
const config={...loadConfig({}),DEMO_MODE:true,PNCP_REQUESTS_PER_SECOND:100000};
const service=new QueryService(config,new PncpClient(config,{fetcher:demoFetch}));
const measurements=[];
for(const [name,query,exported]of [['native',{q:'firewall'},false],['refined',{mode:'refined',preset:'oracle'},false],['export',{mode:'native',preset:'all'},true]]) {
  const memoryBefore=process.memoryUsage().rss,started=performance.now();
  const output=exported?await service.export(query,'all'):await service.execute(query);
  const result=output.metadata || output;
  measurements.push({operation:name,elapsed_ms:Math.round(performance.now()-started),source_total:result.source_total,matched_documents:result.matched_documents,rows:result.data.length,upstream_requests:result.upstream_requests,csv_bytes:output.csv?.length ?? null,rss_before_bytes:memoryBefore,rss_after_bytes:process.memoryUsage().rss});
}
console.log(JSON.stringify({measured_at:new Date().toISOString(),source:'synthetic_demo',rate_limiter_for_benchmark:100000,note:'Mede o processamento local com HTTP sintético; não representa latência ou capacidade do PNCP.',measurements},null,2));

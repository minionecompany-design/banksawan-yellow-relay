/**
 * Conservative, explicit traffic-light RESEARCH classification for an already
 * accepted LONG_A. Runs only on a read-only HOME request; no new signals,
 * Binance requests, automatic orders, or changes to Pine/FCM.
 * GREEN = technical conditions supportive now, NOT an execution instruction.
 */
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const result=(status,reason,checkedAtMs)=>({status,reason,checkedAtMs});
export function trafficLight(analysis,ticker,nowMs){
  if(!Number.isSafeInteger(nowMs)||nowMs<=0)return result('YELLOW','DATA_TIDAK_SIAP',0);
  if(!analysis||analysis.availability!=='READY'||!analysis.plan||
     !Array.isArray(analysis.frames)||analysis.frames.length!==4)
    return result('YELLOW','ANALISIS_BELUM_LENGKAP',nowMs);
  const p=analysis.plan;
  if(!Number.isSafeInteger(analysis.expiresAtMs)||nowMs>=analysis.expiresAtMs)
    return result('YELLOW','SKENARIO_KEDALUWARSA',nowMs);
  if(!ticker||!finite(ticker.lastPrice)||ticker.lastPrice<=0||
     !Number.isSafeInteger(ticker.observedAtMs)||ticker.observedAtMs>nowMs+10_000||
     nowMs-ticker.observedAtMs>=30_000)
    return result('YELLOW','HARGA_LIVE_TIDAK_SEGAR',nowMs);
  const px=ticker.lastPrice;
  if(px<=p.stopLoss)return result('RED','HARGA_TEMBUS_SL',nowMs);
  if(px>=p.tp1)return result('RED','HARGA_SUDAH_MENCAPAI_TP1',nowMs);
  const frame=Object.fromEntries(analysis.frames.map(x=>[x.timeframe,x]));
  if(['1h','15m'].some(tf=>frame[tf]?.trend==='DOWN'))
    return result('RED','TREN_BESAR_MELAWAN',nowMs);
  if(analysis.levels?.interaction==='BREAKDOWN')return result('RED','BREAKDOWN',nowMs);
  if(analysis.warnings?.includes('RESISTANCE_WITHIN_1R'))
    return result('RED','RESISTANCE_TERLALU_DEKAT',nowMs);
  if(!finite(p.riskPct)||p.riskPct<0.3||p.riskPct>5)
    return result('RED','RISIKO_SL_TIDAK_SESUAI',nowMs);
  if(px<p.entryLow||px>p.entryHigh)return result('YELLOW','DI_LUAR_ZONA_ENTRY',nowMs);
  const target=frame[analysis.timeframe];
  if(analysis.warnings?.includes('TREND_CONFLICT')||
     target?.trend!=='UP'||frame['5m']?.trend!=='UP'||frame['15m']?.trend!=='UP'||
     !finite(target?.relativeVolume)||target.relativeVolume<1.2||
     !['BREAKOUT','RETEST'].includes(analysis.levels?.interaction)||
     !finite(p.roomToResistanceR)||p.roomToResistanceR<1.5)
    return result('YELLOW','KONFIRMASI_BELUM_CUKUP',nowMs);
  return result('GREEN','KONDISI_TEKNIS_MENDUKUNG',nowMs);
}

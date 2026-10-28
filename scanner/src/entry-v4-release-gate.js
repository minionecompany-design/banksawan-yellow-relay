/** Fail-closed evidence gate for BANKSAWAN YELLOW experimental 1M entry.
 * This does NOT authorize Railway or Android release. Explicit user approval
 * and a separate production change are always required, even after evidence.
 */
export const ENTRY_V4_RELEASE_GATE='YELLOW_ENTRY_V4_REVIEW_GATE_OFFLINE';
export function evaluateEntryV4Evidence({archiveSummary,prospective,qa}={}){
 const blockers=[],warnings=[];
 const a=archiveSummary;
 if(!a||a.method!=='V4_THREE_BAR_STAIRCASE_RESEARCH_OFFLINE')blockers.push('ARCHIVE_REPLAY_NOT_VERIFIED');
 else{
   if(a.cases!==46||a.oneMinuteCases!==28||a.outOfScope!==18)
     blockers.push('ARCHIVE_CASE_IDENTITY_MISMATCH');
   if(!Number.isInteger(a.completeWindows)||a.completeWindows<28)
     warnings.push('ARCHIVE_INCOMPLETE_WINDOWS');
   if(!a.candidateV4||a.candidateV4.filledEvents<1)
     blockers.push('NO_ARCHIVED_ENTRY_FILL_EVIDENCE');
   if(a.candidateV4?.confirmationEvents===0)
     blockers.push('NO_REAL_CANDLE_ENTRY_CONFIRMATION');
 }
 // Evidence on the already-seen sample is never a substitute for a new
 // forward period with exchange quote timestamps and distinct episodes.
 if(!prospective||prospective.source!=='FORWARD_LIVE_OBSERVED_NOT_BACKFILLED')
   blockers.push('PROSPECTIVE_COHORT_NOT_COLLECTED');
 else{
   if(!Number.isInteger(prospective.independentEpisodes)||prospective.independentEpisodes<100)
     blockers.push('PROSPECTIVE_INDEPENDENT_EPISODES_LT_100');
   if(!Number.isInteger(prospective.completeSixHourEpisodes)||
      prospective.completeSixHourEpisodes<80)
     blockers.push('FORWARD_COVERAGE_LT_80');
   if(!Number.isInteger(prospective.quoteVerifiedEntrySetups)||
      prospective.quoteVerifiedEntrySetups<30)
     blockers.push('VERIFIED_ELIGIBLE_ENTRY_PLANS_LT_30');
   if(!Number.isInteger(prospective.paperFillsWithKnownExit)||
      prospective.paperFillsWithKnownExit<20)
     blockers.push('FORWARD_SETTLED_PAPER_FILLS_LT_20');
   if(prospective.noFutureLeakageVerified!==true||
      prospective.nativeTfArrivalOrderVerified!==true||
      prospective.costAndSpreadModelVerified!==true)
     blockers.push('MARKET_CAUSALITY_OR_COST_AUDIT_MISSING');
   if(prospective.falseRedCasesReviewed!==true||
      prospective.missedWinnersReviewed!==true)
     blockers.push('FALSE_RED_OR_MISSED_WINNER_AUDIT_MISSING');
   if(prospective.baselineComparisonComplete!==true)
     blockers.push('BASELINE_COMPARISON_MISSING');
 }
 if(!qa||qa.androidPassed!==true||qa.scannerPassed!==true||
    qa.fcmIsolationPassed!==true||qa.persistenceRestartPassed!==true||
    qa.productionSignerPreserved!==true)
   blockers.push('PRODUCTION_INTEGRATION_QA_MISSING');
 return {method:ENTRY_V4_RELEASE_GATE,technicalEvidenceSufficient:blockers.length===0,
   action:blockers.length?'NO_GO_LIVE':'HUMAN_RELEASE_REVIEW_REQUIRED',
   deploymentAuthorized:false,manualOwnerApprovalRequired:true,
   blockers,warnings};
}

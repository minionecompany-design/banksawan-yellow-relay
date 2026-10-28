import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateEntryV4Evidence} from '../src/entry-v4-release-gate.js';
const archive={method:'V4_THREE_BAR_STAIRCASE_RESEARCH_OFFLINE',
  cases:46,oneMinuteCases:28,outOfScope:18,completeWindows:15,
  candidateV4:{confirmationEvents:0,filledEvents:0}};
const future={source:'FORWARD_LIVE_OBSERVED_NOT_BACKFILLED',
  independentEpisodes:100,completeSixHourEpisodes:85,
  quoteVerifiedEntrySetups:31,paperFillsWithKnownExit:22,
  noFutureLeakageVerified:true,nativeTfArrivalOrderVerified:true,
  costAndSpreadModelVerified:true,falseRedCasesReviewed:true,
  missedWinnersReviewed:true,baselineComparisonComplete:true};
const qa={androidPassed:true,scannerPassed:true,fcmIsolationPassed:true,
  persistenceRestartPassed:true,productionSignerPreserved:true};
test('In-sample archives with zero fills are categorically NO GO LIVE today',()=>{
 const x=evaluateEntryV4Evidence({archiveSummary:archive});
 assert.equal(x.action,'NO_GO_LIVE');assert.equal(x.deploymentAuthorized,false);
 assert.ok(x.blockers.includes('PROSPECTIVE_COHORT_NOT_COLLECTED'));
 assert.ok(x.blockers.includes('PRODUCTION_INTEGRATION_QA_MISSING'));
 assert.ok(x.warnings.includes('NO_REAL_CANDLE_ENTRY_CONFIRMATION'));
});
test('New forward evidence still never grants automatic deployment',()=>{
 const x=evaluateEntryV4Evidence({archiveSummary:archive,prospective:future,qa});
 assert.equal(x.technicalEvidenceSufficient,true);
 assert.equal(x.action,'HUMAN_RELEASE_REVIEW_REQUIRED');
 assert.equal(x.deploymentAuthorized,false);
 assert.equal(x.manualOwnerApprovalRequired,true);
});
test('No backfilled or incomplete quote cohort can satisfy promotion safety',()=>{
 const x=evaluateEntryV4Evidence({archiveSummary:archive,
   prospective:{...future,source:'BACKFILLED_ARCHIVE',quoteVerifiedEntrySetups:0},
   qa});
 assert.equal(x.action,'NO_GO_LIVE');
 const y=evaluateEntryV4Evidence({archiveSummary:archive,
   prospective:{...future,independentEpisodes:3,quoteVerifiedEntrySetups:1,
    nativeTfArrivalOrderVerified:false},qa});
 assert.ok(y.blockers.includes('PROSPECTIVE_INDEPENDENT_EPISODES_LT_100'));
 assert.ok(y.blockers.includes('MARKET_CAUSALITY_OR_COST_AUDIT_MISSING'));
});
test('No QA including signer, FCM and restart => no release even with many paper outcomes',()=>{
 const x=evaluateEntryV4Evidence({archiveSummary:archive,prospective:future,
   qa:{...qa,persistenceRestartPassed:false}});
 assert.equal(x.action,'NO_GO_LIVE');
 assert.ok(x.blockers.includes('PRODUCTION_INTEGRATION_QA_MISSING'));
});

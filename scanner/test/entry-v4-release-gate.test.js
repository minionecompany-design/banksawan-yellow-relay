import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateEntryV4Evidence} from '../src/entry-v4-release-gate.js';
const archive={method:'V4_THREE_BAR_STAIRCASE_RESEARCH_OFFLINE',
  cases:46,oneMinuteCases:28,outOfScope:18,completeWindows:15,
  candidateV4:{confirmationEvents:0,filledEvents:0}};
const future={source:'FORWARD_LIVE_OBSERVED_NOT_BACKFILLED',
  cohortEvents:120,
  independentEpisodes:100,completeSixHourEpisodes:85,
  quoteVerifiedEntrySetups:31,paperFillsWithKnownExit:22,
  noFutureLeakageVerified:true,nativeTfArrivalOrderVerified:true,
  costAndSpreadModelVerified:true,falseRedCasesReviewed:true,
  missedWinnersReviewed:true,baselineComparisonComplete:true,
  improvementReview:{protocolFrozen:true,independentHoldoutReviewed:true,
    netOutcomeVsBaselinePassed:true,coverageAndFalseSignalsReviewed:true,evidenceSha256:'a'.repeat(64)}};
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
test('Contradictory denominators or an unreviewed losing cohort cannot pass the evidence gate',()=>{
 const x=evaluateEntryV4Evidence({archiveSummary:archive,prospective:{...future,cohortEvents:3},qa});
 assert.ok(x.blockers.includes('PROSPECTIVE_COUNTS_INCONSISTENT'));
 const y=evaluateEntryV4Evidence({archiveSummary:archive,prospective:{...future,
   improvementReview:{...future.improvementReview,netOutcomeVsBaselinePassed:false}},qa});
 assert.ok(y.blockers.includes('INDEPENDENT_IMPROVEMENT_REVIEW_MISSING'));
 const z=evaluateEntryV4Evidence({archiveSummary:{...archive,candidateV4:{confirmationEvents:NaN,filledEvents:1}}});
 assert.ok(z.blockers.includes('ARCHIVE_OUTCOME_COUNTS_INVALID'));
});

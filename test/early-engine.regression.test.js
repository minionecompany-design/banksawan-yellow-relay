"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// ============================================================
// BANKSAWAN YELLOW — EARLY ENGINE V2
// REGRESSION CONTRACT
//
// IMPORTANT:
// - These prices are benchmark acceptance windows.
// - They MUST NOT be hardcoded inside early-engine.js.
// - Engine must discover EARLY from candle structure only.
// - Historical replay must be chronological / no future leak.
// ============================================================

const {
    evaluateEarlySnapshot
} = require("../early-engine");

const BENCHMARKS = Object.freeze({
    APRUSDT: {
        baseZone: [0.203, 0.215],
        expectedEarlyZone: [0.225, 0.245]
    },

    USELESSUSDT: {
        baseZone: [0.055, 0.065],
        expectedEarlyZone: [0.070, 0.082]
    },

    BTRUSDT: {
        baseZone: [0.028, 0.031],
        expectedEarlyZone: [0.033, 0.039]
    }
});

function inside(value, range) {
    return (
        Number.isFinite(value) &&
        value >= range[0] &&
        value <= range[1]
    );
}

function assertEarlyResult(symbol, result) {
    const benchmark = BENCHMARKS[symbol];

    assert.ok(
        result,
        `${symbol}: engine returned no result`
    );

    assert.equal(
        result.phase,
        "EARLY",
        `${symbol}: expected EARLY, got ${result.phase}`
    );

    assert.ok(
        Number.isFinite(result.signalPrice),
        `${symbol}: signalPrice must be finite`
    );

    assert.ok(
        inside(
            result.signalPrice,
            benchmark.expectedEarlyZone
        ),
        `${symbol}: signalPrice=${result.signalPrice} outside ` +
        `${benchmark.expectedEarlyZone[0]}-${benchmark.expectedEarlyZone[1]}`
    );

    assert.equal(
        result.extended,
        false,
        `${symbol}: EARLY candidate must not already be EXTENDED`
    );
}

// ============================================================
// API CONTRACT
// ============================================================

test(
    "early-engine exposes evaluateEarlySnapshot()",
    () => {
        assert.equal(
            typeof evaluateEarlySnapshot,
            "function"
        );
    }
);

// ============================================================
// HISTORICAL REGRESSION CONTRACTS
//
// Fixtures will be added next.
// Tests deliberately fail until real chronological fixtures
// and early-engine implementation exist.
// ============================================================

test(
    "APR regression: detect EARLY around 0.225-0.245",
    () => {
        const result = evaluateEarlySnapshot({
            symbol: "APRUSDT",
            benchmarkOnly: true
        });

        assertEarlyResult(
            "APRUSDT",
            result
        );
    }
);

test(
    "USELESS regression: detect EARLY around 0.070-0.082",
    () => {
        const result = evaluateEarlySnapshot({
            symbol: "USELESSUSDT",
            benchmarkOnly: true
        });

        assertEarlyResult(
            "USELESSUSDT",
            result
        );
    }
);

test(
    "BTR regression: detect EARLY around 0.033-0.039",
    () => {
        const result = evaluateEarlySnapshot({
            symbol: "BTRUSDT",
            benchmarkOnly: true
        });

        assertEarlyResult(
            "BTRUSDT",
            result
        );
    }
);

module.exports = {
    BENCHMARKS,
    inside
};

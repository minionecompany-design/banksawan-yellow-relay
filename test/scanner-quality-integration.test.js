"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const scanner = require("../scanner");

test("scanner exposes parity and quality functions without starting its loop", () => {
    assert.equal(typeof scanner.evaluateBaseBar, "function");
    assert.equal(typeof scanner.evaluateQuality, "function");
    assert.equal(typeof scanner.processLiveSymbol, "function");
    assert.equal(
        scanner.createQualityConfig({ QUALITY_GATE_MODE: "shadow" }).mode,
        "shadow"
    );
});

test("shadow mode never blocks a raw LONG A benchmark signal", () => {
    assert.equal(
        scanner.shouldDeliverQuality(
            { mode: "shadow" },
            { decision: "WATCH" }
        ),
        true
    );
    assert.equal(
        scanner.shouldDeliverQuality(
            { mode: "enforce" },
            { decision: "WATCH" }
        ),
        false
    );
    assert.equal(
        scanner.shouldDeliverQuality(
            { mode: "enforce" },
            { decision: "READY" }
        ),
        true
    );
});


import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A17-holding-pattern.js', import.meta.url), 'utf8');

function detector() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__detector = { holdingPatternSummary };`, context);
    return context.__detector;
}

function circularHistory({ loops = 2, points = 48, altitude = 12000, altitudeSwing = 120, start = 1700000000000, durationMs = 7 * 60 * 1000 } = {}) {
    const centerLat = 40;
    const centerLon = -75;
    const radius = 0.025;
    return Array.from({ length: points }, (_, index) => {
        const angle = (index / (points - 1)) * Math.PI * 2 * loops;
        return [
            centerLat + Math.sin(angle) * radius,
            centerLon + Math.cos(angle) * radius,
            altitude + (index % 2 ? altitudeSwing : 0),
            start + Math.round(index * durationMs / (points - 1))
        ];
    });
}

test('detects two consistent level turns in the recent trail', () => {
    const { holdingPatternSummary } = detector();
    const result = holdingPatternSummary({ history: circularHistory() });
    assert.ok(result);
    assert.ok(result.loops >= 2);
    assert.ok(result.altitudeRangeFt <= 500);
    assert.equal(result.direction, 'left');
});

test('rejects altitude changes and trails longer than the holding window', () => {
    const { holdingPatternSummary } = detector();
    const highVariance = circularHistory({ altitudeSwing: 700 });
    const longTrail = circularHistory({ durationMs: 9 * 60 * 1000 });
    assert.equal(holdingPatternSummary({ history: highVariance }), null);
    assert.equal(holdingPatternSummary({ history: longTrail }), null);
});

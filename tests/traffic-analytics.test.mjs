import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A23-traffic-analytics.js', import.meta.url), 'utf8');

function helpers() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__analytics = { flowVectorBins, flowVectorEndpoint, altitudeMeshCells, airlineViewportRows, routeDivergenceNm, routeDivergenceCandidates, arrivalRushHistogram };`, context);
    const names = ['flowVectorBins', 'flowVectorEndpoint', 'altitudeMeshCells', 'airlineViewportRows', 'routeDivergenceNm', 'routeDivergenceCandidates', 'arrivalRushHistogram'];
    return Object.fromEntries(names.map(name => [name, (...args) => JSON.parse(JSON.stringify(context.__analytics[name](...args)))]));
}

test('aggregates movement vectors and mean altitude by grid cell', () => {
    const { flowVectorBins, altitudeMeshCells } = helpers();
    const aircraft = {
        a: { lat: 10.1, lon: 20.1, track: 90, gs: 200, alt_baro: 10000 },
        b: { lat: 10.2, lon: 20.2, track: 90, gs: 100, alt_baro: 20000 }
    };
    assert.equal(flowVectorBins(aircraft, 0.5)[0].count, 2);
    assert.ok(flowVectorBins(aircraft, 0.5)[0].track > 89 && flowVectorBins(aircraft, 0.5)[0].track < 91);
    assert.equal(altitudeMeshCells(aircraft, 1)[0].altitude, 15000);
});

test('groups airlines with average flight levels and produces vector endpoints', () => {
    const { airlineViewportRows, flowVectorEndpoint } = helpers();
    const rows = airlineViewportRows({
        a: { flight: 'DAL123', airlineName: 'Delta', alt_baro: 30000 },
        b: { flight: 'DAL456', airlineName: 'Delta', alt_baro: 34000 },
        c: { flight: 'UAL9', airlineName: 'United', alt_baro: 28000 }
    });
    assert.deepEqual(rows[0], { name: 'Delta', count: 2, averageFlightLevel: 320 });
    assert.deepEqual(flowVectorEndpoint(0, 0, 90, 1).map(value => Number(value.toFixed(4))), [0, 1]);
});

test('detects off-route traffic and buckets observed arrivals by UTC hour', () => {
    const { routeDivergenceNm, routeDivergenceCandidates, arrivalRushHistogram } = helpers();
    const origin = { lat: 0, lon: 0 }, destination = { lat: 0, lon: 10 };
    const ac = { hex: 'OFF123', lat: 1, lon: 5, from: 'AAA', to: 'BBB', lastSeen: 1700000000000, history: [[1, 5, 20000, 1700000000000]] };
    assert.ok(routeDivergenceNm(ac, origin, destination) > 50);
    const anomalies = routeDivergenceCandidates({ ac }, { AAA: origin, BBB: destination }, 40);
    assert.equal(anomalies.length, 1);
    const histogram = arrivalRushHistogram({ ac }, 'BBB', 1700000000000 + 3600000);
    assert.equal(histogram[new Date(1700000000000).getUTCHours()], 1);
});

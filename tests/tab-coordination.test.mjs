import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/10-utils.js', import.meta.url), 'utf8');

function createLeader(overrides = {}) {
    const context = {
        CONFIG: { debug: false, refreshInterval: 6000 },
        document: { visibilityState: 'visible', addEventListener() {} },
        window: { addEventListener() {} },
        performance: { timeOrigin: 100 },
        console,
        setInterval,
        clearInterval,
        setTimeout,
        clearTimeout,
        requestAnimationFrame: () => 1,
        cancelAnimationFrame() {}
    };
    Object.assign(context, overrides);
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__tabLeader = tabLeader;`, context);
    return { leader: context.__tabLeader, context };
}

test('follower tabs consume a newer IndexedDB snapshot and notify the renderer', async () => {
    const payload = { timestamp: 200, ac: { ABC123: { hex: 'ABC123', lat: 40, lon: -74 } } };
    let received = null;
    const { leader, context } = createLeader({ skytrackDB: { loadDatabase: async () => payload } });
    leader.isLeader = false;
    leader._onSnapshot = snapshot => { received = snapshot; };
    assert.equal(await leader.syncFromStore(200), true);
    assert.equal(received, payload);
    assert.equal(leader._lastSnapshotAt, 200);
    assert.equal(context.skytrackDB !== undefined, true);
    assert.equal(await leader.syncFromStore(200), false);
});

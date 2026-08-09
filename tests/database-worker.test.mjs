import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const moduleSource = fs.readFileSync(new URL('../src/modules/11-database-worker.js', import.meta.url), 'utf8');

function workerSource() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${moduleSource}\n globalThis.__workerSource = dbWorkerParser.source();`, context);
    return context.__workerSource;
}

function parse(kind, text) {
    const messages = [];
    const context = {
        TextDecoder,
        self: { postMessage(message) { messages.push(message); } }
    };
    vm.createContext(context);
    vm.runInContext(workerSource(), context);
    context.self.onmessage({ data: { id: 1, kind, buffer: new TextEncoder().encode(text).buffer } });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, 1);
    assert.equal(messages[0].error, undefined);
    return messages[0].data;
}

test('database worker parses JSON registrations and CSV route rows', () => {
    const registrations = parse('registrations', JSON.stringify({ ABC123: { r: 'N123' } }));
    assert.deepEqual(JSON.parse(JSON.stringify(registrations)), { ABC123: { r: 'N123' } });

    const routes = parse('routes', '2B,410,AER,2965,KZN,2990,,0,CR2\n2B,410,ASF,2966,\\N,2990,,0,CR2\n');
    assert.deepEqual(JSON.parse(JSON.stringify(routes)), [{ airline: '2B', from: 'AER', to: 'KZN' }]);
});

test('database worker filters airports and preserves quoted CSV fields', () => {
    const csv = [
        'id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,iso_country,municipality,wikipedia_link,iata_code',
        '1,KAAA,small_airport,"Alpha, Field",40,-74,100,US,Alpha,,AAA',
        '2,KBBB,heliport,Bravo,41,-75,20,US,Bravo,,BBB',
        '3,KCCC,closed,Closed,42,-76,30,US,Closed,,'
    ].join('\n');
    const airports = parse('airports', csv);
    assert.equal(airports.length, 1);
    assert.equal(airports[0].icao, 'KAAA');
    assert.equal(airports[0].name, 'Alpha, Field');
    assert.equal(airports[0].iata, 'AAA');
});

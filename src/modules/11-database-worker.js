
    // ============ OFF-MAIN-THREAD DATABASE PARSING ============
    // The release remains a single file, so the worker is created from a blob
    // rather than a second network-loaded script. Database fetches transfer
    // their ArrayBuffer into this worker; only the parsed, purpose-built data
    // comes back to the main thread.
    const dbWorkerParser = (() => {
        const workerSource = `
            function parseCsv(text) {
                const rows = [], row = [];
                let field = '', quoted = false;
                for (let i = 0; i < text.length; i++) {
                    const ch = text[i];
                    if (quoted) {
                        if (ch === '"') {
                            if (text[i + 1] === '"') { field += '"'; i++; }
                            else quoted = false;
                        } else {
                            field += ch;
                        }
                    } else if (ch === '"') {
                        quoted = true;
                    } else if (ch === ',') {
                        row.push(field.trim()); field = '';
                    } else if (ch === '\\n') {
                        row.push(field.trim()); rows.push(row.splice(0)); field = '';
                    } else if (ch !== '\\r') {
                        field += ch;
                    }
                }
                if (field.length || row.length) { row.push(field.trim()); rows.push(row); }
                return rows;
            }

            function cleanHex(value) {
                const hex = String(value || '').replace(/[$\\\" ]/g, '').toUpperCase();
                return /^[A-F0-9]{6}$/.test(hex) ? hex : '';
            }

            function parseRows(kind, text) {
                if (kind === 'registrations') return JSON.parse(text);
                const rows = parseCsv(text);

                if (kind === 'airports') {
                    const headers = rows.shift() || [];
                    const index = new Map(headers.map((header, i) => [header, i]));
                    return rows.reduce((out, fields) => {
                        const ident = fields[index.get('ident')];
                        const type = fields[index.get('type')];
                        const lat = Number.parseFloat(fields[index.get('latitude_deg')]);
                        const lon = Number.parseFloat(fields[index.get('longitude_deg')]);
                        if (!ident || !Number.isFinite(lat) || !Number.isFinite(lon) || type === 'closed' || type === 'heliport') return out;
                        const name = fields[index.get('name')] || '';
                        const upper = name.toUpperCase();
                        out.push({
                            icao: ident,
                            iata: fields[index.get('iata_code')] || '',
                            name,
                            lat,
                            lon,
                            elevation: Number.parseInt(fields[index.get('elevation_ft')], 10) || 0,
                            country: fields[index.get('iso_country')] || '',
                            city: fields[index.get('municipality')] || '',
                            type: type || '',
                            wiki: fields[index.get('wikipedia_link')] || '',
                            isMilitary: upper.includes('AIR FORCE BASE') || upper.includes(' AFB') || upper.includes('NAVAL AIR') || upper.includes(' NAS ') || upper.includes('MCAS ') || upper.includes('MARINE CORPS') || upper.includes(' RAF ') || upper.includes('MILITARY') || upper.includes('AIR BASE')
                        });
                        return out;
                    }, []);
                }

                if (kind === 'routes') {
                    return rows.reduce((out, fields) => {
                        const airline = (fields[0] || '').trim();
                        const from = (fields[2] || '').trim();
                        const to = (fields[4] || '').trim();
                        if (airline && from && to && from !== '\\\\N' && to !== '\\\\N') out.push({ airline, from, to });
                        return out;
                    }, []);
                }

                if (kind === 'categories') {
                    return rows.slice(1).reduce((out, fields) => {
                        const name = (fields[0] || '').trim();
                        if (name) out.push({ name, description: (fields[1] || '').trim(), count: Number.parseInt(fields[2], 10) || 0 });
                        return out;
                    }, []);
                }

                if (kind === 'badgers' || kind === 'civilian') {
                    return rows.slice(1).reduce((out, fields) => {
                        const hex = cleanHex(fields[0]);
                        if (hex) out.push({
                            hex,
                            registration: fields[1] || '',
                            operator: fields[2] || '',
                            type: fields[3] || '',
                            typeCode: fields[4] || '',
                            category: fields[9] || (kind === 'badgers' ? 'VIP' : 'Civilian'),
                            link: fields[10] || ''
                        });
                        return out;
                    }, []);
                }

                throw new Error('Unknown database parser: ' + kind);
            }

            self.onmessage = event => {
                const message = event.data || {};
                try {
                    const text = new TextDecoder().decode(message.buffer);
                    const data = parseRows(message.kind, text);
                    self.postMessage({ id: message.id, data });
                } catch (error) {
                    self.postMessage({ id: message.id, error: error && error.message || String(error) });
                }
            };
        `;

        let worker = null;
        let workerUrl = null;
        let nextId = 0;
        const pending = new Map();

        function dispose(error) {
            if (worker) {
                try { worker.terminate(); } catch (_) {}
            }
            if (workerUrl) {
                try { URL.revokeObjectURL(workerUrl); } catch (_) {}
            }
            worker = null;
            workerUrl = null;
            for (const request of pending.values()) request.reject(error);
            pending.clear();
        }

        function ensureWorker() {
            if (worker) return worker;
            if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL !== 'function') return null;
            try {
                const blob = new Blob([workerSource], { type: 'application/javascript' });
                workerUrl = URL.createObjectURL(blob);
                worker = new Worker(workerUrl);
                worker.onmessage = event => {
                    const message = event.data || {};
                    const request = pending.get(message.id);
                    if (!request) return;
                    pending.delete(message.id);
                    if (message.error) request.reject(new Error(message.error));
                    else request.resolve(message.data);
                };
                worker.onerror = event => dispose(new Error(event.message || 'Database worker failed'));
                return worker;
            } catch (_) {
                dispose(new Error('Database worker unavailable'));
                return null;
            }
        }

        return {
            parse(kind, buffer) {
                const target = ensureWorker();
                if (!target || !(buffer instanceof ArrayBuffer)) return Promise.resolve(null);
                return new Promise((resolve, reject) => {
                    const id = ++nextId;
                    pending.set(id, { resolve, reject });
                    try { target.postMessage({ id, kind, buffer }, [buffer]); }
                    catch (error) { pending.delete(id); reject(error); }
                });
            },
            source() { return workerSource; }
        };
    })();

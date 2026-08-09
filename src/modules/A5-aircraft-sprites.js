
    // ============ CATEGORY AIRCRAFT SVG SPRITES ============
    // A compact inline symbol sheet keeps marker rendering local and makes
    // the ADS-B category meaningful at a glance. The silhouettes follow the
    // same top-down convention as tar1090's marker artwork, while remaining
    // intentionally small enough to ship in the single-file build.
    const AIRCRAFT_SPRITE_SHEET_ID = 'skytrack-aircraft-sprite-sheet';
    const AIRCRAFT_SPRITE_NS = 'http://www.w3.org/2000/svg';
    const AIRCRAFT_SPRITES = Object.freeze({
        A1: {
            label: 'Light aircraft',
            body: '<path d="M24 3l2.4 13.1 12.8 6.2v2.8l-12.8 2.8-.8 8.5 4.2 4.2v1.7L24 39.8l-5.8 2.5v-1.7l4.2-4.2-.8-8.5-12.8-2.8v-2.8l12.8-6.2L24 3z"/><path d="M15 7h18v2H15z"/>',
            noRotate: false
        },
        A2: {
            label: 'Small jet',
            body: '<path d="M24 3l2.1 12.3 14 7.5v2.5l-14.2 1.6-.8 8.1 4.9 4.2v1.8L24 38.8l-6 3.2v-1.8l4.9-4.2-.8-8.1-14.2-1.6V24.8l14-7.5L24 3z"/>',
            noRotate: false
        },
        A3: {
            label: 'Large aircraft',
            body: '<path d="M24 2l2.5 13.6 16 8v2.8l-16.2 1.8-.9 8.5 4.9 4.4v1.8L24 39.8l-6.3 3.1v-1.8l4.9-4.4-.9-8.5-16.2-1.8v-2.8l16-8L24 2z"/><circle cx="18" cy="25" r="1.6"/><circle cx="30" cy="25" r="1.6"/>',
            noRotate: false
        },
        A5: {
            label: 'Heavy aircraft',
            body: '<path d="M24 1.5l2.8 14.2 16.7 8.6v3l-16.8 1.5-.9 8.8 5.2 4.6v1.8L24 40l-7 4v-1.8l5.2-4.6-.9-8.8-16.8-1.5v-3l16.7-8.6L24 1.5z"/><circle cx="16.5" cy="27" r="1.8"/><circle cx="21" cy="27" r="1.8"/><circle cx="27" cy="27" r="1.8"/><circle cx="31.5" cy="27" r="1.8"/>',
            noRotate: false
        },
        A7: {
            label: 'Rotorcraft',
            body: '<ellipse cx="24" cy="18" rx="16" ry="2"/><path d="M22 9h4v17l4.8 5.3v2.2h-2.3L24 29l-4.5 4.5h-2.3v-2.2L22 26V9z"/><path d="M15 15h18v6H15z"/><circle cx="24" cy="18" r="2.3"/>',
            noRotate: false
        },
        B1: {
            label: 'Glider',
            body: '<path d="M24 2.5l1.4 16.1 19 3.1v3.2l-19 1.3-1.4 15.8-1.4-15.8-19-1.3v-3.2l19-3.1L24 2.5z"/><path d="M20 18.2h8v3.2h-8z"/>',
            noRotate: false
        },
        B2: {
            label: 'Balloon',
            body: '<path d="M24 3C15.2 3 9 9.8 9 18.2c0 8 5.4 12.6 12 14.2v4.1h6v-4.1c6.6-1.6 12-6.2 12-14.2C39 9.8 32.8 3 24 3z"/><path d="M20 36.5h8v5h-8z"/><path d="M18 19c0-5 2.7-9 6-9s6 4 6 9-2.7 9-6 9-6-4-6-9z" fill="none" stroke="currentColor" stroke-width="1.5"/>',
            noRotate: true
        },
        B4: {
            label: 'Ultralight aircraft',
            body: '<path d="M24 4l4.2 13 13.8 4.5v2.7l-13.6 1.2-2.7 11.3h-3.4l-2.7-11.3-13.6-1.2v-2.7L19.8 17 24 4z"/><path d="M12 15l-5-3-1.5 2.3 6.1 4.2zM36 15l5-3 1.5 2.3-6.1 4.2z"/>',
            noRotate: false
        },
        B6: {
            label: 'Unmanned aerial vehicle',
            body: '<path d="M24 4l4.2 13 13.8 4.5v2.7l-13.6 1.2-2.7 11.3h-3.4l-2.7-11.3-13.6-1.2v-2.7L19.8 17 24 4z"/><path d="M12 15l-5-3-1.5 2.3 6.1 4.2zM36 15l5-3 1.5 2.3-6.1 4.2z"/><circle cx="24" cy="23" r="2"/>',
            noRotate: false
        },
        B7: {
            label: 'Space vehicle',
            body: '<path d="M24 2c5.8 4.3 8.3 10.5 7.7 17.8L27 29.5h-6l-4.7-9.7C15.7 12.5 18.2 6.3 24 2z"/><path d="M18.3 22.5L9 28l3.5 3.5 8-3zM29.7 22.5L39 28l-3.5 3.5-8-3z"/><path d="M21 30h6l3 8-6-2-6 2z"/><circle cx="24" cy="14" r="2"/>',
            noRotate: false
        },
        GROUND: {
            label: 'Ground vehicle',
            body: '<rect x="12" y="12" width="24" height="24" rx="4"/>',
            noRotate: true
        },
        UNKNOWN: {
            label: 'Unknown aircraft',
            body: '<path d="M24 4l2.2 12.6 12.4 7v2.5l-12.6 1.5-.8 8.2 4 4v1.6L24 38.8l-5.2 2.6v-1.6l4-4-.8-8.2-12.6-1.5v-2.5l12.4-7L24 4z"/>',
            noRotate: false
        }
    });

    const AIRCRAFT_SPRITE_CATEGORIES = Object.freeze(['A1', 'A2', 'A3', 'A5', 'A7', 'B1', 'B2', 'B4', 'B6', 'B7']);
    const AIRCRAFT_SPRITE_CATEGORY_ALIASES = Object.freeze({ A4: 'A3', A6: 'A2', B3: 'B1' });

    function aircraftSpriteCategory(ac = {}) {
        const rawCategory = String(ac.category || '').trim().toUpperCase();
        if (AIRCRAFT_SPRITES[rawCategory]) return rawCategory;
        if (AIRCRAFT_SPRITE_CATEGORY_ALIASES[rawCategory]) return AIRCRAFT_SPRITE_CATEGORY_ALIASES[rawCategory];

        const type = String(ac.t || '').trim().toUpperCase();
        const desc = String(ac.desc || '').trim().toUpperCase();
        const searchable = type + ' ' + desc;
        if (ac.alt_baro === 'ground' || ac.alt_baro === 0 || /^C[0-3]$/.test(rawCategory)) return 'GROUND';
        if (/BALL|BLIM|PARA/.test(searchable)) return 'B2';
        if (/GLID|S6|S10S|S12/.test(searchable)) return 'B1';
        if (/DRON|UAV|Q1|Q4|Q9|Q25|HRON/.test(searchable)) return 'B6';
        if (/SAT|SPAC|ROCK|LEOP|STRATO/.test(searchable)) return 'B7';
        if (desc === 'H' || /^(?:H\d|R(?:22|44|66)|AS\d|EC\d|S(?:6|7|9)\d|V22)/.test(type) || /HELI|GYRO|ROTOR/.test(searchable)) return 'A7';
        if (/A380|A388|A350|A330|A340|B747|B777|B767|B787|B748|MD11|DC10|A225|A124|C5M/.test(searchable)) return 'A5';
        if (/A3\d\d|A321|B737|B757|B767|E17|E19|CRJ|RJ|AIRLINER/.test(searchable)) return 'A3';
        if (/JET|L2J|FA20|FA50|GULF|GLF|C5\d\d|LJ\d|CL\d|BIZ/.test(searchable)) return 'A2';
        return 'A1';
    }

    function ensureAircraftSpriteSheet() {
        if (typeof document === 'undefined') return false;
        if (document.getElementById?.(AIRCRAFT_SPRITE_SHEET_ID)) return true;
        const sheet = document.createElementNS(AIRCRAFT_SPRITE_NS, 'svg');
        sheet.setAttribute('id', AIRCRAFT_SPRITE_SHEET_ID);
        sheet.setAttribute('class', 'aircraft-sprite-sheet');
        sheet.setAttribute('aria-hidden', 'true');
        sheet.setAttribute('focusable', 'false');
        const defs = document.createElementNS(AIRCRAFT_SPRITE_NS, 'defs');
        Object.entries(AIRCRAFT_SPRITES).forEach(([category, sprite]) => {
            const symbol = document.createElementNS(AIRCRAFT_SPRITE_NS, 'symbol');
            symbol.setAttribute('id', 'skytrack-aircraft-' + category);
            symbol.setAttribute('viewBox', '0 0 48 48');
            symbol.setAttribute('aria-label', sprite.label);
            symbol.innerHTML = sprite.body;
            defs.appendChild(symbol);
        });
        sheet.appendChild(defs);
        (document.body || document.documentElement)?.appendChild(sheet);
        return true;
    }

    function aircraftSpriteSvg(ac = {}, options = {}) {
        ensureAircraftSpriteSheet();
        const category = aircraftSpriteCategory(ac);
        const sprite = AIRCRAFT_SPRITES[category] || AIRCRAFT_SPRITES.UNKNOWN;
        const size = Number.isFinite(options.size) ? Math.max(12, Math.min(96, options.size)) : 28;
        const rotation = Number.isFinite(options.rotation) ? options.rotation : 0;
        const filter = String(options.filter || '');
        const transform = sprite.noRotate ? '' : 'transform:rotate(' + rotation + 'deg);transform-origin:50% 50%;transform-box:fill-box;';
        return '<svg class="sprite-icon" xmlns="http://www.w3.org/2000/svg" data-sprite-category="' + category + '" viewBox="0 0 48 48" width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false" style="width:' + size + 'px;height:' + size + 'px;color:#fff;filter:' + filter + ';' + transform + '"><use href="#skytrack-aircraft-' + category + '" xlink:href="#skytrack-aircraft-' + category + '"></use></svg>';
    }

    if (typeof document !== 'undefined') {
        const installAircraftSprites = () => ensureAircraftSpriteSheet();
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installAircraftSprites, { once: true });
        else installAircraftSprites();
    }

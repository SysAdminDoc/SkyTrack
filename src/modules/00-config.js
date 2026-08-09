
    // ============================================================
    // SKYTRACK - Full Featured Aviation Intelligence Platform
    // ============================================================
    const CONFIG = {
        center: [39.8, -98.5],
        zoom: 5,
        localZoom: 9,
        refreshInterval: 6000,
        cacheExpiry: 300000,
        debug: (new URLSearchParams(window.location.search)).has('debug'),
        isLocalFile: window.location.protocol === 'file:',
        // Defaults for the optional API credentials panel.
        // Left empty on purpose — previously shipped defaults here were public,
        // which is a leak. Users can enter their own in the Settings panel.
        defaultCredentials: { clientId: '', clientSecret: '' },
        corsProxies: [
            url => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(url),
            url => 'https://corsproxy.io/?' + encodeURIComponent(url),
            url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
        ],
        // Self-hosted asset URLs
        silhouetteUrl: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/assets/silhouettes/',
        airlineBannerUrl: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/assets/airlines/',
        flagUrl: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/assets/flags/',
        // External APIs (cannot self-host)
        planespottersApi: 'https://api.planespotters.net/pub/photos/hex/'
    };
    const CUSTOM_PROXY_STORAGE_KEY = 'skytrack_custom_proxy_url';
    function normalizeCustomProxyUrl(value) {
        try {
            const parsed = new URL(String(value || '').trim());
            if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return '';
            parsed.hash = '';
            return parsed.href;
        } catch (_) {
            return '';
        }
    }
    function buildCustomProxyUrl(proxyUrl, targetUrl) {
        const normalized = normalizeCustomProxyUrl(proxyUrl);
        if (!normalized || !targetUrl) return '';
        try {
            const endpoint = new URL(normalized);
            endpoint.searchParams.set('url', String(targetUrl));
            return endpoint.href;
        } catch (_) {
            return '';
        }
    }
    const DATA_URLS = {
        // Aircraft Registration (tar1090-db)
        registrations: {
            urls: [
                'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/aircraft/registrations.json.gz',
                'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/aircraft/registrations.json',
                'https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/db.json.gz'
            ]
        },
        types: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/aircraft/types.json',
        icaoTypes: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/aircraft/icao_types.json',
            fallback: 'https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/icao_aircraft_types.json'
        },
        ranges: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/aircraft/ranges.json',
            fallback: 'https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/ranges.json'
        },

        // Interesting Aircraft (plane-alert-db)
        interesting: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/aircraft/interesting.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-db.csv'
        },
        categories: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/categories/plane-alert-categories.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-categories.csv'
        },
        badgersBest: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/aircraft/badgers-best.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/badgers-best.csv'
        },
        civilianInteresting: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/aircraft/plane-alert-civ.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-civ.csv'
        },
        planeImages: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/images/plane_images.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane_images.csv'
        },

        // Military/Government (plane-alert-db)
        military: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/military/plane-alert-mil.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-mil.csv'
        },
        militaryImages: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/images/plane-alert-mil-images.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-mil-images.csv'
        },
        government: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/military/plane-alert-gov.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-gov.csv'
        },
        governmentImages: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/images/plane-alert-gov-images.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-gov-images.csv'
        },
        police: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/military/plane-alert-pol.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-pol.csv'
        },
        policeImages: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/images/plane-alert-pol-images.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-pol-images.csv'
        },
        pia: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/military/plane-alert-pia.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-pia.csv'
        },
        civilianImages: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/images/plane-alert-civ-images.csv',
            fallback: 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-civ-images.csv'
        },

        // Airlines
        airlines: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airlines/airlines.csv',
            fallback: 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat'
        },
        alliances: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airlines/alliances.csv',
            fallback: null
        },
        callsignPrefix: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airlines/callsign-prefix.json',
            fallback: null
        },

        // Airports
        airports: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airports/airports.csv',
            fallback: 'https://davidmegginson.github.io/ourairports-data/airports.csv'
        },
        airportCoords: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airports/airport-coords.json',
            fallback: 'https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/airport-coords.json'
        },
        frequencies: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airports/frequencies.csv',
            fallback: 'https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv'
        },
        runways: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airports/runways.csv',
            fallback: 'https://davidmegginson.github.io/ourairports-data/runways.csv'
        },
        countries: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airports/countries.csv',
            fallback: 'https://davidmegginson.github.io/ourairports-data/countries.csv'
        },

        // Routes
        routes: {
            primary: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/routes/routes.csv',
            fallback: 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat'
        },

        // Images (self-hosted)
        aircraftPhotos: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/assets/aircraft_photos/',
        airlineLogos: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/assets/airlines/',
        silhouettes: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/assets/silhouettes/',
        flags: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/assets/flags/'
    };

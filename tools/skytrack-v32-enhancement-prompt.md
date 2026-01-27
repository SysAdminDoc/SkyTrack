# SkyTrack v3.2 Enhancement Prompt

You are enhancing SkyTrack v3.1 to v3.2 with new databases, category support, VIP aircraft highlighting, and improved data organization.

## Overview of Changes

1. **New Database URLs** - Updated self-hosted paths for new file structure
2. **Categories Database** - 51 category definitions with descriptions
3. **Badger's Best VIP Filter** - Highlight "must-see" aircraft
4. **Civilian Interesting Database** - 4,500+ civilian notable aircraft
5. **Category Tooltips** - Show category descriptions on hover
6. **Enhanced Image Sources** - Pre-populated image URLs from plane-alert-db
7. **Airport Coordinates (Fast)** - Compact JSON for quick lookups
8. **Improved Classification UI** - Show category badges with colors

---

## PART 1: Update DATA_URLS Configuration

Replace the existing DATA_URLS object with this expanded version:

```javascript
const DATA_URLS = {
    // Aircraft Registration (tar1090-db)
    registrations: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/aircraft/registrations.json',
    icaoTypes: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/aircraft/icao_types.json',
    ranges: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/aircraft/ranges.json',
    
    // Interesting Aircraft (plane-alert-db)
    interesting: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/interesting/plane-alert-db.csv',
    categories: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/interesting/plane-alert-categories.csv',
    badgersBest: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/interesting/badgers-best.csv',
    civilianInteresting: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/interesting/plane-alert-civ.csv',
    planeImages: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/interesting/plane_images.csv',
    
    // Military/Government (plane-alert-db)
    military: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/military/plane-alert-mil.csv',
    militaryImages: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/military/plane-alert-mil-images.csv',
    government: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/military/plane-alert-gov.csv',
    governmentImages: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/military/plane-alert-gov-images.csv',
    police: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/military/plane-alert-pol.csv',
    policeImages: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/military/plane-alert-pol-images.csv',
    pia: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/military/plane-alert-pia.csv',
    civilianImages: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/military/plane-alert-civ-images.csv',
    
    // Airlines
    airlines: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airlines/airlines.csv',
    alliances: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airlines/alliances.csv',
    callsignPrefix: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airlines/callsign-prefix.json',
    
    // Airports
    airports: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airports/airports.csv',
    airportCoords: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airports/airport-coords.json',
    frequencies: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airports/frequencies.csv',
    runways: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airports/runways.csv',
    countries: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/airports/countries.csv',
    
    // Routes
    routes: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/routes/routes.csv',
    
    // Images (self-hosted)
    aircraftPhotos: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/assets/aircraft_photos/',
    airlineLogos: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/assets/airlines/',
    silhouettes: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/assets/silhouettes/',
    flags: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/assets/flags/'
};
```

---

## PART 2: Add Categories Database

Add this new database object for category definitions:

```javascript
// ============ CATEGORIES DATABASE ============
const categoriesDB = {
    categories: new Map(),
    loaded: false,
    
    async init() {
        try {
            const resp = await fetch(DATA_URLS.categories);
            if (!resp.ok) return;
            const text = await resp.text();
            this.parseCSV(text);
            this.loaded = true;
            console.log('Categories DB loaded:', this.categories.size, 'categories');
        } catch (e) {
            console.warn('Categories DB failed:', e);
        }
    },
    
    parseCSV(text) {
        // Format: Category,Description,Count
        const lines = text.trim().split('\n').slice(1);
        for (const line of lines) {
            const match = line.match(/^"?([^",]+)"?,\s*"?([^"]+)"?,?\s*(\d+)?/);
            if (match) {
                const category = match[1].trim();
                const description = match[2].trim();
                const count = parseInt(match[3]) || 0;
                this.categories.set(category.toLowerCase(), {
                    name: category,
                    description: description,
                    count: count,
                    color: this.getCategoryColor(category)
                });
            }
        }
    },
    
    getCategoryColor(category) {
        // Assign colors based on category type
        const colorMap = {
            // Military - Red tones
            'usaf': '#DC2626', 'raf': '#B91C1C', 'gaf': '#991B1B',
            'united states navy': '#1E40AF', 'united states marine corps': '#1E3A8A',
            'royal navy fleet air arm': '#1E3A8A', 'other navies': '#3B82F6',
            'other air forces': '#EF4444', 'gunship': '#7F1D1D', 'zoomies': '#F97316',
            'special forces': '#4B5563', 'toy soldiers': '#6B7280',
            'army air corps': '#78716C',
            
            // Government - Blue tones
            'governments': '#2563EB', 'dictator alert': '#7C3AED', 
            'oligarch': '#A855F7', 'quango': '#6366F1',
            
            // Police/Emergency - Blue/Yellow
            'police forces': '#3B82F6', 'uk national police air service': '#60A5FA',
            'coastguard': '#0EA5E9', 'flying doctors': '#EC4899',
            'aerial firefighter': '#F59E0B', 'nuclear': '#FBBF24',
            
            // Civilian interesting - Green tones
            'historic': '#84CC16', 'distinctive': '#22C55E', 'joe cool': '#10B981',
            'bizjets': '#14B8A6', 'gas bags': '#06B6D4',
            
            // Surveillance/Intel - Purple
            'oxcart': '#8B5CF6', 'uav': '#A78BFA', 'pia': '#C084FC',
            
            // Entertainment/Celebrity
            'as seen on tv': '#F472B6', "don't you know who i am?": '#FB7185',
            'aerobatic teams': '#FB923C', 'football': '#34D399',
            
            // Misc
            'climate crisis': '#64748B', 'hired gun': '#78716C',
            'ptolemy would be proud': '#A3E635', 'watch me fly': '#4ADE80',
            'jump johnny jump': '#FCD34D', 'dogs with jobs': '#FBBF24',
            'jesus he knows me': '#E879F9', 'vanity plate': '#C084FC',
            'perfectly serviceable aircraft': '#94A3B8',
            'you came here in that thing?': '#FB7185', 'big hello': '#38BDF8',
            'da comrade': '#EF4444', 'ukraine': '#FACC15',
            'royal aircraft': '#F59E0B', 'radiohead': '#DC2626', 'cap': '#60A5FA'
        };
        
        return colorMap[category.toLowerCase()] || '#6B7280';
    },
    
    getCategory(categoryName) {
        if (!categoryName) return null;
        return this.categories.get(categoryName.toLowerCase());
    },
    
    getDescription(categoryName) {
        const cat = this.getCategory(categoryName);
        return cat ? cat.description : null;
    },
    
    getColor(categoryName) {
        const cat = this.getCategory(categoryName);
        return cat ? cat.color : '#6B7280';
    }
};
```

---

## PART 3: Add Badger's Best (VIP) Database

Add this database for VIP/must-see aircraft:

```javascript
// ============ BADGER'S BEST (VIP) DATABASE ============
const badgersBestDB = {
    aircraft: new Map(),
    loaded: false,
    
    async init() {
        try {
            const resp = await fetch(DATA_URLS.badgersBest);
            if (!resp.ok) return;
            const text = await resp.text();
            this.parseCSV(text);
            this.loaded = true;
            console.log("Badger's Best DB loaded:", this.aircraft.size, 'VIP aircraft');
        } catch (e) {
            console.warn("Badger's Best DB failed:", e);
        }
    },
    
    parseCSV(text) {
        const lines = text.trim().split('\n').slice(1);
        for (const line of lines) {
            const parts = this.parseLine(line);
            if (parts.length >= 5) {
                const hex = parts[0].replace(/[$"]/g, '').trim().toUpperCase();
                if (hex && /^[A-F0-9]{6}$/i.test(hex)) {
                    this.aircraft.set(hex, {
                        registration: parts[1]?.replace(/"/g, '').trim() || '',
                        operator: parts[2]?.replace(/"/g, '').trim() || '',
                        type: parts[3]?.replace(/"/g, '').trim() || '',
                        typeCode: parts[4]?.replace(/"/g, '').trim() || '',
                        category: parts[9]?.replace(/"/g, '').trim() || 'VIP',
                        link: parts[10]?.replace(/"/g, '').trim() || ''
                    });
                }
            }
        }
    },
    
    parseLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    },
    
    isVIP(hex) {
        return this.aircraft.has(hex?.toUpperCase());
    },
    
    getByHex(hex) {
        return this.aircraft.get(hex?.toUpperCase());
    }
};
```

---

## PART 4: Add Civilian Interesting Database

Add this database for civilian notable aircraft:

```javascript
// ============ CIVILIAN INTERESTING DATABASE ============
const civilianDB = {
    aircraft: new Map(),
    loaded: false,
    
    async init() {
        try {
            const resp = await fetch(DATA_URLS.civilianInteresting);
            if (!resp.ok) return;
            const text = await resp.text();
            this.parseCSV(text);
            this.loaded = true;
            console.log('Civilian Interesting DB loaded:', this.aircraft.size, 'aircraft');
        } catch (e) {
            console.warn('Civilian Interesting DB failed:', e);
        }
    },
    
    parseCSV(text) {
        const lines = text.trim().split('\n').slice(1);
        for (const line of lines) {
            const parts = this.parseLine(line);
            if (parts.length >= 5) {
                const hex = parts[0].replace(/[$"]/g, '').trim().toUpperCase();
                if (hex && /^[A-F0-9]{6}$/i.test(hex)) {
                    this.aircraft.set(hex, {
                        registration: parts[1]?.replace(/"/g, '').trim() || '',
                        operator: parts[2]?.replace(/"/g, '').trim() || '',
                        type: parts[3]?.replace(/"/g, '').trim() || '',
                        typeCode: parts[4]?.replace(/"/g, '').trim() || '',
                        category: parts[9]?.replace(/"/g, '').trim() || 'Civilian',
                        tags: [
                            parts[6]?.replace(/"/g, '').trim(),
                            parts[7]?.replace(/"/g, '').trim(),
                            parts[8]?.replace(/"/g, '').trim()
                        ].filter(t => t),
                        link: parts[10]?.replace(/"/g, '').trim() || ''
                    });
                }
            }
        }
    },
    
    parseLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    },
    
    getByHex(hex) {
        return this.aircraft.get(hex?.toUpperCase());
    },
    
    isCivilianInteresting(hex) {
        return this.aircraft.has(hex?.toUpperCase());
    }
};
```

---

## PART 5: Add Fast Airport Coordinates Lookup

Add this compact airport lookup for faster route detection:

```javascript
// ============ FAST AIRPORT COORDINATES ============
const airportCoordsDB = {
    airports: new Map(),
    loaded: false,
    
    async init() {
        try {
            const resp = await fetch(DATA_URLS.airportCoords);
            if (!resp.ok) return;
            const data = await resp.json();
            // Format: { "KJFK": [lat, lon], "KLAX": [lat, lon], ... }
            for (const [code, coords] of Object.entries(data)) {
                if (Array.isArray(coords) && coords.length >= 2) {
                    this.airports.set(code.toUpperCase(), {
                        lat: coords[0],
                        lon: coords[1]
                    });
                }
            }
            this.loaded = true;
            console.log('Airport Coords DB loaded:', this.airports.size, 'airports');
        } catch (e) {
            console.warn('Airport Coords DB failed:', e);
        }
    },
    
    getCoords(icao) {
        return this.airports.get(icao?.toUpperCase());
    },
    
    // Fast distance calculation to find nearest airport
    findNearest(lat, lon, maxDistKm = 50) {
        let nearest = null;
        let nearestDist = Infinity;
        
        for (const [code, coords] of this.airports) {
            const dist = this.quickDistance(lat, lon, coords.lat, coords.lon);
            if (dist < nearestDist && dist <= maxDistKm) {
                nearestDist = dist;
                nearest = { code, ...coords, distance: dist };
            }
        }
        
        return nearest;
    },
    
    // Quick approximate distance (Equirectangular)
    quickDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const x = (lon2 - lon1) * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
        const y = lat2 - lat1;
        return Math.sqrt(x * x + y * y) * R * Math.PI / 180;
    }
};
```

---

## PART 6: Add Pre-populated Images Database

Add database to use image URLs from plane-alert-db:

```javascript
// ============ PRE-POPULATED IMAGES DATABASE ============
const preloadedImagesDB = {
    images: new Map(),
    loaded: false,
    
    async init() {
        // Load from multiple -images.csv files
        const sources = [
            DATA_URLS.planeImages,
            DATA_URLS.militaryImages,
            DATA_URLS.governmentImages,
            DATA_URLS.policeImages,
            DATA_URLS.civilianImages
        ];
        
        for (const url of sources) {
            try {
                const resp = await fetch(url);
                if (resp.ok) {
                    const text = await resp.text();
                    this.parseCSV(text);
                }
            } catch (e) {
                // Silently continue
            }
        }
        
        this.loaded = true;
        console.log('Preloaded Images DB loaded:', this.images.size, 'aircraft with images');
    },
    
    parseCSV(text) {
        // Format varies but typically: hex,img1,img2,img3,img4 or more columns
        const lines = text.trim().split('\n').slice(1);
        for (const line of lines) {
            const parts = line.split(',');
            const hex = parts[0]?.replace(/[$"]/g, '').trim().toUpperCase();
            if (hex && /^[A-F0-9]{6}$/i.test(hex)) {
                // Collect all non-empty image URLs
                const urls = [];
                for (let i = 1; i < parts.length && i <= 4; i++) {
                    const url = parts[i]?.replace(/"/g, '').trim();
                    if (url && (url.startsWith('http') || url.startsWith('//'))) {
                        urls.push(url);
                    }
                }
                if (urls.length > 0) {
                    // Merge with existing if already has images
                    const existing = this.images.get(hex);
                    if (existing) {
                        this.images.set(hex, [...new Set([...existing, ...urls])].slice(0, 4));
                    } else {
                        this.images.set(hex, urls);
                    }
                }
            }
        }
    },
    
    getImages(hex) {
        return this.images.get(hex?.toUpperCase()) || [];
    },
    
    getFirstImage(hex) {
        const images = this.getImages(hex);
        return images.length > 0 ? images[0] : null;
    },
    
    hasImage(hex) {
        return this.images.has(hex?.toUpperCase());
    }
};
```

---

## PART 7: Update Database Initialization

Update the initialization to load all new databases:

```javascript
async function initializeDatabases() {
    updateStatus('Loading databases...');
    
    await Promise.all([
        // Core databases
        registrationDB.init(),
        aircraftTypeDB.init(),
        airportDB.init(),
        airlineDB.init(),
        
        // Interesting aircraft
        interestingDB.init(),
        categoriesDB.init(),
        badgersBestDB.init(),
        civilianDB.init(),
        
        // Military/Government
        piaDB.init(),
        milRangesDB.init(),
        
        // Airlines
        callsignPrefixDB.init(),
        allianceDB.init(),
        
        // Airports
        frequencyDB.init(),
        airportCoordsDB.init(),
        
        // Routes
        routesDB.init(),
        
        // Images
        preloadedImagesDB.init()
    ]);
    
    updateDatabaseStatus();
    updateStatus('Ready');
}
```

---

## PART 8: Update Database Status Panel

Update the status panel to show all databases:

```javascript
function updateDatabaseStatus() {
    const dbStatus = document.getElementById('dbStatus');
    if (!dbStatus) return;
    
    const databases = [
        { name: 'Registrations', db: registrationDB, count: registrationDB.aircraft?.size || 0 },
        { name: 'Types', db: aircraftTypeDB, count: aircraftTypeDB.types?.size || 0 },
        { name: 'Airports', db: airportDB, count: airportDB.airports?.size || 0 },
        { name: 'Airlines', db: airlineDB, count: airlineDB.airlines?.size || 0 },
        { name: 'Interesting', db: interestingDB, count: interestingDB.aircraft?.size || 0 },
        { name: 'Categories', db: categoriesDB, count: categoriesDB.categories?.size || 0 },
        { name: "Badger's Best", db: badgersBestDB, count: badgersBestDB.aircraft?.size || 0 },
        { name: 'Civilian', db: civilianDB, count: civilianDB.aircraft?.size || 0 },
        { name: 'Military', db: interestingDB, count: '~8.7K' },
        { name: 'Government', db: interestingDB, count: '~1.7K' },
        { name: 'Police', db: interestingDB, count: '~930' },
        { name: 'PIA', db: piaDB, count: piaDB.aircraft?.size || 0 },
        { name: 'Mil Ranges', db: milRangesDB, count: milRangesDB.ranges?.length || 0 },
        { name: 'Frequencies', db: frequencyDB, count: frequencyDB.frequencies?.size || 0 },
        { name: 'Airport Coords', db: airportCoordsDB, count: airportCoordsDB.airports?.size || 0 },
        { name: 'Routes', db: routesDB, count: routesDB.byAirline?.size || 0 },
        { name: 'Alliances', db: allianceDB, count: allianceDB.airlines?.size || 0 },
        { name: 'Images', db: preloadedImagesDB, count: preloadedImagesDB.images?.size || 0 }
    ];
    
    let html = '<div class="db-status-grid">';
    for (const db of databases) {
        const status = db.db.loaded ? 'loaded' : 'pending';
        const icon = db.db.loaded ? '✓' : '○';
        html += `<div class="db-item ${status}">
            <span class="db-icon">${icon}</span>
            <span class="db-name">${db.name}</span>
            <span class="db-count">${typeof db.count === 'number' ? db.count.toLocaleString() : db.count}</span>
        </div>`;
    }
    html += '</div>';
    
    dbStatus.innerHTML = html;
}
```

---

## PART 9: Add VIP Filter Button

Add a new filter button for Badger's Best VIP aircraft:

### HTML (add after the PIA filter button):

```html
<button id="vip-btn" class="filter-btn" title="Show VIP Aircraft (Badger's Best)">
    ⭐ VIP <span id="vipCount">0</span>
</button>
```

### JavaScript filter logic:

```javascript
// Add to filter state
let showVIPOnly = false;

// Add button handler
document.getElementById('vip-btn')?.addEventListener('click', () => {
    showVIPOnly = !showVIPOnly;
    document.getElementById('vip-btn').classList.toggle('active', showVIPOnly);
    updateAircraftList();
});

// Update VIP count
function updateVIPCount() {
    let count = 0;
    for (const ac of Object.values(aircraftCache)) {
        if (badgersBestDB.isVIP(ac.hex)) count++;
    }
    document.getElementById('vipCount').textContent = count;
}

// Add to filter logic in updateAircraftList or processAircraftData
if (showVIPOnly && !badgersBestDB.isVIP(ac.hex)) {
    continue; // Skip non-VIP aircraft
}
```

---

## PART 10: Add Category Badge with Tooltip

Update the aircraft info display to show category with color and tooltip:

```javascript
function getCategoryBadge(ac) {
    const category = ac.category || ac.interestingData?.category;
    if (!category) return '';
    
    const catInfo = categoriesDB.getCategory(category);
    const color = catInfo?.color || categoriesDB.getCategoryColor(category);
    const description = catInfo?.description || category;
    
    return `<span class="category-badge" 
                  style="background-color: ${color}20; color: ${color}; border-color: ${color}40;"
                  title="${description}">
                ${category}
            </span>`;
}

// Add to selectAircraft display
const categoryBadge = getCategoryBadge(ac);
if (categoryBadge) {
    document.getElementById('acCategory').innerHTML = categoryBadge;
}
```

### CSS for category badge:

```css
.category-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid;
    cursor: help;
    white-space: nowrap;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.category-badge:hover {
    filter: brightness(1.2);
}
```

---

## PART 11: Enhanced Enrichment Pipeline

Update the enrichment to check all new databases:

```javascript
function enrichAircraftData(ac) {
    const hex = ac.hex?.toUpperCase();
    if (!hex) return ac;
    
    // 1. Registration DB
    const regData = registrationDB.getByHex(hex);
    if (regData) {
        ac.registration = ac.r || regData.registration || '';
        ac.typeCode = ac.t || regData.typeCode || '';
        ac.operator = regData.operator || '';
        ac.country = regData.country || '';
    }
    
    // 2. VIP Check (Badger's Best) - Highest priority
    const vipData = badgersBestDB.getByHex(hex);
    if (vipData) {
        ac.isVIP = true;
        ac.classification = 'vip';
        ac.category = vipData.category || 'VIP';
        ac.operator = vipData.operator || ac.operator;
        ac.interestingData = vipData;
    }
    
    // 3. Interesting DB
    if (!ac.classification) {
        const intData = interestingDB.getByHex(hex);
        if (intData) {
            ac.classification = intData.isMilitary ? 'military' : 
                               intData.isGovernment ? 'government' :
                               intData.isPolice ? 'police' : 'interesting';
            ac.category = intData.category;
            ac.operator = intData.operator || ac.operator;
            ac.interestingData = intData;
        }
    }
    
    // 4. Civilian Interesting
    if (!ac.classification) {
        const civData = civilianDB.getByHex(hex);
        if (civData) {
            ac.classification = 'civilian-interesting';
            ac.category = civData.category;
            ac.operator = civData.operator || ac.operator;
            ac.interestingData = civData;
        }
    }
    
    // 5. PIA Check
    if (piaDB.isPIA(hex)) {
        ac.isPIA = true;
        ac.classification = ac.classification || 'pia';
    }
    
    // 6. Military Hex Ranges
    if (!ac.classification && milRangesDB.isMilitary(hex)) {
        ac.classification = 'military';
        ac.isMilitary = true;
    }
    
    // 7. Callsign prefix lookup
    if (ac.flight && !ac.operator) {
        const prefix = ac.flight.substring(0, 3).toUpperCase();
        const airline = callsignPrefixDB.getAirline(prefix);
        if (airline) {
            ac.operator = airline;
            ac.airlineCode = prefix;
        }
    }
    
    // 8. Alliance lookup
    if (ac.airlineCode) {
        const alliance = allianceDB.getAlliance(ac.airlineCode);
        if (alliance) {
            ac.alliance = alliance.name;
            ac.allianceColor = alliance.color;
        }
    }
    
    // 9. Preloaded image check
    if (preloadedImagesDB.hasImage(hex)) {
        ac.preloadedImage = preloadedImagesDB.getFirstImage(hex);
    }
    
    return ac;
}
```

---

## PART 12: Update Image Loading Priority

Update image loading to check preloaded images first:

```javascript
async function loadAircraftImage(hex, imgElement) {
    const sources = [];
    
    // 1. Check preloaded images first (fastest)
    const preloaded = preloadedImagesDB.getFirstImage(hex);
    if (preloaded) {
        sources.push(preloaded);
    }
    
    // 2. Self-hosted photos
    sources.push(`${DATA_URLS.aircraftPhotos}${hex.toUpperCase()}.jpg`);
    
    // 3. Planespotters API (fallback)
    // Will be tried via API call if above fail
    
    for (const src of sources) {
        try {
            const success = await tryLoadImage(imgElement, src);
            if (success) return true;
        } catch (e) {
            continue;
        }
    }
    
    // Final fallback: Planespotters API
    try {
        const apiUrl = `https://api.planespotters.net/pub/photos/hex/${hex.toLowerCase()}`;
        const resp = await fetch(apiUrl);
        const data = await resp.json();
        if (data.photos?.length > 0) {
            const photoUrl = data.photos[0].thumbnail_large?.src || data.photos[0].thumbnail?.src;
            if (photoUrl) {
                return await tryLoadImage(imgElement, photoUrl);
            }
        }
    } catch (e) {
        // No image available
    }
    
    return false;
}

function tryLoadImage(imgElement, src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            imgElement.src = src;
            resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = src;
    });
}
```

---

## SUMMARY

| Feature | Description |
|---------|-------------|
| **17 New Data Files** | Categories, VIP list, civilian interesting, image URLs, airport coords |
| **Categories DB** | 51 category definitions with descriptions and colors |
| **Badger's Best** | ~100 VIP "must-see" aircraft with dedicated filter |
| **Civilian Interesting** | 4,500+ notable civilian aircraft |
| **Preloaded Images** | 12K+ image URLs from plane-alert-db |
| **Fast Airport Lookup** | Compact coordinate JSON for route detection |
| **Category Tooltips** | Hover to see category description |
| **Enhanced Enrichment** | 9-step pipeline checking all databases |
| **VIP Filter Button** | Quick filter for most interesting aircraft |

## Database Count Summary

| Database | Records |
|----------|---------|
| Registrations | ~300,000 |
| Interesting | ~16,000 |
| Military | ~8,700 |
| Government | ~1,700 |
| Police | ~930 |
| Civilian Interesting | ~4,500 |
| Badger's Best | ~100 |
| Categories | 51 |
| Preloaded Images | ~12,000 |
| Airport Coords | ~28,000 |
| Airlines | ~6,000 |
| Routes | ~67,000 |


    // ============ INDEXEDDB STORAGE ============
    const skytrackDB = {
        dbName: 'SkyTrackDB',
        dbVersion: 1,
        db: null,
        
        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.db = request.result;
                    resolve(true);
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    // Store for large databases (registrations, airports, etc.)
                    if (!db.objectStoreNames.contains('databases')) {
                        const store = db.createObjectStore('databases', { keyPath: 'name' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                    
                    // Store for aircraft cache
                    if (!db.objectStoreNames.contains('aircraftCache')) {
                        db.createObjectStore('aircraftCache', { keyPath: 'hex' });
                    }
                    
                    // Store for user data (watchlist, bookmarks, settings)
                    if (!db.objectStoreNames.contains('userData')) {
                        db.createObjectStore('userData', { keyPath: 'key' });
                    }
                    
                    // Store for trail history
                    if (!db.objectStoreNames.contains('trailHistory')) {
                        const trailStore = db.createObjectStore('trailHistory', { keyPath: 'id', autoIncrement: true });
                        trailStore.createIndex('hex', 'hex', { unique: false });
                        trailStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                };
            });
        },
        
        async saveDatabase(name, data, maxAge = 86400000) {
            if (!this.db) await this.init();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['databases'], 'readwrite');
                const store = transaction.objectStore('databases');
                const request = store.put({
                    name,
                    data,
                    timestamp: Date.now(),
                    maxAge
                });
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        },
        
        async loadDatabase(name) {
            if (!this.db) await this.init();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['databases'], 'readonly');
                const store = transaction.objectStore('databases');
                const request = store.get(name);
                request.onsuccess = () => {
                    const result = request.result;
                    if (result && Date.now() - result.timestamp < result.maxAge) {
                        resolve(result.data);
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        },
        
        async saveUserData(key, value) {
            if (!this.db) await this.init();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['userData'], 'readwrite');
                const store = transaction.objectStore('userData');
                const request = store.put({ key, value, timestamp: Date.now() });
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        },
        
        async loadUserData(key) {
            if (!this.db) await this.init();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['userData'], 'readonly');
                const store = transaction.objectStore('userData');
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result?.value ?? null);
                request.onerror = () => reject(request.error);
            });
        },
        
        async saveTrailHistory(hex, trailData) {
            if (!this.db) await this.init();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['trailHistory'], 'readwrite');
                const store = transaction.objectStore('trailHistory');
                const request = store.add({
                    hex,
                    data: trailData,
                    timestamp: Date.now()
                });
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        },
        
        async getTrailHistory(hex, limit = 10) {
            if (!this.db) await this.init();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['trailHistory'], 'readonly');
                const store = transaction.objectStore('trailHistory');
                const index = store.index('hex');
                const request = index.getAll(hex);
                request.onsuccess = () => {
                    const results = request.result
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .slice(0, limit);
                    resolve(results);
                };
                request.onerror = () => reject(request.error);
            });
        },
        
        async clearOldData(maxAgeDays = 7) {
            if (!this.db) await this.init();
            const cutoff = Date.now() - (maxAgeDays * 86400000);
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['trailHistory'], 'readwrite');
                const store = transaction.objectStore('trailHistory');
                const index = store.index('timestamp');
                const range = IDBKeyRange.upperBound(cutoff);
                const request = index.openCursor(range);
                
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    } else {
                        resolve(true);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        }
    };

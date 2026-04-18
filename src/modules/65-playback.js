
    // ============ PHASE 5: HISTORICAL PLAYBACK ============
    const playbackController = {
        active: false,
        playing: false,
        speed: 1,
        currentIndex: 0,
        trailData: [],
        playbackMarker: null,
        interval: null,
        
        async start(hex) {
            try {
                const trailData = await trailExporter.getTrailData(hex);

                if (!trailData || trailData.length < 2) {
                    toast('No trail history available for playback');
                    return;
                }

                // Starting a new session while another is running would leak
                // the previous interval + marker and desync the UI. Reset
                // cleanly first.
                if (this.interval) { clearInterval(this.interval); this.interval = null; }
                this.playing = false;
                const playBtn = document.getElementById('playbackPlay');
                if (playBtn) playBtn.innerHTML = '&#9654;';

                this.trailData = trailData;
                this.currentIndex = 0;
                this.active = true;
                
                this.showControls();
                
                const ac = aircraftCache[hex];
                if (this.playbackMarker) {
                    map.removeLayer(this.playbackMarker);
                }
                
                this.playbackMarker = L.marker([trailData[0].lat, trailData[0].lon], {
                    icon: L.divIcon({
                        className: 'playback-marker',
                        html: '<div class="playback-aircraft">&#9650;</div>',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    })
                }).addTo(map);
                
                this.updatePosition();
                toast(`Playback ready: ${trailData.length} positions`);
                
            } catch (e) {
                errorHandler.log('Playback', e.message, 'error');
                toast('Failed to load playback data');
            }
        },
        
        showControls() {
            let controls = document.getElementById('playbackControls');
            if (!controls) {
                controls = document.createElement('div');
                controls.id = 'playbackControls';
                controls.className = 'playback-controls';
                controls.innerHTML = `
                    <button class="playback-btn" id="playbackStart" title="Start">|&lt;</button>
                    <button class="playback-btn" id="playbackBack" title="Back 10">&lt;&lt;</button>
                    <button class="playback-btn play" id="playbackPlay" title="Play/Pause">&#9654;</button>
                    <button class="playback-btn" id="playbackForward" title="Forward 10">&gt;&gt;</button>
                    <button class="playback-btn" id="playbackEnd" title="End">&gt;|</button>
                    <div class="playback-slider-container">
                        <input type="range" id="playbackSlider" min="0" max="100" value="0">
                    </div>
                    <div class="playback-time" id="playbackTime">0%</div>
                    <select id="playbackSpeed">
                        <option value="0.5">0.5x</option>
                        <option value="1" selected>1x</option>
                        <option value="2">2x</option>
                        <option value="5">5x</option>
                        <option value="10">10x</option>
                    </select>
                    <button class="playback-btn close" id="playbackClose" title="Close">x</button>
                `;
                document.body.appendChild(controls);
                
                document.getElementById('playbackPlay').addEventListener('click', () => this.togglePlay());
                document.getElementById('playbackStart').addEventListener('click', () => this.goToStart());
                document.getElementById('playbackEnd').addEventListener('click', () => this.goToEnd());
                document.getElementById('playbackBack').addEventListener('click', () => this.step(-10));
                document.getElementById('playbackForward').addEventListener('click', () => this.step(10));
                document.getElementById('playbackSlider').addEventListener('input', (e) => this.seekTo(e.target.value));
                document.getElementById('playbackSpeed').addEventListener('change', (e) => {
                    this.speed = parseFloat(e.target.value);
                });
                document.getElementById('playbackClose').addEventListener('click', () => this.stop());
            }
            
            controls.style.display = 'flex';
            document.getElementById('playbackSlider').max = this.trailData.length - 1;
        },
        
        togglePlay() {
            this.playing = !this.playing;
            document.getElementById('playbackPlay').innerHTML = this.playing ? '&#10074;&#10074;' : '&#9654;';
            
            if (this.playing) {
                this.interval = setInterval(() => {
                    if (this.currentIndex < this.trailData.length - 1) {
                        this.currentIndex++;
                        this.updatePosition();
                    } else {
                        this.togglePlay();
                    }
                }, 100 / this.speed);
            } else {
                clearInterval(this.interval);
            }
        },
        
        goToStart() {
            this.currentIndex = 0;
            this.updatePosition();
        },
        
        goToEnd() {
            this.currentIndex = this.trailData.length - 1;
            this.updatePosition();
        },
        
        step(amount) {
            this.currentIndex = Math.max(0, Math.min(this.trailData.length - 1, this.currentIndex + amount));
            this.updatePosition();
        },
        
        seekTo(index) {
            // parseInt('') or parseInt('abc') → NaN. Setting currentIndex to
            // NaN would cascade into the slider and break subsequent seeks.
            const n = parseInt(index, 10);
            if (!Number.isFinite(n) || !this.trailData?.length) return;
            this.currentIndex = Math.max(0, Math.min(this.trailData.length - 1, n));
            this.updatePosition();
        },
        
        updatePosition() {
            if (!this.trailData[this.currentIndex]) return;
            
            const point = this.trailData[this.currentIndex];
            
            this.playbackMarker.setLatLng([point.lat, point.lon]);
            
            if (this.currentIndex > 0) {
                const prev = this.trailData[this.currentIndex - 1];
                const heading = measureTool.calculateBearing(prev.lat, prev.lon, point.lat, point.lon);
                const el = this.playbackMarker.getElement()?.querySelector('.playback-aircraft');
                if (el) el.style.transform = `rotate(${heading}deg)`;
            }
            
            document.getElementById('playbackSlider').value = this.currentIndex;
            
            const elapsed = this.currentIndex;
            const total = this.trailData.length - 1;
            const percent = ((elapsed / total) * 100).toFixed(0);
            document.getElementById('playbackTime').textContent = `${percent}%`;
            
            if (this.playing) {
                map.panTo([point.lat, point.lon], { animate: true, duration: 0.1 });
            }
        },
        
        stop() {
            this.active = false;
            this.playing = false;
            clearInterval(this.interval);
            
            if (this.playbackMarker) {
                map.removeLayer(this.playbackMarker);
                this.playbackMarker = null;
            }
            
            const controls = document.getElementById('playbackControls');
            if (controls) {
                controls.style.display = 'none';
            }
            
            this.trailData = [];
            this.currentIndex = 0;
        }
    };


    // ============ GPU AIRCRAFT MARKER LAYER ============
    // A small point-sprite renderer keeps the high-volume path dependency-free
    // while moving ordinary traffic out of Leaflet's DOM/canvas marker work.
    const WEBGL_MARKER_THRESHOLD = 800;

    function webglPointColor(altitude, selected = false) {
        if (selected) return [0.05, 0.92, 1, 1];
        if (altitude === 'ground' || altitude === 0) return [0.35, 0.95, 0.35, 0.95];
        const feet = Number(altitude);
        if (!Number.isFinite(feet)) return [0.78, 0.84, 0.9, 0.92];
        if (feet >= 40000) return [0.58, 0.12, 0.83, 0.95];
        if (feet >= 30000) return [0.95, 0.08, 0.08, 0.95];
        if (feet >= 20000) return [1, 0.27, 0.05, 0.95];
        if (feet >= 10000) return [1, 0.65, 0.05, 0.95];
        if (feet >= 5000) return [1, 0.95, 0.05, 0.95];
        return [0.5, 1, 0.05, 0.95];
    }

    const webglMarkerLayer = {
        threshold: WEBGL_MARKER_THRESHOLD,
        enabled: false,
        supported: false,
        map: null,
        canvas: null,
        gl: null,
        program: null,
        positionBuffer: null,
        colorBuffer: null,
        sizeBuffer: null,
        points: [],
        lastAircraft: [],
        lastOptions: null,
        onSelect: null,
        init(map) {
            if (this.map || !map || typeof document === 'undefined') return;
            this.map = map;
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'webgl-marker-canvas';
            this.canvas.setAttribute('aria-hidden', 'true');
            map.getContainer().appendChild(this.canvas);
            this.gl = this.canvas.getContext('webgl', { alpha: true, antialias: true }) || this.canvas.getContext('experimental-webgl');
            this.supported = !!this.gl && this._createProgram();
            if (!this.supported) {
                this.canvas.remove();
                this.canvas = null;
                return;
            }
            this.canvas.addEventListener('click', event => this._pick(event));
            const saved = localStorage.getItem('skytrack_webgl_markers');
            if (saved === '1') this.toggle(true);
        },
        _createProgram() {
            const gl = this.gl;
            const vertexSource = 'attribute vec2 a_position; attribute vec4 a_color; attribute float a_size; uniform vec2 u_resolution; varying vec4 v_color; void main(){ vec2 zeroToOne=a_position/u_resolution; vec2 clip=zeroToOne*2.0-1.0; gl_Position=vec4(clip*vec2(1,-1),0,1); gl_PointSize=a_size; v_color=a_color; }';
            const fragmentSource = 'precision mediump float; varying vec4 v_color; void main(){ vec2 point=gl_PointCoord-vec2(0.5); if(dot(point,point)>0.25) discard; gl_FragColor=v_color; }';
            const compile = (type, source) => {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
                return shader;
            };
            const vertex = compile(gl.VERTEX_SHADER, vertexSource);
            const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
            if (!vertex || !fragment) return false;
            const program = gl.createProgram();
            gl.attachShader(program, vertex);
            gl.attachShader(program, fragment);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
            this.program = program;
            this.positionBuffer = gl.createBuffer();
            this.colorBuffer = gl.createBuffer();
            this.sizeBuffer = gl.createBuffer();
            return true;
        },
        shouldUse(count) {
            return this.enabled && this.supported && Number(count) >= this.threshold;
        },
        toggle(force) {
            if (!this.supported && force !== false) {
                if (typeof toast === 'function') toast('GPU marker layer is unavailable in this browser', 'warning');
                return false;
            }
            this.enabled = typeof force === 'boolean' ? force : !this.enabled;
            try { localStorage.setItem('skytrack_webgl_markers', this.enabled ? '1' : '0'); } catch (_) {}
            document.body.classList.toggle('webgl-markers', this.enabled);
            document.getElementById('webglMarkersBtn')?.classList.toggle('active', this.enabled);
            if (!this.enabled) this.clear();
            if (typeof updateMarkersSync === 'function') updateMarkersSync();
            if (typeof toast === 'function') toast(this.enabled ? 'GPU markers ON · activates at 800 aircraft' : 'GPU markers OFF');
            return this.enabled;
        },
        _resize() {
            if (!this.canvas || !this.map) return;
            const rect = this.map.getContainer().getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.max(1, Math.round(rect.width * dpr));
            const height = Math.max(1, Math.round(rect.height * dpr));
            if (this.canvas.width !== width || this.canvas.height !== height) {
                this.canvas.width = width;
                this.canvas.height = height;
                this.canvas.style.width = rect.width + 'px';
                this.canvas.style.height = rect.height + 'px';
            }
        },
        render(aircraft = [], options = {}) {
            if (!this.shouldUse(aircraft.length)) { this.clear(); return; }
            this.lastAircraft = aircraft;
            this.lastOptions = options;
            this._resize();
            const gl = this.gl;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const positions = [], colors = [], sizes = [];
            this.points = [];
            for (const ac of aircraft) {
                if (!ac?.hex || !Number.isFinite(Number(ac.lat)) || !Number.isFinite(Number(ac.lon))) continue;
                if (typeof options.predicate === 'function' && !options.predicate(ac)) continue;
                const point = this.map.latLngToContainerPoint([Number(ac.lat), Number(ac.lon)]);
                const color = webglPointColor(ac.alt_baro, ac.hex === options.selectedHex);
                positions.push(point.x * dpr, point.y * dpr);
                colors.push(...color);
                sizes.push((ac.hex === options.selectedHex ? 12 : 7) * dpr);
                this.points.push({ hex: ac.hex, x: point.x, y: point.y });
            }
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(this.program);
            gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), this.canvas.width, this.canvas.height);
            this._buffer( this.positionBuffer, gl.ARRAY_BUFFER, positions, 2, 'a_position');
            this._buffer( this.colorBuffer, gl.ARRAY_BUFFER, colors, 4, 'a_color');
            this._buffer( this.sizeBuffer, gl.ARRAY_BUFFER, sizes, 1, 'a_size');
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.drawArrays(gl.POINTS, 0, sizes.length);
            this.canvas.style.display = sizes.length ? 'block' : 'none';
        },
        _buffer(buffer, target, values, size, attribute) {
            const gl = this.gl;
            gl.bindBuffer(target, buffer);
            gl.bufferData(target, new Float32Array(values), gl.DYNAMIC_DRAW);
            const location = gl.getAttribLocation(this.program, attribute);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
        },
        _pick(event) {
            if (!this.enabled || !this.points.length || !this.canvas) return;
            const rect = this.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            let best = null;
            for (const point of this.points) {
                const distance = Math.hypot(point.x - x, point.y - y);
                if (distance <= 16 && (!best || distance < best.distance)) best = { ...point, distance };
            }
            if (best && typeof this.lastOptions?.onSelect === 'function') this.lastOptions.onSelect(best.hex);
        },
        clear() {
            this.points = [];
            if (this.canvas && this.gl) {
                this.gl.clearColor(0, 0, 0, 0);
                this.gl.clear(this.gl.COLOR_BUFFER_BIT);
                this.canvas.style.display = 'none';
            }
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('skytrack:map-ready', event => webglMarkerLayer.init(event.detail?.map), { once: true });
        document.getElementById('webglMarkersBtn')?.addEventListener('click', () => webglMarkerLayer.toggle());
    }

    // ============ GAMEPAD CAMERA CONTROL ============
    function gamepadInput(gamepad = {}) {
        const deadzone = value => Math.abs(Number(value) || 0) < 0.14 ? 0 : Math.max(-1, Math.min(1, Number(value) || 0));
        return { yaw: deadzone(gamepad.axes?.[0]), pitch: deadzone(gamepad.axes?.[1]), zoom: deadzone(gamepad.axes?.[3]), active: !!gamepad.connected };
    }

    const gamepadCamera = {
        enabled: false,
        frame: null,
        init() { document.getElementById('gamepadBtn')?.addEventListener('click', () => this.toggle()); },
        toggle() {
            this.enabled = !this.enabled;
            document.getElementById('gamepadBtn')?.classList.toggle('active', this.enabled);
            if (this.enabled) { this._tick(); if (typeof toast === 'function') toast('Gamepad camera ON · select a controller'); }
            else if (this.frame) cancelAnimationFrame(this.frame);
            return this.enabled;
        },
        _tick() {
            if (!this.enabled) return;
            const pad = navigator.getGamepads?.().find(item => item?.connected);
            const viewer = typeof view3D !== 'undefined' ? view3D.cesiumViewer : null;
            if (pad && viewer?.camera) {
                const input = gamepadInput(pad);
                try {
                    viewer.camera.rotateLeft(-input.yaw * 0.018);
                    viewer.camera.rotateUp(input.pitch * 0.012);
                    viewer.camera.moveForward(input.zoom * 1800);
                } catch (_) {}
            }
            this.frame = requestAnimationFrame(() => this._tick());
        }
    };

    if (typeof document !== 'undefined') gamepadCamera.init();

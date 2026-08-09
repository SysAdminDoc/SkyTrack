
    // ============ ACCESSIBILITY STATE ============
    function prefersReducedMotionFrom(mediaQuery) {
        return mediaQuery?.matches === true;
    }

    const accessibility = {
        reducedMotion: false,
        _query: null,
        init() {
            if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
            this._query = window.matchMedia('(prefers-reduced-motion: reduce)');
            const update = () => {
                this.reducedMotion = prefersReducedMotionFrom(this._query);
                document.documentElement.classList.toggle('reduced-motion', this.reducedMotion);
            };
            update();
            if (this._query.addEventListener) this._query.addEventListener('change', update);
            else this._query.addListener?.(update);
        },
        prefersReducedMotion() {
            return this.reducedMotion || prefersReducedMotionFrom(this._query);
        }
    };

    if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => accessibility.init(), { once: true });

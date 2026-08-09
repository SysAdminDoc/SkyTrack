
    // ============ VIRTUAL AIRCRAFT LIST WINDOW ============
    // Keep the list dependency-free: calculate the visible row interval and
    // let the mobile sheet render only that interval into a fixed-height
    // spacer. The helper is pure so the windowing math can be tested without
    // a browser or a DOM implementation.
    const VIRTUAL_AIRCRAFT_ROW_HEIGHT = 64;

    function virtualWindowFor(length, scrollTop, viewportHeight, overscan = 8, rowHeight = VIRTUAL_AIRCRAFT_ROW_HEIGHT) {
        const count = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
        const top = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
        const viewport = Number.isFinite(viewportHeight) ? Math.max(rowHeight, viewportHeight) : rowHeight;
        const extra = Number.isFinite(overscan) ? Math.max(0, Math.floor(overscan)) : 0;
        const start = Math.min(count, Math.max(0, Math.floor(top / rowHeight) - extra));
        const end = Math.max(start, Math.min(count, Math.ceil((top + viewport) / rowHeight) + extra));
        return { start, end, totalHeight: count * rowHeight };
    }

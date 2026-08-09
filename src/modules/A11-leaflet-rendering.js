
    // ============ LEAFLET RENDERING HELPERS ============
    // Keep the overlay math independent from Leaflet so it remains easy to
    // verify and so FAA queries can prefetch just beyond the visible edge.
    function edgeBufferRatioForZoom(zoom) {
        const level = Number.isFinite(Number(zoom)) ? Math.max(0, Number(zoom)) : 0;
        return Math.min(0.24, Math.max(0.04, 2 / Math.pow(2, Math.max(0, level - 4))));
    }

    function bufferedOverlayBounds(bounds, zoom) {
        if (!bounds) return null;
        const west = Number(bounds.west), south = Number(bounds.south);
        const east = Number(bounds.east), north = Number(bounds.north);
        if (![west, south, east, north].every(Number.isFinite) || !(east > west) || !(north > south)) return null;
        const pad = edgeBufferRatioForZoom(zoom);
        return {
            west: Math.max(-180, west - (east - west) * pad),
            south: Math.max(-90, south - (north - south) * pad),
            east: Math.min(180, east + (east - west) * pad),
            north: Math.min(90, north + (north - south) * pad)
        };
    }

    function airwayOffsetFor(identifier) {
        const ident = String(identifier || '').trim().toUpperCase();
        if (ident.startsWith('V')) return -4;
        if (ident.startsWith('J')) return 4;
        return 0;
    }

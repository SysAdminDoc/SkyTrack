
    // ============ CESIUM LIGHTING HELPERS ============
    // NOAA-style low-cost solar position approximation. It is accurate enough
    // to switch the 3D presentation around the civil-twilight boundary while
    // keeping the single-file client free of a date/astronomy dependency.
    function solarElevationDegrees(date, latitude, longitude) {
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) return null;
        const lat = Number(latitude), lon = Number(longitude);
        if (![lat, lon].every(Number.isFinite)) return null;
        const start = Date.UTC(d.getUTCFullYear(), 0, 0);
        const day = (d.getTime() - start) / 86400000;
        const minutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
        const gamma = 2 * Math.PI / 365 * (day - 1 + (minutes / 1440 - 0.5));
        const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
        const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
        const solarMinutes = minutes + equationOfTime + 4 * lon;
        const hourAngle = solarMinutes / 4 - 180;
        const rad = Math.PI / 180;
        const cosineZenith = Math.sin(lat * rad) * Math.sin(declination) + Math.cos(lat * rad) * Math.cos(declination) * Math.cos(hourAngle * rad);
        return 90 - Math.acos(Math.max(-1, Math.min(1, cosineZenith))) / rad;
    }

    function isNightSkyboxTime(date, latitude, longitude) {
        const elevation = solarElevationDegrees(date, latitude, longitude);
        return elevation !== null && elevation < -6;
    }

    const CESIUM_NIGHT_SKYBOX_SOURCES = {
        positiveX: 'https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_px.jpg',
        negativeX: 'https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_mx.jpg',
        positiveY: 'https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_py.jpg',
        negativeY: 'https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_my.jpg',
        positiveZ: 'https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_pz.jpg',
        negativeZ: 'https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_mz.jpg'
    };

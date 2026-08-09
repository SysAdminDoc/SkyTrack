
    // ============ PIA / LADD MARKER METADATA ============
    // PIA aircraft are known from the bundled database. Some tar1090-style
    // feeds also expose a LADD/privacy flag directly; accept those optional
    // fields without interpreting the broader dbFlags military bit.
    function isPrivacyAircraft(ac = {}) {
        const truthyFlag = value => value === true || value === 1 || value === '1' || value === 'true';
        return !!ac.piaInfo || truthyFlag(ac.ladd) || truthyFlag(ac.isLadd) || truthyFlag(ac.privacyIcaoAddress) || truthyFlag(ac.privacy);
    }

    function privacyMarkerInfo(ac = {}) {
        if (!isPrivacyAircraft(ac)) return null;
        return { label: 'Privacy ICAO address', badge: '?', color: '#ec4899' };
    }

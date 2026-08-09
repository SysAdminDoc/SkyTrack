
    // ============ DEPENDENCY-FREE FUZZY SEARCH ============
    // Rank contiguous matches first, then tolerate gaps for callsigns such as
    // "DAL" → "DAL123" or "SWA" → "SWA 418" without shipping Fuse.js.
    function fuzzySearchText(value) {
        return Array.isArray(value)
            ? value.filter(Boolean).join(' ').toLowerCase().trim()
            : String(value || '').toLowerCase().trim();
    }

    function fuzzyScore(query, candidate) {
        const q = fuzzySearchText(query);
        const text = fuzzySearchText(candidate);
        if (!q || !text || q.length < 2) return 0;
        const direct = text.indexOf(q);
        if (direct >= 0) return 1000 + q.length * 10 - direct;

        let cursor = 0;
        let first = -1;
        let previous = -2;
        let contiguous = 0;
        let gaps = 0;
        for (const char of q) {
            const found = text.indexOf(char, cursor);
            if (found < 0) return 0;
            if (first < 0) first = found;
            if (found === previous + 1) contiguous++;
            else if (previous >= 0) gaps += found - previous - 1;
            previous = found;
            cursor = found + 1;
        }
        return 120 + contiguous * 12 + q.length * 4 - gaps * 2 - first * 0.5;
    }

    function rankFuzzy(items, query, getText = item => item, limit = Infinity) {
        return items.map((item, index) => ({ item, index, score: fuzzyScore(query, getText(item)) }))
            .filter(result => result.score > 0)
            .sort((a, b) => b.score - a.score || a.index - b.index)
            .slice(0, limit);
    }

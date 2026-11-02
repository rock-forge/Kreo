function uniqueStrings(values) {
    return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function normalizeTitle(value) {
    return String(value || "")
        .replace(/\(.*?(official|audio|video|lyrics|visualizer|remix|sped up|slowed|reverb).*?\)/gi, "")
        .replace(/\[.*?(official|audio|video|lyrics|visualizer|remix|sped up|slowed|reverb).*?\]/gi, "")
        .replace(/\s*-\s*(official|audio|video|lyrics|visualizer|remix|sped up|slowed|reverb).*$/gi, "")
        .replace(/\b(official|audio|video|lyrics|visualizer|remix|sped up|slowed|reverb|topic)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

function expandArtistVariants(artist) {
    const base = String(artist || "").replace(/\s*-\s*Topic\s*$/i, "").trim();
    const pieces = base.split(/,|&| x | X | feat\.|ft\.| featuring /i).map((part) => part.trim());
    return uniqueStrings([base, pieces[0], ...pieces]);
}

function expandTitleVariants(title) {
    const normalized = normalizeTitle(title);
    const withoutPipes = normalized.split("|")[0]?.trim();
    return uniqueStrings([title, normalized, withoutPipes]);
}

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function sanitizeDurationMs(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return 0;
    }

    return numericValue > 1000 ? numericValue : numericValue * 1000;
}

function pickBestLrclibMatch(entries, { title, artists, durationMs }) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return null;
    }

    const normalizedTitle = normalizeTitle(title);
    const normalizedArtists = uniqueStrings(artists.map((artist) => normalizeText(artist)));

    const scoredEntries = entries
        .filter((item) => item?.plainLyrics || item?.syncedLyrics)
        .map((item) => {
            let score = item?.syncedLyrics ? 140 : 40;

            const entryTitle = normalizeTitle(item?.trackName || item?.name || item?.title || "");
            const entryArtist = normalizeText(item?.artistName || item?.artist || "");
            const entryDurationMs = sanitizeDurationMs(item?.duration || item?.trackDuration || item?.durationMs);

            if (entryTitle && normalizedTitle) {
                if (entryTitle === normalizedTitle) {
                    score += 90;
                } else if (entryTitle.includes(normalizedTitle) || normalizedTitle.includes(entryTitle)) {
                    score += 55;
                }
            }

            if (entryArtist && normalizedArtists.length > 0) {
                if (normalizedArtists.includes(entryArtist)) {
                    score += 55;
                } else if (normalizedArtists.some((artist) => artist.includes(entryArtist) || entryArtist.includes(artist))) {
                    score += 28;
                }
            }

            if (durationMs && entryDurationMs) {
                const diff = Math.abs(durationMs - entryDurationMs);
                if (diff <= 750) {
                    score += 95;
                } else if (diff <= 1500) {
                    score += 78;
                } else if (diff <= 3000) {
                    score += 52;
                } else if (diff <= 8000) {
                    score += 20;
                } else {
                    score -= Math.min(35, Math.floor(diff / 10000));
                }
            }

            return { item, score };
        })
        .sort((left, right) => right.score - left.score);

    return scoredEntries[0]?.item || null;
}

async function getJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
        return null;
    }

    return response.json().catch(() => null);
}

class LyricsManager {
    constructor() {
        this.sources = [
            this.fetchFromLRCLib.bind(this),
            this.fetchFromLyricsOvh.bind(this),
            this.fetchFromFallbackApi.bind(this),
        ];
    }

    async fetchFromLRCLib(title, artist, durationMs = 0) {
        const titleVariants = expandTitleVariants(title);
        const artistVariants = expandArtistVariants(artist);

        for (const titleVariant of titleVariants) {
            for (const artistVariant of artistVariants) {
                try {
                    const searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(titleVariant)}&artist_name=${encodeURIComponent(artistVariant)}`;
                    const data = await getJson(searchUrl);

                    if (Array.isArray(data) && data.length > 0) {
                        const withSynced = pickBestLrclibMatch(data, {
                            title: titleVariant,
                            artists: artistVariants,
                            durationMs,
                        });
                        if (withSynced?.plainLyrics || withSynced?.syncedLyrics) {
                            return {
                                lyrics: withSynced.plainLyrics || withSynced.syncedLyrics || null,
                                source: "LRCLIB",
                                synced: withSynced.syncedLyrics || null,
                                referenceDurationMs: sanitizeDurationMs(
                                    withSynced.duration || withSynced.trackDuration || withSynced.durationMs
                                ),
                            };
                        }
                    }
                } catch {}
            }
        }

        for (const titleVariant of titleVariants) {
            try {
                const genericSearch = await getJson(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artist} ${titleVariant}`.trim())}`);
                if (Array.isArray(genericSearch) && genericSearch.length > 0) {
                    const withSynced = pickBestLrclibMatch(genericSearch, {
                        title: titleVariant,
                        artists: artistVariants,
                        durationMs,
                    });
                    if (withSynced?.plainLyrics || withSynced?.syncedLyrics) {
                        return {
                            lyrics: withSynced.plainLyrics || withSynced.syncedLyrics || null,
                            source: "LRCLIB",
                            synced: withSynced.syncedLyrics || null,
                            referenceDurationMs: sanitizeDurationMs(
                                withSynced.duration || withSynced.trackDuration || withSynced.durationMs
                            ),
                        };
                    }
                }
            } catch {}
        }

        return null;
    }

    async fetchFromLyricsOvh(title, artist) {
        const titleVariants = expandTitleVariants(title);
        const artistVariants = expandArtistVariants(artist);

        for (const artistVariant of artistVariants) {
            for (const titleVariant of titleVariants) {
                try {
                    const data = await getJson(
                        `https://api.lyrics.ovh/v1/${encodeURIComponent(artistVariant)}/${encodeURIComponent(titleVariant)}`
                    );

                    if (data?.lyrics) {
                        return {
                            lyrics: data.lyrics,
                            source: "lyrics.ovh",
                            synced: null,
                        };
                    }
                } catch {}
            }
        }

        return null;
    }

    async fetchFromFallbackApi(title, artist) {
        try {
            const query = `${artist} ${title}`.trim();
            const data = await getJson(
                `https://some-random-api.com/lyrics?title=${encodeURIComponent(query)}`
            );
            if (data?.lyrics) {
                return { lyrics: data.lyrics, source: "Some Random API", synced: null };
            }
        } catch {}

        return null;
    }

    async fetchLyrics(title, artist, durationMs = 0) {
        const normalizedTitle = normalizeTitle(title);
        const artistVariants = expandArtistVariants(artist);
        const primaryArtist = artistVariants[0] || artist;

        for (const source of this.sources) {
            try {
                const result = await source(normalizedTitle || title, primaryArtist, durationMs);
                if (result?.lyrics) {
                    return result;
                }
            } catch {}
        }

        return null;
    }
}

function parseSyncedLyrics(syncedLyrics) {
    if (!syncedLyrics || typeof syncedLyrics !== "string") {
        return [];
    }

    const lines = syncedLyrics.split("\n");
    const parsed = [];

    for (const line of lines) {
        const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
        if (!match) {
            continue;
        }

        const minutes = Number.parseInt(match[1], 10);
        const seconds = Number.parseInt(match[2], 10);
        const milliseconds = Number.parseInt(match[3].padEnd(3, "0"), 10);
        const text = match[4].trim();

        if (!text) {
            continue;
        }

        parsed.push({
            time: minutes * 60_000 + seconds * 1_000 + milliseconds,
            text,
        });
    }

    return parsed.sort((left, right) => left.time - right.time);
}

module.exports = {
    LyricsManager,
    parseSyncedLyrics,
};

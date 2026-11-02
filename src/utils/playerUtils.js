async function safeDestroyPlayer(player) {
    if (!player) return;

    try {
        await player.destroy();
    } catch (error) {
        if (error.status === 404) {
            console.log(`Player already destroyed or session not found for guild ${player.guildId}`);
        } else {
            console.error(`Error destroying player for guild ${player.guildId}:`, error);
        }
    }
}

async function handleSessionError(error, player, client) {
    if (error.status === 404 && error.message && error.message.includes('Session not found')) {
        console.log(`Session lost for guild ${player.guildId}, cleaning up...`);

        try {
            if (client.manager.players.has(player.guildId)) {
                client.manager.players.delete(player.guildId);
            }
        } catch (cleanupError) {
            console.error(`Error during session cleanup:`, cleanupError);
        }

        return true;
    }
    return false;
}

const Prefix = require('../schema/prefix');

async function recreatePlayer(client, guildId, voiceId, textId) {
    try {
        if (client.manager.players.has(guildId)) {
            client.manager.players.delete(guildId);
        }

        const data = await Prefix.findOne({ Guild: guildId });
        const defaultVolume = data?.Volume || 80;

        const newPlayer = await client.manager.createPlayer({
            guildId: guildId,
            voiceId: voiceId,
            textId: textId,
            volume: defaultVolume,
            deaf: true,
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        if (!newPlayer || !client.manager.players.get(guildId)) {
            throw new Error("Failed to recreate player - connection timeout");
        }

        return newPlayer;
    } catch (error) {
        console.error(`Error recreating player:`, error);
        throw error;
    }
}

async function attemptAutoplay(client, player) {
    let acquired = false;
    try {
        if (!player) return;
        const autoplay = player.data?.get("autoplay");
        if (!autoplay) return;

        const loopMode = (player.loop || "none").toString().toLowerCase();
        if (loopMode === "track" || loopMode === "queue") {
            client.logger?.log(`[Autoplay] Skipping autoplay due to loop mode "${loopMode}" in guild ${player.guildId}`, "debug");
            return;
        }

        // Only trigger if queue is empty AND nothing is playing/paused
        if (player.queue?.size > 0) return;
        if (player.playing || player.paused) return;
        if (player.data?.get("autoplayInProgress")) return;

        player.data?.set("autoplayInProgress", true);
        acquired = true;

        const lastTrack = player.data?.get("lastTrack") || null;
        if (!lastTrack || !lastTrack.title) {
            player.data?.delete("autoplayInProgress");
            return;
        }

        const normalize = (str) => (str || "")
            .toLowerCase()
            .replace(/\s*-\s*topic\s*$/gi, "")
            .replace(/\(.*?(official|audio|video|lyrics).*?\)/gi, "")
            .replace(/\[.*?(official|audio|video|lyrics).*?\]/gi, "")
            .replace(/official|audio|video|lyrics|hd|4k|remastered|mv/gi, "")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        const extractYouTubeId = (uri) => {
            if (!uri) return null;
            const m = uri.match(/(?:v=|\/vi?\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            return m ? m[1] : null;
        };

        const isSameTrack = (a, b) => {
            try {
                if (!a || !b) return false;
                if (a.identifier && b.identifier && a.identifier === b.identifier) return true;
                const aId = extractYouTubeId(a.uri);
                const bId = extractYouTubeId(b.uri);
                if (aId && bId && aId === bId) return true;

                const at = normalize(a.title);
                const bt = normalize(b.title);
                const aa = normalize(a.author);
                const ba = normalize(b.author);

                // If title and author match exactly after normalization
                if (at && bt && at === bt && aa && ba && aa === ba) return true;
                
                // If title matches exactly and artist is similar
                if (at && bt && at === bt && (aa.includes(ba) || ba.includes(aa))) return true;

                // Length check for similar tracks
                if (at && bt && at === bt) {
                    const aLen = Number(a.length || 0);
                    const bLen = Number(b.length || 0);
                    if (Math.abs(aLen - bLen) <= 5000) return true;
                }
            } catch { }
            return false;
        };

        const recentKey = "recentAutoplayIds";
        const recent = player.data?.get(recentKey) || [];
        const remember = (t) => {
            const id = t.identifier || extractYouTubeId(t.uri) || t.uri;
            const next = Array.from(new Set([id, ...recent])).filter(Boolean).slice(0, 50);
            player.data?.set(recentKey, next);
        };

        const cleanAuthor = (author) => {
            if (!author) return "";
            return author.replace(/\s*-\s*Topic\s*$/i, "").trim();
        };

        const query = `${lastTrack.title} ${cleanAuthor(lastTrack.author)}`.trim();
        const engines = ["ytmsearch", "ytsearch", "spsearch", "amsearch", "dzsearch", "jssearch"];

        // Search all platforms in parallel for better variety and speed
        const searchPromises = engines.map(async (engine) => {
            try {
                const res = await player.search(query, {
                    engine,
                    requester: lastTrack.requester || client.user
                });
                return res?.tracks || [];
            } catch (e) {
                return [];
            }
        });

        const allResults = await Promise.all(searchPromises);
        const candidatePool = allResults.flat();

        // Filter out same track and recently played tracks
        const filteredPool = candidatePool.filter(t => {
            const isSame = isSameTrack(lastTrack, t);
            const isRecent = recent.includes(t.identifier || extractYouTubeId(t.uri) || t.uri);
            return !isSame && !isRecent;
        });

        let foundTrack = null;
        if (filteredPool.length > 0) {
            // Pick a random track from the top 5 relevant results to increase variety
            const varietyPool = filteredPool.slice(0, 5);
            foundTrack = varietyPool[Math.floor(Math.random() * varietyPool.length)];
            
            // Log which engine provided the track
            const engineIndex = allResults.findIndex(tracks => tracks.includes(foundTrack));
            if (engineIndex !== -1) {
                player.data?.set("lastAutoplaySource", engines[engineIndex]);
            }
        }

        if (!foundTrack) {
            client.logger?.log(`[Autoplay] No related tracks found for "${lastTrack.title}" in guild ${player.guildId}`, "debug");
            player.data?.delete("autoplayInProgress");
            return;
        }

        if (!player.data?.get("autoplay") || player.playing || player.paused || player.queue.size > 0 ||
            client.manager?.players.get(player.guildId) !== player) return;
        player.queue.add(foundTrack);
        remember(foundTrack);
        client.logger?.log(`[Autoplay] Queued "${foundTrack.title}" (source: ${player.data?.get("lastAutoplaySource") || "unknown"}) in guild ${player.guildId}`, "log");

        if (!player.playing && !player.paused) {
            try {
                await player.play();
            } catch (playErr) {
                client.logger?.log(`[Autoplay] Failed to start playback: ${playErr.message}`, "error");
            }
        }
    } catch (err) {
        client.logger?.log(`[Autoplay] Error: ${err.message}`, "error");
    } finally {
        try {
            if (acquired) player?.data?.delete("autoplayInProgress");
        } catch {}
    }
}

module.exports = { safeDestroyPlayer, handleSessionError, recreatePlayer, attemptAutoplay };

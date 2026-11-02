export function sameTrack(left, right) {
  if (!left || !right) return false;
  if (left.uri && right.uri) return left.uri === right.uri;
  if (left.identifier && right.identifier) return left.identifier === right.identifier;
  return Boolean(left.title && right.title && left.author && right.author && left.title === right.title && left.author === right.author);
}

export function mergeTrackMetadata(track, cached) {
  if (!track) return null;
  const fallback = sameTrack(track, cached) ? cached : null;
  const length = Number(track.length);
  return {
    ...track,
    length: Number.isFinite(length) && length > 0 ? length : Number(fallback?.length) || 0,
    thumbnail: track.thumbnail || fallback?.thumbnail || null,
    requester: (typeof track.requester === "string" && track.requester) || track.requester?.username || fallback?.requester || "Unknown user",
  };
}

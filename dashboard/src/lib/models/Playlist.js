import mongoose from "mongoose";

const playlistSongSchema =
  mongoose.models.Playlist?.schema?.path("playlists")?.schema?.path("songs")?.schema ||
  new mongoose.Schema(
    {
      title: { type: String, required: true },
      url: { type: String, required: true },
      duration: { type: String, default: "" },
      thumbnail: { type: String, default: "" },
      author: { type: String, default: "" },
      identifier: { type: String, default: "" },
      sourceName: { type: String, default: "" },
      addedAt: { type: Date, default: Date.now },
    },
    { _id: true }
  );

const playlistEntrySchema =
  mongoose.models.Playlist?.schema?.path("playlists")?.schema ||
  new mongoose.Schema(
    {
      name: { type: String, required: true },
      normalizedName: { type: String, required: true },
      songs: [playlistSongSchema],
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    { _id: true }
  );

const playlistSchema =
  mongoose.models.Playlist?.schema ||
  new mongoose.Schema(
    {
      userId: { type: String, required: true, unique: true },
      playlists: [playlistEntrySchema],
    },
    { minimize: false }
  );

export default mongoose.models.Playlist || mongoose.model("Playlist", playlistSchema);

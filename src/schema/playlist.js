const mongoose = require("mongoose");

const playlistSongSchema = new mongoose.Schema(
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

const playlistEntrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    normalizedName: { type: String, required: true },
    songs: [playlistSongSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const playlistSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    playlists: [playlistEntrySchema],
  },
  { minimize: false }
);

module.exports = mongoose.models.Playlist || mongoose.model("Playlist", playlistSchema);

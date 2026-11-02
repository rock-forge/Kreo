import mongoose from "mongoose";

const likedSchema =
  mongoose.models.Liked?.schema ||
  new mongoose.Schema(
    {
      userId: { type: String, required: true, unique: true },
      songs: [
        {
          title: { type: String, required: true },
          url: { type: String, required: true },
          duration: { type: String, default: "" },
          thumbnail: { type: String, default: "" },
          author: { type: String, default: "" },
          addedAt: { type: Date, default: Date.now },
        },
      ],
    },
    { minimize: false }
  );

export default mongoose.models.Liked || mongoose.model("Liked", likedSchema);

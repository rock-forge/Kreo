const { Schema, model } = require("mongoose");

const Prefix = new Schema({
  Guild: String,
  Prefix: String,
  oldPrefix: String,
  Volume: { type: Number, default: 80 },
});

module.exports = model("prefix", Prefix);

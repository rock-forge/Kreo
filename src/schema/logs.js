const { Schema, model, models } = require("mongoose");

const logsSchema = new Schema({
  Guild: {
    type: String,
    required: true,
  },
  Channel: {
    type: String,
    required: true,
  },
});

module.exports = models.Logs || model("Logs", logsSchema);

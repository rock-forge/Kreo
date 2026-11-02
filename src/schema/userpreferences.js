const mongoose = require('mongoose');

const userPreferencesSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  musicSource: {
    type: String,
    enum: ['ytsearch', 'ytmsearch', 'spsearch', 'scsearch', 'dzsearch', 'jssearch'],
    default: 'ytmsearch'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userPreferencesSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('UserPreferences', userPreferencesSchema);

const mongoose = require('mongoose');

const GlossaryTermSchema = new mongoose.Schema({
  term: {
    type: String,
    required: true,
    trim: true,
  },
  translation: {
    type: String,
    required: true,
    trim: true,
  },
  langPair: {
    type: String, // e.g., 'en-id' or 'id-en'
    required: true,
    default: 'en-id'
  },
  context: {
    type: String,
    default: 'General'
  }
}, { timestamps: true });

// Compound index to ensure unique terms per language pair and context
GlossaryTermSchema.index({ term: 1, langPair: 1, context: 1 }, { unique: true });

module.exports = mongoose.model('GlossaryTerm', GlossaryTermSchema);

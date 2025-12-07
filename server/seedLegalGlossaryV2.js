const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const GlossaryTerm = require('./models/GlossaryTerm');

dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mern-translation-db', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Connected for Seeding Legal Glossary V2 (CSV)'))
.catch(err => {
  console.error('MongoDB Connection Error:', err);
  process.exit(1);
});

const cleanTerm = (term) => {
  // Remove "..." and ".."
  let cleaned = term.replace(/\.{2,}/g, '');
  
  // Remove content in square brackets [] e.g. [Undang-Undang]
  cleaned = cleaned.replace(/\[.*?\]/g, '');
  
  // Remove leading/trailing non-alphanumeric (like commas, spaces)
  cleaned = cleaned.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ' ').trim();
  
  return cleaned;
};

// Simple CSV Parser that handles quoted fields
const parseCSVLine = (text) => {
  const result = [];
  let cur = '';
  let inQuote = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (inQuote) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += char;
      }
    } else {
      if (char === '"') {
        inQuote = true;
      } else if (char === ',') {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
  }
  result.push(cur.trim());
  return result;
};

const seedLegalGlossary = async () => {
  try {
    const filePath = path.join(__dirname, 'data', 'legal_glossary_v2.csv');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');

    console.log(`Found ${lines.length} lines. Processing...`);

    // 1. Clear existing Legal terms
    console.log('Clearing existing Legal terms...');
    await GlossaryTerm.deleteMany({ context: 'Legal' });
    console.log('Cleared.');

    const terms = [];
    
    // Skip header (start at 1)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = parseCSVLine(line);
      // Format: No, Istilah Indonesia, Istilah Inggris
      if (parts.length >= 3) {
        const idTermRaw = parts[1];
        const enTermRaw = parts[2];

        if (idTermRaw && enTermRaw) {
          // 1. ID -> EN (Legal)
          const idTermClean = cleanTerm(idTermRaw);
          
          if (idTermClean.length > 1) { 
             // Normalize translation: replace / with ; but KEEP brackets and ellipses for context
             let cleanTranslation = enTermRaw.replace(/\//g, ';').trim();
             
             terms.push({
              term: idTermClean,
              translation: cleanTranslation, 
              langPair: 'id-en',
              context: 'Legal'
            });
          }

          // 2. EN -> ID (Legal)
          // Split EN terms by '/' for variations
          const enVariations = enTermRaw.split('/').map(t => t.trim());
          
          enVariations.forEach(enVar => {
            if (enVar) {
               const enTermClean = cleanTerm(enVar);
               
               if (enTermClean.length > 1) {
                 terms.push({
                   term: enTermClean,
                   translation: idTermRaw,
                   langPair: 'en-id',
                   context: 'Legal'
                 });
               }
            }
          });
        }
      }
    }

    console.log(`Parsed ${terms.length} terms.`);

    // Upsert
    let inserted = 0;
    let updated = 0;

    for (const t of terms) {
      // We use the CLEAN term as the key
      const result = await GlossaryTerm.updateOne(
        { term: t.term, langPair: t.langPair, context: 'Legal' },
        { $set: t },
        { upsert: true }
      );
      
      if (result.upsertedCount > 0) inserted++;
      else if (result.modifiedCount > 0) updated++;
    }

    console.log(`Seeding Complete. Inserted: ${inserted}, Updated: ${updated}`);

    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedLegalGlossary();

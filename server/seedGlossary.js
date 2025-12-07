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
.then(() => console.log('MongoDB Connected for Seeding'))
.catch(err => {
  console.error('MongoDB Connection Error:', err);
  process.exit(1);
});

const seedGlossary = async () => {
  try {
    const filePath = path.join(__dirname, 'data', 'glossary.txt');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');

    console.log(`Found ${lines.length} lines. Processing...`);

    const terms = [];
    // Skip header if it exists (checking first line)
    let startIndex = 0;
    if (lines[0].toLowerCase().includes('id term') || lines[0].toLowerCase().includes('en term')) {
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Split by tab or multiple spaces
      // The user data seems to have "Term1 [tab] Term2" or similar.
      // Let's try splitting by tab first
      let parts = line.split('\t');
      
      // If no tab, try splitting by 2 or more spaces
      if (parts.length < 2) {
        parts = line.split(/\s{2,}/);
      }

      if (parts.length >= 2) {
        const enTerm = parts[0].trim();
        const idTerm = parts[1].trim();

        if (enTerm && idTerm) {
          // Add English -> Indonesian (Keep full string for context)
          terms.push({
            term: enTerm,
            translation: idTerm,
            langPair: 'en-id'
          });
          
          // Add Indonesian -> English (Reverse)
          // Split by semicolon to handle multiple meanings
          // e.g. "akuntabilitas; pertanggungjawaban" -> "accountability"
          const idTerms = idTerm.split(';').map(t => t.trim());
          
          idTerms.forEach(idT => {
            if (idT) {
              const variations = [idT];
              // If term has parentheses, add a version without them
              if (idT.includes('(') && idT.includes(')')) {
                const cleanTerm = idT.replace(/\s*\(.*?\)\s*/g, '').trim();
                if (cleanTerm && cleanTerm !== idT) {
                  variations.push(cleanTerm);
                }
              }

              variations.forEach(variant => {
                // Check if this specific reverse term already exists in the array to avoid duplicates
                const exists = terms.some(t => t.term === variant && t.langPair === 'id-en');
                if (!exists) {
                  terms.push({
                    term: variant,
                    translation: enTerm,
                    langPair: 'id-en'
                  });
                }
              });
            }
          });
        }
      }
    }

    console.log(`Parsed ${terms.length} terms (including reverse).`);

    // Clear existing? Maybe not, just upsert or ignore duplicates.
    // For this task, let's clear to ensure clean state from the file.
    await GlossaryTerm.deleteMany({});
    console.log('Cleared existing glossary.');

    // Batch insert
    await GlossaryTerm.insertMany(terms);
    console.log(`Successfully inserted ${terms.length} terms.`);

    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedGlossary();

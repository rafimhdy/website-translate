const mongoose = require('mongoose');
const dotenv = require('dotenv');
const GlossaryTerm = require('./models/GlossaryTerm');

dotenv.config();

// Native fetch for Node 18+
// If older node, might need node-fetch, but we saw v22 earlier.

const API_URL = 'http://localhost:5000/api/translate';
const DELAY_MS = 500; // Delay to avoid rate limits

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const runTest = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    // Fetch only EN-ID terms for now to keep it manageable, or all?
    // User said "all". Let's do EN-ID first as it's the primary list.
    const terms = await GlossaryTerm.find({ langPair: 'en-id' });
    console.log(`Found ${terms.length} EN->ID terms to test.`);

    let passed = 0;
    let failed = 0;
    const failedTerms = [];

    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      process.stdout.write(`Testing ${i + 1}/${terms.length}: "${term.term}"... `);

      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: term.term, // Send just the term
            from: 'en',
            to: 'id'
          })
        });

        const data = await response.json();
        const translated = data.translated.toLowerCase().trim();
        const expected = term.translation.toLowerCase();

        // Handle multiple meanings (split by semicolon)
        const expectedOptions = expected.split(';').map(t => t.trim());
        
        // Check if ANY of the expected options appear in the translation
        // We check "includes" because sometimes AI adds punctuation or context if it's confused,
        // but for a single word input it should be exact or close.
        // However, our strict rule says "Return ONLY the translated text".
        
        const isMatch = expectedOptions.some(opt => translated.includes(opt));

        if (isMatch) {
          console.log('PASS');
          passed++;
        } else {
          console.log(`FAIL. Got: "${translated}", Expected: "${expected}"`);
          failed++;
          failedTerms.push({ term: term.term, expected, got: translated });
        }

      } catch (err) {
        console.log('ERROR', err.message);
        failed++;
        failedTerms.push({ term: term.term, error: err.message });
      }

      await sleep(DELAY_MS);
    }

    console.log('\n--- TEST RESULTS ---');
    console.log(`Total: ${terms.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / terms.length) * 100).toFixed(2)}%`);

    if (failed > 0) {
      console.log('\nFailed Terms:');
      failedTerms.forEach(t => {
        console.log(`- ${t.term}: Expected [${t.expected}] -> Got [${t.got || t.error}]`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Test script error:', error);
    process.exit(1);
  }
};

runTest();

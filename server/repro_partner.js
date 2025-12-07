const fetch = require('node-fetch');
const fs = require('fs');

const run = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: "I have partner",
        from: "en",
        to: "id"
      })
    });

    const data = await response.json();
    console.log('--- Response ---');
    console.log(JSON.stringify(data, null, 2));
    fs.writeFileSync('repro_partner_result.json', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
};

run();

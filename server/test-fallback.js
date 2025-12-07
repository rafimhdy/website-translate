const translate = require('google-translate-api-x');

async function test() {
  try {
    const res = await translate('The bank interest is high.', { from: 'en', to: 'id' });
    console.log('Translated:', res.text);
    console.log('Full Response:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

test();

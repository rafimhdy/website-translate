const http = require('http');

const testEllipses = async () => {
  // "must" -> "Harus" (Clean in new glossary)
  // "Board" -> "Badan" (Clean in new glossary)
  const text = "The Chairman must notify the Board.";
  
  const postData = JSON.stringify({
    text: text,
    from: 'en',
    to: 'id',
    context: 'Legal'
  });

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/translate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('--- Testing Ellipses Handling ---');
      console.log('Input:', text);
      console.log('Response:', data);
      
      try {
        const json = JSON.parse(data);
        if (json.translated) {
            if (json.translated.includes('...')) {
                console.error('FAIL: Output contains ellipses!');
                process.exit(1);
            } else {
                console.log('PASS: Output does not contain ellipses.');
                process.exit(0);
            }
        } else {
            console.error('FAIL: No translation returned');
            process.exit(1);
        }
      } catch (e) {
        console.error('FAIL: Invalid JSON', e);
        process.exit(1);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
    process.exit(1);
  });

  req.write(postData);
  req.end();
};

testEllipses();

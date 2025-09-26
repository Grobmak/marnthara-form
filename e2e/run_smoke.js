const cp = require('child_process');
const http = require('http');
const path = require('path');

const serverProc = cp.spawn(process.execPath, [path.join(__dirname, '..', 'dev-server.js')], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env
});

serverProc.stdout.on('data', d => process.stdout.write('[server] ' + d));
serverProc.stderr.on('data', d => process.stderr.write('[server-err] ' + d));

function waitForServer(url, timeout = 5000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function check() {
      http.get(url, res => resolve()).on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('Server start timeout'));
        setTimeout(check, 200);
      });
    })();
  });
}

(async () => {
  try {
    await waitForServer('http://localhost:8080');
    console.log('Server is up. Starting Puppeteer tests.');
    await require('./smoke.test.js')();
    console.log('\nAll tests passed. Shutting down server.');
  } catch (err) {
    console.error('Error during E2E run:', err);
    process.exitCode = 2;
  } finally {
    serverProc.kill();
  }
})();

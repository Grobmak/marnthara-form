const http = require('http');
const handler = require('serve-handler');

const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  return handler(req, res, { public: './' });
});

server.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
});

// handle shutdown
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });

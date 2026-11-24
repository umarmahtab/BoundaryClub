// Boundary Club - Server Entry Point
const { server } = require('./server/server');

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Boundary Club auction server running at http://localhost:${PORT}`);
});

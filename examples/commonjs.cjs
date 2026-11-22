// CommonJS as in 1.x: require() returns the constructor, which also works without `new`.
const artnet = require('artnet')({host: process.argv[2]});

artnet.set(1, [255, 127], (err) => {
    if (err) console.error(err.message);
    artnet.close();
});

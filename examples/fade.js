// Fade all 512 channels of the first 8 universes up and down: node examples/fade.js [host]
// A frame is produced every 10 ms; the library sends at most one packet per universe every 25 ms.
import Artnet from 'artnet';

const artnet = new Artnet({host: process.argv[2]});
artnet.on('error', (err) => console.error(err.message));

let level = 0;
let step = 1;

const timer = setInterval(() => {
    level += step;
    if (level === 0 || level === 255) step = -step;
    for (let universe = 0; universe < 8; universe++) {
        artnet.set(universe, 1, new Array(512).fill(level));
    }
}, 10);

process.on('SIGINT', () => {
    clearInterval(timer);
    // blackout; close() still sends what waits for the throttle
    for (let universe = 0; universe < 8; universe++) {
        artnet.set(universe, 1, new Array(512).fill(0));
    }
    artnet.close(() => console.log('\nblackout, bye'));
});

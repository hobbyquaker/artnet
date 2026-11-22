// Set channel 1 to full and leave: node examples/set.js [host]
// Without a host the packet is broadcast to 255.255.255.255.
import Artnet from 'artnet';

const artnet = new Artnet({host: process.argv[2]});

artnet.on('error', (err) => {
    console.error(err.message);
    process.exitCode = 1;
});

artnet.set(1, 255, (err, bytes) => {
    console.log(err ? 'failed: ' + err.message : 'sent ' + bytes + ' bytes');
    artnet.close();
});

// Send an ArtTrigger: node examples/trigger.js [host]
import Artnet from 'artnet';

const KEY_ASCII = 0;
const KEY_MACRO = 1;

const artnet = new Artnet({host: process.argv[2]});

// run macro 3 on every node
artnet.trigger(3, KEY_MACRO);

// send the letter "G" to the nodes of one manufacturer (OEM code 0x6a6b)
artnet.trigger(0x6a6b, 'G'.charCodeAt(0), KEY_ASCII, () => artnet.close());

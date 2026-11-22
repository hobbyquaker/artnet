// Type-level test for index.d.ts - compiled with `tsc --noEmit`, never executed.
import Artnet, {Artnet as Named} from '../index.js';
import type {Artnet as Instance} from '../index.js';

const artnet = new Artnet({host: '2.0.0.1', port: 6454, refresh: 4000, iface: '2.0.0.100', sendAll: true});
const factory: Instance = Artnet({host: '2.0.0.1', localPort: '6454'});
const named: Artnet = new Named();
const defaults: Artnet = new Artnet(null);

const options: Artnet.Options = {host: undefined, port: '6454'};
const callback: Artnet.Callback = (err, bytes) => console.log(err?.message, bytes);
console.log(options, factory, named, defaults);

const ok: boolean = artnet.set(255);
artnet.set([255, null, 127], callback);
artnet.set(1, 255);
artnet.set(1, [1, 2, undefined], (err, bytes) => console.log(err, bytes));
artnet.set(1, Uint8Array.of(1, 2));
artnet.set(0, 1, 255);
artnet.set(0, 1, Buffer.from([1, 2]), callback);
console.log(ok);

artnet.send(0);
artnet.send(0, callback);
artnet.send(0, true, callback);

artnet.trigger(3);
artnet.trigger(1, 3, callback);
artnet.trigger(0x6a6b, 71, 2, callback);
artnet.sendTrigger(0xffff, 3, 1);

const value: number | null = artnet.data[0][0];
console.log(value);

artnet.on('error', (err) => console.log(err.message));
artnet.once('close', () => {});
artnet.setHost('2.0.0.2');
artnet.setPort(6455);
artnet.close(() => {});

class Dimmer extends Artnet {
    full(channel: number) {
        return this.set(channel, 255);
    }
}
new Dimmer().full(1);

// @ts-expect-error unknown option
new Artnet({hots: 'x'});
// @ts-expect-error a value is required
artnet.set();
// @ts-expect-error strings are not values
artnet.set(1, '255');

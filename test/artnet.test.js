import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import {EventEmitter, once} from 'node:events';
import {createRequire} from 'node:module';
import {afterEach, mock, test} from 'node:test';
import {setTimeout as sleep} from 'node:timers/promises';

import Artnet, {Artnet as Named} from '../lib/artnet.js';

const HEADER = [0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00];
const DMX = [...HEADER, 0x00, 0x50, 0, 14];
const TRIGGER = [...HEADER, 0x00, 0x99, 0, 14];

const open = new Set();

afterEach(async () => {
    mock.restoreAll();
    for (const item of open) await new Promise((resolve) => item.close(resolve));
    open.clear();
});

/** A UDP socket on the loopback interface playing the Art-Net node. */
async function createNode() {
    const socket = dgram.createSocket('udp4');
    const packets = [];
    const waiting = [];
    socket.on('message', (msg) => {
        packets.push(msg);
        for (const w of waiting.splice(0)) w();
    });
    socket.bind(0, '127.0.0.1');
    await once(socket, 'listening');
    open.add(socket);
    return {
        port: socket.address().port,
        packets,
        /** resolves with the packets as soon as there are `count` of them */
        async receive(count = 1) {
            while (packets.length < count) await new Promise((resolve) => waiting.push(resolve));
            return packets;
        },
    };
}

async function setup(options = {}) {
    const node = await createNode();
    const artnet = new Artnet({host: '127.0.0.1', port: node.port, ...options});
    open.add(artnet);
    return {node, artnet};
}

/** set()/send()/trigger() with a callback, as a promise of [err, res] */
function call(artnet, method, ...args) {
    return new Promise((resolve) => artnet[method](...args, (...result) => resolve(result)));
}

function dmx(msg) {
    assert.deepEqual([...msg.subarray(0, 12)], DMX);
    assert.equal(msg[12], 0, 'sequence');
    assert.equal(msg[13], 0, 'physical');
    const length = msg.readUInt16BE(16);
    assert.equal(msg.length, 18 + length);
    assert.equal(length % 2, 0, 'even length');
    return {universe: msg.readUInt16LE(14), length, data: [...msg.subarray(18)]};
}

/** Stands in for dgram.createSocket() where the real network would get in the way. */
class FakeSocket extends EventEmitter {
    sent = [];
    broadcast = false;
    closed = false;

    bind(options, callback) {
        this.bindOptions = options;
        this.once('listening', callback);
    }

    setBroadcast(flag) {
        this.broadcast = flag;
    }

    send(buf, port, host, callback) {
        this.sent.push({buf, port, host});
        process.nextTick(callback, null, buf.length);
    }

    close() {
        this.closed = true;
        process.nextTick(() => this.emit('close'));
    }
}

function fake(options) {
    const socket = new FakeSocket();
    const createSocket = mock.method(dgram, 'createSocket', () => socket);
    const artnet = new Artnet(options);
    open.add(artnet);
    return {socket, artnet, createSocket};
}

// --- module shape -------------------------------------------------------------------------------

test('default and named export are the same constructor', () => {
    assert.equal(Named, Artnet);
    assert.equal(typeof Artnet, 'function');
});

test('require() still returns the constructor, callable without new (CommonJS consumers)', async () => {
    const require = createRequire(import.meta.url);
    const Required = require('../lib/artnet.js');
    assert.equal(Required, Artnet);
    assert.equal(require('artnet'), Artnet, 'self reference through the exports map');
    assert.equal(require('artnet/lib/artnet.js'), Artnet, '1.x main file');
    assert.equal(require('artnet/package.json').name, 'artnet');

    const node = await createNode();
    const artnet = Required({host: '127.0.0.1', port: node.port}); // without new, as in 1.x
    open.add(artnet);
    assert.ok(artnet instanceof Artnet);
    assert.ok(artnet instanceof EventEmitter);
    assert.deepEqual(artnet.data, []);
});

test('can be subclassed', async () => {
    class Dimmer extends Artnet {
        full(channel) {
            return this.set(channel, 255);
        }
    }
    const node = await createNode();
    const dimmer = new Dimmer({host: '127.0.0.1', port: node.port});
    open.add(dimmer);
    assert.ok(dimmer instanceof Dimmer);
    assert.ok(dimmer instanceof Artnet);
    assert.equal(dimmer.full(2), true);
    const [msg] = await node.receive();
    assert.deepEqual(dmx(msg).data, [0, 255]);
});

// --- ArtDmx -------------------------------------------------------------------------------------

test('set(channel, value) sends an ArtDmx packet up to the changed channel', async () => {
    const {node, artnet} = await setup();
    const [err, bytes] = await call(artnet, 'set', 1, 255);
    assert.equal(err, null);
    assert.equal(bytes, 20);
    const [msg] = await node.receive();
    assert.deepEqual([...msg], [...DMX, 0, 0, 0, 0, 0, 2, 255, 0]);
    assert.equal(artnet.data[0].length, 512);
    assert.equal(artnet.data[0][0], 255);
    assert.equal(artnet.data[0][1], null);
});

test('set(value) defaults to channel 1 of universe 0', async () => {
    const {node, artnet} = await setup();
    assert.equal(artnet.set(7), true);
    const [msg] = await node.receive();
    assert.deepEqual(dmx(msg), {universe: 0, length: 2, data: [7, 0]});
});

test('set(values) sets subsequent channels, null leaves a channel unchanged', async () => {
    const {node, artnet} = await setup();
    artnet.set([10, 20, 30]);
    await sleep(40);
    artnet.set(2, [255, null, 127]);
    const [first, second] = await node.receive(2);
    assert.deepEqual(dmx(first).data, [10, 20, 30, 0]);
    assert.deepEqual(dmx(second).data, [10, 255, 30, 127]);
});

test('set(universe, channel, value) addresses the 15 bit universe as SubUni, Net', async () => {
    const {node, artnet} = await setup();
    const [err, bytes] = await call(artnet, 'set', 0x1234, 3, 99);
    assert.equal(err, null);
    assert.equal(bytes, 22);
    const [msg] = await node.receive();
    assert.equal(msg[14], 0x34, 'SubUni');
    assert.equal(msg[15], 0x12, 'Net');
    assert.deepEqual(dmx(msg), {universe: 0x1234, length: 4, data: [0, 0, 99, 0]});
    assert.equal(artnet.data[0x1234][2], 99);
    assert.equal(artnet.data[0], undefined);
});

test('numbers may be passed as strings, as in 1.x', async () => {
    const {node, artnet} = await setup({refresh: '60000', sendAll: 0});
    artnet.set('2', '5', [1, 2]);
    const [msg] = await node.receive();
    assert.deepEqual(dmx(msg), {universe: 2, length: 6, data: [0, 0, 0, 0, 1, 2]});
});

test('a callback as fourth argument may be undefined', async () => {
    const {node, artnet} = await setup();
    assert.equal(artnet.set(1, 2, 3, undefined), true);
    const [msg] = await node.receive();
    assert.deepEqual(dmx(msg), {universe: 1, length: 2, data: [0, 3]});
});

test('values are rounded and limited to 0-255, anything else leaves the channel unchanged', async () => {
    const {node, artnet} = await setup();
    artnet.set(1, [300, -5, 127.6, 0.4, Number.NaN, '9', undefined, {}, true, 8]);
    const [msg] = await node.receive();
    assert.deepEqual(dmx(msg).data, [255, 0, 128, 0, 0, 0, 0, 0, 0, 8]);
    assert.deepEqual(artnet.data[0].slice(0, 10), [255, 0, 128, 0, null, null, null, null, null, 8]);
});

test('typed arrays and buffers are accepted as values', async () => {
    const {node, artnet} = await setup();
    artnet.set(1, Uint8Array.of(1, 2));
    await sleep(40);
    artnet.set(3, Buffer.from([3, 4]));
    const packets = await node.receive(2);
    assert.deepEqual(dmx(packets[1]).data, [1, 2, 3, 4]);
});

test('values beyond channel 512 are dropped', async () => {
    const {node, artnet} = await setup();
    artnet.set(511, [1, 2, 3, 4]);
    const [msg] = await node.receive();
    const {length, data} = dmx(msg);
    assert.equal(length, 512);
    assert.deepEqual(data.slice(509), [0, 1, 2]);
    assert.equal(artnet.data[0].length, 512);
});

test('unchanged values send nothing and call back with (null, null)', async () => {
    const {node, artnet} = await setup();
    await call(artnet, 'set', 1, [1, 2]);
    assert.deepEqual(await call(artnet, 'set', 1, [1, 2]), [null, null]);
    assert.deepEqual(await call(artnet, 'set', 1, null), [null, null]);
    assert.deepEqual(await call(artnet, 'set', null), [null, null]);
    assert.equal(artnet.set(2, 2), true);
    assert.equal(artnet.set(1, 'x'), true);
    assert.equal(
        artnet.set(() => {}),
        true,
        'a lone function is a value, and ignored',
    );
    await sleep(60);
    assert.equal(node.packets.length, 1);
});

test('unusable arguments return false and report a RangeError', async () => {
    const {node, artnet} = await setup();
    assert.equal(artnet.set(), false);
    assert.equal(
        artnet.set(0, 1, 2, () => {}, 5),
        false,
    );
    assert.equal(artnet.set(0, 255), false);
    assert.equal(artnet.set(513, 255), false);
    assert.equal(artnet.set('x', 255), false);
    assert.equal(artnet.set(-1, 1, 255), false);
    assert.equal(artnet.set(32768, 1, 255), false);
    assert.equal(artnet.send(32768), false);
    assert.equal(artnet.send(-1, true, 'no function'), false);

    for (const args of [
        [0, 255],
        [513, 255],
        [32768, 1, 255],
    ]) {
        const [err, res] = await call(artnet, 'set', ...args);
        assert.ok(err instanceof RangeError, err);
        assert.equal(res, undefined);
    }
    const [err] = await call(artnet, 'send', 40000);
    assert.match(err.message, /universe must be in the range 0-32767/);

    await sleep(40);
    assert.equal(node.packets.length, 0);
    assert.deepEqual(artnet.data, []);
});

test('packets are throttled to 40 Hz per universe; every callback is called once (#28)', async () => {
    const {node, artnet} = await setup();
    const calls = [];
    const started = Date.now();
    for (let i = 1; i <= 50; i++) {
        artnet.set(0, 1, [i, i, i], (err, bytes) => calls.push({i, err, bytes, at: Date.now() - started}));
    }
    artnet.set(1, 1, 200);

    const packets = await node.receive(3);
    await sleep(60);
    assert.equal(packets.length, 3, 'one packet at once per universe, one with the rest after the throttle');

    const universe0 = packets.map(dmx).filter((p) => p.universe === 0);
    assert.deepEqual(universe0[0].data, [1, 1, 1, 0]);
    assert.deepEqual(universe0[1].data, [50, 50, 50, 0]);

    assert.deepEqual(
        calls.map((c) => c.i),
        Array.from({length: 50}, (_, i) => i + 1),
    );
    assert.ok(calls.every((c) => c.err === null && c.bytes === 22));
    assert.ok(calls[1].at >= 20, 'the second packet waited for the throttle: ' + calls[1].at);
});

test('the throttle keeps working packet after packet', async () => {
    const {node, artnet} = await setup();
    artnet.set(1, 1);
    artnet.set(1, 2);
    await node.receive(2);
    artnet.set(1, 3); // still inside the throttle of the second packet
    const packets = await node.receive(3);
    await sleep(60);
    assert.deepEqual(
        packets.map((p) => dmx(p).data[0]),
        [1, 2, 3],
    );
});

test('send(universe) sends the current state, send(universe, true) all 512 channels', async () => {
    const {node, artnet} = await setup();
    assert.deepEqual(await call(artnet, 'send', 3), [null, 20]);
    assert.deepEqual(dmx((await node.receive())[0]), {universe: 3, length: 2, data: [0, 0]});

    await sleep(40);
    artnet.set(3, 5, 50);
    await node.receive(2);
    await sleep(40);
    assert.equal(artnet.send(3, true), true);
    const packets = await node.receive(3);
    const full = dmx(packets[2]);
    assert.equal(full.length, 512);
    assert.deepEqual(full.data.slice(0, 6), [0, 0, 0, 0, 50, 0]);

    // 1.x called send(universe, 512) from the refresh timer
    await sleep(40);
    assert.deepEqual(await call(artnet, 'send', '3', 512), [null, 530]);
});

test('a refresh that hits the throttle is not lost', async () => {
    const {node, artnet} = await setup();
    artnet.set(1, 1);
    artnet.send(0, true);
    artnet.set(4, 4);
    const packets = await node.receive(2);
    assert.equal(dmx(packets[0]).length, 2);
    assert.equal(dmx(packets[1]).length, 512);
    assert.deepEqual(dmx(packets[1]).data.slice(0, 4), [1, 0, 0, 4]);
    await sleep(40);
    artnet.set(1, 2);
    assert.equal(dmx((await node.receive(3))[2]).length, 2, 'and does not stick');
});

test('unchanged data is refreshed with all 512 channels every `refresh` ms', async () => {
    const {node, artnet} = await setup({refresh: 50});
    artnet.set(2, 9);
    const packets = await node.receive(3);
    assert.equal(dmx(packets[0]).length, 2);
    assert.equal(dmx(packets[1]).length, 512);
    assert.deepEqual(dmx(packets[2]).data.slice(0, 3), [0, 9, 0]);
    artnet.close();
    await sleep(120);
    assert.equal(node.packets.length, packets.length, 'close() stops the refresh');
});

test('sendAll always sends all 512 channels', async () => {
    const {node, artnet} = await setup({sendAll: true});
    assert.deepEqual(await call(artnet, 'set', 1, 1), [null, 530]);
    assert.equal(dmx((await node.receive())[0]).length, 512);
});

test('methods work detached from the instance, on an array handed in as universe (scene-sequencer)', async () => {
    const {node, artnet} = await setup();
    artnet.data[0] = [];
    const config = {setter: artnet.set, data: artnet.data[0]};

    const scene = [];
    scene[2] = 30; // a sparse array: channels 1 and 2 stay as they are
    config.setter(scene);
    assert.equal(config.data[2], 30, 'the array is written in place');
    assert.equal(artnet.data[0], config.data);
    assert.deepEqual(dmx((await node.receive())[0]).data, [0, 0, 30, 0]);

    const {send, close} = artnet;
    await sleep(40);
    send(0, true);
    assert.equal(dmx((await node.receive(2))[1]).length, 512);
    await new Promise((resolve) => close(resolve));
});

test('nothing is sent or refreshed for a universe that never changed', async () => {
    const {node, artnet} = await setup({refresh: 30});
    assert.deepEqual(await call(artnet, 'set', 1, 1, []), [null, null]);
    artnet.set(1, 1, null);
    await sleep(100);
    assert.equal(node.packets.length, 0);
});

test('data may be read and replaced from outside', async () => {
    const {node, artnet} = await setup();
    artnet.set(1, 1);
    await node.receive();
    await sleep(40);
    artnet.data[0] = undefined;
    artnet.send(0);
    const packets = await node.receive(2);
    assert.deepEqual(dmx(packets[1]).data, [0, 0]);
    assert.equal(artnet.data[0].length, 512);
});

// --- ArtTrigger ---------------------------------------------------------------------------------

test('trigger(key) sends an ArtTrigger to every node (oem 0xffff), sub key 0', async () => {
    const {node, artnet} = await setup();
    assert.equal(artnet.trigger(3), true);
    const [msg] = await node.receive();
    assert.equal(msg.length, 530);
    assert.deepEqual([...msg.subarray(0, 18)], [...TRIGGER, 0, 0, 0xff, 0xff, 3, 0]);
    assert.ok(msg.subarray(18).every((b) => b === 0));
});

test('trigger(subkey, key) and trigger(oem, subkey, key), with and without callback', async () => {
    const {node, artnet} = await setup();
    artnet.trigger(1, 3);
    artnet.trigger(27243, 71, 2);
    assert.deepEqual(await call(artnet, 'trigger', 2), [null, 530]);
    assert.deepEqual(await call(artnet, 'trigger', 7, 1), [null, 530]);
    assert.deepEqual(await call(artnet, 'trigger', '0x0', '65', '0'), [null, 530]);
    artnet.trigger(1, 2, 3, undefined);
    const packets = await node.receive(6); // not throttled
    assert.deepEqual(
        packets.map((p) => [...p.subarray(14, 18)]),
        [
            [0xff, 0xff, 3, 1],
            [0x6a, 0x6b, 2, 71],
            [0xff, 0xff, 2, 0], // 1.x sent sub key 1 here
            [0xff, 0xff, 1, 7],
            [0, 0, 0, 65], // 1.x turned key 0 (KeyAscii) into 255 and oem 0 into 0xffff
            [0, 1, 3, 2],
        ],
    );
});

test('trigger() without usable arguments returns false', async () => {
    const {node, artnet} = await setup();
    assert.equal(artnet.trigger(), false);
    assert.equal(
        artnet.trigger(1, 2, 3, () => {}, 5),
        false,
    );
    assert.equal(artnet.trigger('x'), true, 'as in 1.x an unusable key becomes 255');
    const [msg] = await node.receive();
    assert.deepEqual([...msg.subarray(14, 18)], [0xff, 0xff, 255, 0]);
});

test('sendTrigger(oem, key, subkey) is the plain variant', async () => {
    const {node, artnet} = await setup();
    assert.equal(artnet.sendTrigger(0x1234, 1, 2), true);
    assert.deepEqual(await call(artnet, 'sendTrigger', 0xffff, 3, 4), [null, 530]);
    const packets = await node.receive(2);
    assert.deepEqual([...packets[0].subarray(14, 18)], [0x12, 0x34, 1, 2]);
});

// --- close --------------------------------------------------------------------------------------

test('close() sends what waits for the throttle before closing the socket (#28)', async () => {
    const {node, artnet} = await setup();
    const calls = [];
    for (let i = 1; i <= 10; i++) artnet.set(0, 1, [i, i], (err, bytes) => calls.push([err, bytes]));
    artnet.set(1, 1, 1);
    const closed = once(artnet, 'close');
    artnet.close();
    await closed;
    assert.equal(calls.length, 10);
    assert.ok(calls.every(([err, bytes]) => err === null && bytes === 20));
    const packets = await node.receive(3);
    assert.deepEqual(
        packets.map((p) => dmx(p).data),
        [
            [1, 1],
            [1, 0],
            [10, 10],
        ],
    );
});

test('close(callback) calls back once the socket is closed, also when called again', async () => {
    const {artnet} = await setup();
    await call(artnet, 'set', 1, 255);
    const order = [];
    artnet.on('close', () => order.push('event'));
    await new Promise((resolve) => {
        artnet.close(() => {
            order.push('first');
        });
        artnet.close(() => {
            order.push('second');
            resolve();
        });
    });
    assert.deepEqual(order, ['event', 'first', 'second']);
    await new Promise((resolve) => artnet.close(resolve));
    artnet.close(); // 1.x threw ERR_SOCKET_DGRAM_NOT_RUNNING here
});

test('the README example: close() inside the set() callback', async () => {
    const {node, artnet} = await setup();
    await new Promise((resolve) => {
        artnet.set(1, 255, () => {
            artnet.close(resolve);
        });
    });
    assert.equal((await node.receive()).length, 1);
});

test('after close() nothing is sent: false and an error for the callback', async () => {
    const {node, artnet} = await setup();
    artnet.close();
    assert.equal(artnet.set(1, 255), false);
    assert.equal(artnet.send(0), false);
    assert.equal(artnet.trigger(1), false);
    assert.equal(artnet.sendTrigger(1, 2, 3), false);
    for (const [method, ...args] of [
        ['set', 1, 255],
        ['send', 0],
        ['send', 0, true],
        ['trigger', 1],
        ['sendTrigger', 1, 2, 3],
    ]) {
        const [err] = await call(artnet, method, ...args);
        assert.match(err.message, /closed/, method);
    }
    await sleep(40);
    assert.equal(node.packets.length, 0);
});

// --- host and port ------------------------------------------------------------------------------

test('setHost() and setPort() change the destination', async () => {
    const {node, artnet} = await setup({host: 'localhost'});
    const other = await createNode();
    await call(artnet, 'set', 1, 1);
    await node.receive();
    artnet.setHost('127.0.0.1');
    artnet.setPort(String(other.port));
    await sleep(40);
    await call(artnet, 'set', 1, 2);
    await other.receive();
    assert.equal(node.packets.length, 1);
    assert.equal(other.packets.length, 1);

    assert.throws(() => artnet.setHost(''), TypeError);
    assert.throws(() => artnet.setHost(undefined), TypeError);
    assert.throws(() => artnet.setPort(0), RangeError);
    assert.throws(() => artnet.setPort(65536), RangeError);
    assert.throws(() => artnet.setPort('x'), RangeError);
});

test('a send error is reported to the callback', async () => {
    const {artnet} = await setup({host: 'no-such-host.invalid'});
    artnet.on('error', assert.fail);
    const [err, bytes] = await call(artnet, 'set', 1, 1);
    assert.match(err.code, /^(ENOTFOUND|EAI_AGAIN)$/);
    assert.equal(bytes, undefined);
});

// --- socket setup (dgram mocked) ----------------------------------------------------------------

test('by default the socket is bound to the Art-Net port and broadcasts to 255.255.255.255', async () => {
    const {socket, artnet, createSocket} = fake();
    assert.deepEqual(createSocket.mock.calls[0].arguments, [{type: 'udp4', reuseAddr: true}]);
    assert.deepEqual(socket.bindOptions, {port: 6454, exclusive: false});

    // sent as soon as the socket is bound
    const result = call(artnet, 'set', 1, 255);
    artnet.trigger(1);
    assert.equal(socket.sent.length, 0);
    assert.equal(socket.broadcast, false);
    socket.emit('listening');
    assert.equal(socket.broadcast, true);
    assert.deepEqual(await result, [null, 20]);
    assert.deepEqual(
        socket.sent.map(({port, host, buf}) => [host, port, buf.length]),
        [
            ['255.255.255.255', 6454, 20],
            ['255.255.255.255', 6454, 530],
        ],
    );

    assert.throws(() => artnet.setPort(6455), /Can't change port when using broadcast address/);
    artnet.setHost('10.0.0.255');
    artnet.setPort(6455);
});

test('the options decide how the socket is bound', () => {
    const bound = (options) => fake(options).socket.bindOptions;
    assert.deepEqual(bound(null), {port: 6454, exclusive: false});
    assert.deepEqual(bound({port: '7000'}), {port: 7000, exclusive: false});
    assert.deepEqual(bound({port: 'x', refresh: 'x'}), {port: 6454, exclusive: false});
    // a directed broadcast address
    assert.deepEqual(bound({host: '2.255.255.255'}), {port: 6454, exclusive: false});
    // unicast: random source port, as in 1.x
    assert.deepEqual(bound({host: '2.0.0.1'}), {port: 0, exclusive: true});
    assert.deepEqual(bound({host: '2.0.0.1', port: 7000}), {port: 0, exclusive: true});
    // iface is honoured together with a unicast host (#22)
    assert.deepEqual(bound({host: '2.0.0.1', iface: '2.0.0.100'}), {
        port: 6454,
        exclusive: false,
        address: '2.0.0.100',
    });
    assert.deepEqual(bound({iface: '2.0.0.100', port: 7000}), {port: 7000, exclusive: false, address: '2.0.0.100'});
    // localPort overrides
    assert.deepEqual(bound({host: '2.0.0.1', localPort: 6454}), {port: 6454, exclusive: false});
    assert.deepEqual(bound({localPort: '0'}), {port: 0, exclusive: true});
});

test('close() before the socket is bound still sends what was set', async () => {
    const {socket, artnet} = fake({host: '2.0.0.1'});
    const result = call(artnet, 'set', 1, 255);
    artnet.set(1, 254);
    const closed = new Promise((resolve) => artnet.close(resolve));
    assert.equal(socket.closed, false);
    socket.emit('listening');
    assert.deepEqual(await result, [null, 20]);
    await closed;
    assert.equal(socket.sent.length, 2);
    assert.equal(socket.closed, true);
});

test('a socket that cannot be bound fails everything waiting and emits error', async () => {
    const {socket, artnet} = fake();
    const errors = [];
    artnet.on('error', (err) => errors.push(err));
    const results = [call(artnet, 'set', 1, 255), call(artnet, 'trigger', 1)];
    artnet.set(2, 255);
    artnet.set(2, 254);

    const failure = Object.assign(new Error('bind EADDRINUSE 0.0.0.0:6454'), {code: 'EADDRINUSE'});
    const closed = new Promise((resolve) => artnet.on('close', resolve));
    socket.emit('error', failure);

    assert.deepEqual(await Promise.all(results), [[failure], [failure]]);
    assert.deepEqual(errors, [failure]);
    await closed;
    assert.equal(socket.closed, true);
    assert.equal(socket.sent.length, 0);
    assert.equal(artnet.set(1, 1), false);
    await sleep(40);
    assert.equal(socket.sent.length, 0, 'no throttle or refresh timer is left');
});

test('a socket error after binding is emitted and nothing else', async () => {
    const {socket, artnet} = fake();
    socket.emit('listening');
    const errors = [];
    artnet.on('error', (err) => errors.push(err));
    const failure = new Error('boom');
    socket.emit('error', failure);
    assert.deepEqual(errors, [failure]);
    assert.deepEqual(await call(artnet, 'set', 1, 1), [null, 20]);
});

test('without an error listener a socket error throws, as with any EventEmitter', () => {
    const {socket} = fake();
    assert.throws(() => socket.emit('error', new Error('boom')), /boom/);
});

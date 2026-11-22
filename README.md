# artnet

[![NPM version](https://badge.fury.io/js/artnet.svg)](http://badge.fury.io/js/artnet)
[![npm](https://img.shields.io/npm/dt/artnet.svg)](https://www.npmjs.com/package/artnet)
[![CI](https://github.com/hobbyquaker/artnet/actions/workflows/ci.yml/badge.svg)](https://github.com/hobbyquaker/artnet/actions/workflows/ci.yml)
[![License][mit-badge]][mit-url]

Node.js module that sends DMX512 data to [Art-Net](https://art-net.org.uk/) nodes: ArtDmx packets
for dimmers, LED fixtures and moving lights, and ArtTrigger packets for macros and show control.

- No dependencies, a single file on top of `node:dgram`.
- Up to 32768 universes with 512 channels each, unicast or broadcast.
- Sends only what changed, throttled to 40 packets per second per universe, and refreshes
  unchanged universes every 4 seconds - as the Art-Net specification asks for.
- ES module with TypeScript declarations; `require('artnet')` works as it did in 1.x.

It is a sender. It does not receive Art-Net, discover nodes (ArtPoll) or speak RDM.

## Projects using this module

- [ioBroker.artnet](https://github.com/ioBroker/ioBroker.artnet) - Art-Net adapter for [ioBroker](https://www.iobroker.net/)
- [mqtt-dmx-sequencer](https://github.com/hobbyquaker/mqtt-dmx-sequencer) - control scenes and sequences via MQTT
- [mqtt-dmx-controller](https://github.com/hobbyquaker/mqtt-dmx-controller) - desktop app to create scenes and sequences
- [synesthesia](https://github.com/synesthesia-project/synesthesia) - sound-reactive lighting
- [vlight](https://github.com/kryops/vlight) - web based DMX controller

## Installation

```sh
npm install artnet
```

Node.js 20.19, 22.12, 24 or newer is required. See [Upgrading from 1.x](#upgrading-from-1x) if you
come from an older version.

## Usage

```js
import Artnet from 'artnet';

const artnet = new Artnet({host: '172.16.23.15'});

artnet.on('error', (err) => console.error(err.message));

// set channel 1 to 255 and close the socket afterwards
artnet.set(1, 255, (err, bytes) => {
    artnet.close();
});
```

CommonJS, exactly as in 1.x - `require()` returns the constructor, and it works without `new`:

```js
const artnet = require('artnet')({host: '172.16.23.15'});
```

`set()` takes an array to set several subsequent channels at once:

```js
// set channel 100 to 10, channel 101 to 20 and channel 102 to 30
artnet.set(100, [10, 20, 30]);
```

`null` keeps a channel as it is:

```js
// set channel 50 to 255 and channel 52 to 127
artnet.set(50, [255, null, 127]);
```

The channel is optional and defaults to 1:

```js
// set channel 1 to 255 and channel 2 to 127
artnet.set([255, 127]);
```

Universes are addressed by a leading argument:

```js
// set channel 1 of universe 3 to 255
artnet.set(3, 1, 255);
```

Trigger macros on the nodes:

```js
// key 3 (KeyShow), sub key 1: run show 1 on all nodes
artnet.trigger(1, 3);

// key 0 (KeyAscii), sub key 71: send the letter "G" to the nodes with OEM code 0x6a6b
artnet.trigger(0x6a6b, 71, 0);
```

More in [examples/](examples): [set.js](examples/set.js), [fade.js](examples/fade.js),
[trigger.js](examples/trigger.js), [commonjs.cjs](examples/commonjs.cjs).

## API

### new Artnet([options])

| option      | default             | description                                                                                                                         |
| :---------- | :------------------ | :---------------------------------------------------------------------------------------------------------------------------------- |
| `host`      | `'255.255.255.255'` | Hostname or IP address of the Art-Net node, or a broadcast address.                                                                 |
| `port`      | `6454`              | UDP port of the node.                                                                                                               |
| `refresh`   | `4000`              | Interval in milliseconds in which a universe is sent again with all 512 channels, changed or not.                                   |
| `sendAll`   | `false`             | Always send all 512 channels instead of channel 1 up to the last changed one. Some nodes need it.                                   |
| `iface`     |                     | IP address of the local network interface to send from. Needed on hosts with several interfaces.                                    |
| `localPort` | see below           | Local (source) UDP port. Defaults to `port` when `iface` is set or `host` is a broadcast address (ends in `255`), otherwise random. |

Every option is optional, `undefined` selects the default. The socket is created with `reuseAddr`,
so several instances - one per node, for example - can share the Art-Net port.

Some nodes ignore packets that do not come from port 6454. With a plain unicast `host` the source
port is random, as it always was; set `iface` or `localPort: 6454` for such nodes
([#22](https://github.com/hobbyquaker/artnet/issues/22)).

### set([[universe,] channel,] value [, callback])

### set([[universe,] channel,] values [, callback])

Sets one channel or, with an array, the channels from `channel` on, and sends the universe.

- `universe` 0-32767, default 0. If you give a universe, you have to give the channel too.
- `channel` 1-512, default 1.
- `value` 0-255. Numbers are rounded and limited to that range. `null`, `undefined` and anything
  that is not a number leave the channel unchanged. Arrays, typed arrays and Buffers are accepted
  as `values`; what exceeds channel 512 is dropped.
- `callback(err, bytes)` is called when the packet that carries the change was sent; `bytes` is the
  size of the UDP datagram. If nothing changed, nothing is sent and the callback is called
  immediately with `(null, null)`. Every callback is called exactly once.

Returns `true`. Returns `false` and calls back with an error - it never throws - if the universe or
channel is out of range, if there are no arguments, or after `close()`.

The callback is recognised by its position: a function as last argument, after at least a value.
Do not pass a placeholder `undefined` as callback with fewer than three other arguments -
`set(1, 255, undefined)` reads as universe 1, channel 255, no value.

### trigger([[oem,] subkey,] key [, callback])

Sends an ArtTrigger packet. Triggers are not throttled, they go out immediately.

- `key` 0 = KeyAscii, 1 = KeyMacro, 2 = KeySoft, 3 = KeyShow; 4-255 are undefined by Art-Net.
- `subkey` the ASCII character, macro, soft key or show number. Default 0.
- `oem` the manufacturer code of the nodes that shall react. Default `0xffff`: all nodes. With
  another OEM code the meaning of `key` and `subkey` is up to the manufacturer.
- `callback(err, bytes)`

`sendTrigger(oem, key, subkey [, callback])` does the same with all arguments in a fixed order.

### send(universe [, refresh] [, callback])

Sends the current values of a universe without changing them - all 512 channels if `refresh` is
`true`. `set()` and the refresh timer call this for you; it is rarely needed.

### close([callback])

Stops the refresh timers, sends what is still waiting for the throttle and closes the socket. The
callback and the `close` event follow when the socket is closed. Calling it again is harmless.
After `close()` the instance cannot be used any more.

### setHost(host)

Changes the Art-Net node. A broadcast address is fine, also if the instance started with a unicast
host.

### setPort(port)

Changes the Art-Net port. Throws while the host is `255.255.255.255`, as the socket is bound to the
port then.

### data

`artnet.data[universe]` is the array of the current values of a universe, `data[universe][channel - 1]`.
A channel is `null` until it is set for the first time, and is sent as 0. You may read it, and you
may assign your own array to `artnet.data[universe]` before using the universe - it is written in
place.

### Events

- `error` - the socket reported an error. Typically it could not be bound (`EADDRINUSE`, or
  `EADDRNOTAVAIL` for a wrong `iface`): then the callbacks that were waiting get the same error and
  the instance is closed. As with every EventEmitter an `error` without listener is thrown, so add
  one. Errors of a single send (an unresolvable host name, an unreachable network) are passed to
  the callback only.
- `close` - the socket is closed.

### TypeScript

Declarations are included: `import Artnet from 'artnet'`, with `Artnet.Options`, `Artnet.Callback`
and the instance type `Artnet`.

## How it sends

- **Throttle.** A universe sends at most one ArtDmx packet every 25 ms (40 Hz, the DMX512 frame
  rate). The first change goes out immediately; everything set during the following 25 ms is
  collected into one packet. So a loop that calls `set()` a thousand times costs two packets, and a
  node always ends up with the latest values.
- **Short packets.** A packet contains channel 1 up to the highest channel changed since the last
  packet, padded to an even length. `sendAll` switches that off.
- **Refresh.** Every universe that was sent once is repeated with all 512 channels every `refresh`
  milliseconds, so that a node that was switched on later or missed a packet catches up. The timers
  keep the process alive until `close()`.
- **Broadcast.** Without `host` packets go to `255.255.255.255`. On a host with several network
  interfaces set `iface`, or use the directed broadcast address of the Art-Net network
  (`2.255.255.255`, `10.255.255.255`).

## Upgrading from 1.x

2.0 is a rewrite with the same API. In most projects the new version is a drop-in, given a current
Node.js. What is different:

- **Node.js 20.19, 22.12, 24 or newer.** The package is an ES module; `require('artnet')` still
  returns the constructor on these versions. Older Node.js: stay on `artnet@1`.
- **Callbacks.** 1.x dropped the callback of a `set()` that hit the throttle and called the
  callback of an earlier `set()` again instead. Now every callback is called once, when its data
  was sent ([#28](https://github.com/hobbyquaker/artnet/issues/28)).
- **`close()`** sends the data that is still waiting for the throttle; 1.x discarded it, so the
  last values of a loop followed by `close()` never arrived.
- **`iface`** is used with every host, not only with `255.255.255.255`
  ([#22](https://github.com/hobbyquaker/artnet/issues/22)). If you passed an `iface` together with
  a unicast `host`, it was ignored up to now - make sure it really is an address of your machine.
- **Values** are rounded and limited to 0-255. 1.x let them wrap around: 256 became 0.
- **Out of range** channels (not 1-512) and universes (not 0-32767) are refused with `false` and a
  `RangeError` for the callback. 1.x sent malformed packets.
- **`trigger()`**: key 0 (KeyAscii) and OEM code 0 are sent as given, 1.x turned them into 255 and
  0xffff. The sub key defaults to 0 in every variant, 1.x used 1 if a callback was given.
- **After `close()`** the methods return `false` and report an error to the callback instead of
  throwing from inside the socket.

The complete list is in the [changelog](CHANGELOG.md).

## Further reading

- [Art-Net 4 protocol specification](https://art-net.org.uk/downloads/art-net.pdf)
- [OEM codes](https://art-net.org.uk/join-the-club/oem-code-listing/)

## License

MIT © 2014-2026 Sebastian Raff and [contributors](https://github.com/hobbyquaker/artnet/graphs/contributors)

## Credits

Art-Net™ Designed by and Copyright [Artistic Licence](https://artisticlicence.com/).

[mit-badge]: https://img.shields.io/badge/License-MIT-blue.svg?style=flat
[mit-url]: LICENSE

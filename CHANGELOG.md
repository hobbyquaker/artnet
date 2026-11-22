# Changelog

## 2.0.0 (2026-11-22)

A rewrite with the API of 1.x. Every way of calling the module that 1.x knew keeps working -
`require('artnet')(options)` without `new`, all argument variants of `set()` and `trigger()`,
methods detached from the instance, the `data` arrays. See "Upgrading from 1.x" in the README.

### Changed (breaking)

- ES module (`"type": "module"`, `exports`). `import Artnet from 'artnet'`; `require('artnet')`
  still returns the constructor via `require(esm)`. Requires Node.js ^20.19 || ^22.12 || >=24.
- `iface` is used with every host. 1.x bound the socket to it only if the host was
  `255.255.255.255` and ignored it otherwise (#22, #26, thanks @brunoimbrizi and @k-yle). With
  `iface` the source port is the Art-Net port.
- Values are rounded and limited to 0-255 instead of wrapping around (256 was sent as 0, -1 as 255).
- A channel outside 1-512 or a universe outside 0-32767 is refused: `set()` and `send()` return
  `false` and the callback gets a `RangeError`. 1.x sent packets with a wrong length or address.
  Values beyond channel 512 of an array are dropped.
- `trigger()`: key 0 (KeyAscii) and OEM code 0 are sent as given instead of being replaced by 255
  and 0xffff. The sub key defaults to 0 in every variant; `trigger(key, callback)` used 1.
- After `close()` the methods return `false` and report an error to the callback. 1.x threw
  `ERR_SOCKET_DGRAM_NOT_RUNNING` and kept its timers running.
- `setHost()` and `setPort()` throw on an unusable host or port instead of failing later.

### Fixed

- Every callback is called exactly once, when the packet carrying its data was sent. A `set()`
  that hit the 25 ms throttle lost its callback, and the callback of the `set()` before it was
  called a second time (#28).
- `close()` sends what is still waiting for the throttle before it closes the socket, and waits
  for the datagrams that are on their way. Values set right before `close()` were discarded (#28).
- A refresh (all 512 channels) that hit the throttle was sent as a short packet.
- `set(channel, null)` threw a `TypeError`.
- A channel given as string together with an array wrote to the wrong channels
  (`set('5', [1, 2])` set channel 50 and 51).
- `NaN` as value is ignored instead of being stored and sent as 0.
- `setHost()` with a broadcast address failed with `EACCES` if the instance was created with a
  unicast host.
- `close()` twice threw.
- A `set()` that changed nothing no longer starts the refresh timer of an untouched universe.
- If the socket cannot be bound, the callbacks waiting for it get the error and the timers stop.
  Before, they were never called.

### Added

- `localPort` option: the source port, for nodes that only accept packets from port 6454 (#22).
- `close(callback)` and a `close` event.
- Named export `Artnet`.
- TypeScript declarations.
- Examples: `examples/set.js`, `fade.js`, `trigger.js`, `commonjs.cjs`.

### Tooling

- Tests with `node:test` against a UDP socket on the loopback interface: 100 % line, branch and
  function coverage, enforced in CI. Type check of the declarations with `tsc`.
- eslint 10 and prettier replace xo; GitHub Actions (Node 20, 22, 24) replace Travis CI.
- Releases are published to npm by a GitHub workflow with provenance (trusted publishing).

## 1.4.0 (2018-01-27)

- ArtTrigger support: `trigger()` (#19, #20, thanks @jnovack).

## 1.3.3 (2017-06-22)

- Socket option `reuseAddr`, so that several instances can bind the Art-Net port (thanks @margau).

## 1.3.1, 1.3.2 (2017-06-18)

- Fixed broadcasting to a directed broadcast address (thanks @hibas123).
- Compatibility with old Node.js versions.

## 1.3.0 (2017-06-06)

- `setPort()` (thanks @maxjoehnk); the socket is only bound for broadcasts.

## 1.2.2, 1.2.3 (2017-05-26)

- `close()` clears the throttle timers (thanks @maxjoehnk).
- The `data` array is exposed.

## 1.2.0, 1.2.1 (2017-03-23)

- Socket errors are emitted as `error` event (thanks @maxjoehnk).

## 1.1.0 (2016-12-18)

- `sendAll` option (#10, thanks @martinzuern).

## 1.0.5 (2016-06-17)

- `setHost()` (thanks @solexious).

## 1.0.4 (2016-04-12)

- Fixed the calculation of the changed channels (thanks @martinzuern).

## 1.0.2, 1.0.3 (2015-11-25)

- Fixed the length of the ArtDmx packet (#5).

## 1.0.1 (2015-10-27)

- Several instances can be used at once (#3).

## 1.0.0 (2015-08-07)

- Universes, throttling to 40 Hz, refresh of unchanged data, short packets.

## 0.0.3 (2015-05-17)

- `iface` option (#1, thanks @sparks-alec).

## 0.0.1 (2014-08-18)

- First release.

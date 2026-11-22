# Agent rules - artnet

## What this is

`artnet` sends ArtDmx and ArtTrigger packets to Art-Net nodes. A library, one file
([lib/artnet.js](lib/artnet.js)) on top of `node:dgram`, no dependencies. It is a sender only: no
ArtPoll, no receiving, no RDM.

## Public API - do not break it

Third-party projects (ioBroker.artnet, mqtt-dmx-sequencer, mqtt-dmx-controller, synesthesia, vlight
and others) rely on all of the following; each has a test in [test/artnet.test.js](test/artnet.test.js):

- `require('artnet')` returns the constructor itself (the `'module.exports'` export), and it is
  callable without `new` (a Proxy around the class).
- Methods work detached from the instance (`setter: artnet.set`) - they are bound in the constructor.
- All argument variants of `set()` and `trigger()`; the callback is found by position.
- `artnet.data[universe]` is a plain array that is written in place. Consumers assign their own
  (empty, sparse) array to it and keep the reference.
- Sparse arrays, `null` and `undefined` in `set()` values mean "leave unchanged".
- Every callback is called exactly once, also when nothing changed (`(null, null)`) and when the
  call was collected by the throttle. ioBroker chains `set()` calls in callbacks.
- `set()` never throws and never emits `error` for bad input - nobody downstream has an `error`
  listener. Bad input: return `false`, error to the callback.
- Options are lenient: `undefined` means default, numbers may be strings, unknown keys are ignored.

## Practices

- Plain JavaScript, ES module, 4 spaces, eslint + prettier: `npm run lint`, `npm run lintfix`.
- `npm test` (node:test + `tsc` type check of [index.d.ts](index.d.ts)), `npm run test:coverage`
  (fails below 100 % lines, branches and functions - keep it there), `npm run test:package`
  (installs the packed tarball into an empty project, loads it with import and require).
- Tests talk to a real UDP socket on 127.0.0.1; only the socket setup (bind options, bind errors)
  uses a mocked `dgram.createSocket`. No test may need a broadcast or a fixed port.
- No runtime dependencies.
- Packet layouts follow the Art-Net 4 specification, <https://art-net.org.uk/downloads/art-net.pdf>.

## Releasing

Semver. Bump `version` in package.json, add the CHANGELOG section, commit, tag `vX.Y.Z`, push the
tag. [.github/workflows/release.yml](.github/workflows/release.yml) runs lint and all tests,
publishes to npm via trusted publishing (OIDC, with provenance) and creates the GitHub release from
[.github/release-notes.js](.github/release-notes.js) (CHANGELOG section + grouped commits).

Push tags one at a time, and do not re-run the release workflow for an old tag - `npm publish`
would move the `latest` dist-tag backwards.

## Roadmap

`ROADMAP.md` and `HANDOFF.md` in the repository root are local working files of the maintainer
(git-ignored). Read them if they exist; they are not part of the repository.

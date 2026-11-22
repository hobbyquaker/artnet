import dgram from 'node:dgram';
import {EventEmitter} from 'node:events';

// Art-Net 4 specification: https://art-net.org.uk/downloads/art-net.pdf
const ID = Buffer.from('Art-Net\0', 'latin1');
const PROTOCOL_VERSION = 14;
const OP_DMX = 0x5000;
const OP_TRIGGER = 0x9900;

const CHANNELS = 512;
const MAX_UNIVERSE = 0x7fff; // 15 bit port address: net (7), sub-net (4), universe (4)
const TRIGGER_PAYLOAD = 512;
const THROTTLE = 25; // ms between two ArtDmx packets of one universe (~40 Hz, the DMX512 frame rate)

const DEFAULT_HOST = '255.255.255.255';
const DEFAULT_PORT = 6454;
const DEFAULT_REFRESH = 4000;

// As in 1.x numbers may arrive as strings ("6454"); anything unusable yields the fallback.
function int(value, fallback) {
    const n = Number.parseInt(value, 10);
    return Number.isNaN(n) ? fallback : n;
}

function isPort(n) {
    return Number.isInteger(n) && n >= 0 && n <= 65535;
}

function isList(value) {
    return value !== null && typeof value === 'object' && typeof value.length === 'number';
}

// The last of four arguments is the callback, as is a trailing function after at least one other argument.
function takeCallback(args) {
    if (args.length === 4 || (args.length > 1 && typeof args.at(-1) === 'function')) {
        const callback = args.pop();
        if (typeof callback === 'function') return callback;
    }
    return undefined;
}

function packet(opCode, length) {
    const buf = Buffer.alloc(length);
    ID.copy(buf);
    buf.writeUInt16LE(opCode, 8);
    buf.writeUInt16BE(PROTOCOL_VERSION, 10);
    return buf;
}

function blankUniverse() {
    return new Array(CHANNELS).fill(null);
}

class Artnet extends EventEmitter {
    /** Channel values per universe: `data[universe][channel - 1]`, `null` until a channel is set. */
    data = [];

    #socket;
    #host;
    #port;
    #refresh;
    #sendAll;

    #bound = false;
    #closed = false; // close() was called or the socket could not be bound
    #closing = false; // the socket was told to close
    #finished = false; // the socket is closed
    #inflight = 0; // datagrams handed to the socket that have not called back yet
    #outbox = []; // datagrams created before the socket was bound
    #universes = new Map();

    constructor(config = {}) {
        super();
        // `config || {}` as in 1.x, null is accepted too
        config = config || {};

        this.#host = config.host || DEFAULT_HOST;
        this.#port = int(config.port, 0) || DEFAULT_PORT;
        this.#refresh = int(config.refresh, 0) || DEFAULT_REFRESH;
        this.#sendAll = Boolean(config.sendAll);

        // 1.x methods were closures: `setter: artnet.set` has to keep working
        for (const method of ['set', 'send', 'trigger', 'sendTrigger', 'close', 'setHost', 'setPort']) {
            this[method] = this[method].bind(this);
        }

        const socket = dgram.createSocket({type: 'udp4', reuseAddr: true});
        this.#socket = socket;

        socket.on('error', (err) => {
            if (!this.#bound) this.#fail(err);
            this.emit('error', err);
        });
        socket.on('close', () => {
            this.#finished = true;
            this.emit('close');
        });

        // Art-Net nodes may only accept packets coming from the Art-Net port, and a broadcast needs a
        // bound socket. A plain unicast host keeps the random source port it always had, unless asked.
        const fixedSource = Boolean(config.iface) || /255$/.test(this.#host);
        const localPort = int(config.localPort, fixedSource ? this.#port : 0);
        const bind = {port: localPort, exclusive: localPort === 0};
        if (config.iface) bind.address = config.iface;

        socket.bind(bind, () => {
            this.#bound = true;
            // always on, so setHost() may switch to a broadcast address later
            socket.setBroadcast(true);
            for (const [buf, callbacks] of this.#outbox.splice(0)) this.#transmit(buf, callbacks);
        });
    }

    /**
     * set([[universe,] channel,] value|values [, callback])
     * Channels count from 1. Returns false if the arguments are unusable.
     */
    set(...args) {
        const callback = takeCallback(args);
        if (args.length === 0 || args.length > 3) return false;

        const value = args.pop();
        const channel = args.length > 0 ? int(args.pop(), Number.NaN) : 1;
        const universe = this.#universe(args.pop());

        if (this.#closed) return this.#reject(callback, new Error('Art-Net socket is closed'));
        if (universe === undefined) {
            return this.#reject(callback, new RangeError('universe must be in the range 0-' + MAX_UNIVERSE));
        }
        if (!(channel >= 1 && channel <= CHANNELS)) {
            return this.#reject(callback, new RangeError('channel must be in the range 1-' + CHANNELS));
        }

        const state = this.#state(universe);
        const data = this.#data(universe);
        const values = isList(value) ? value : [value];

        // values beyond channel 512 are dropped
        const count = Math.min(values.length, CHANNELS - channel + 1);
        for (let i = 0; i < count; i++) {
            let v = values[i];
            // null, undefined and anything that is not a number leave the channel unchanged
            if (typeof v !== 'number' || Number.isNaN(v)) continue;
            v = Math.min(255, Math.max(0, Math.round(v)));
            const index = channel - 1 + i;
            if (data[index] !== v) {
                data[index] = v;
                if (index + 1 > state.changed) state.changed = index + 1;
            }
        }

        if (state.changed > 0) {
            this.#send(universe, false, callback);
        } else if (callback) {
            callback(null, null);
        }

        return true;
    }

    /**
     * send(universe [, refresh] [, callback])
     * Sends the current values of a universe: all 512 channels if refresh is truthy, otherwise
     * channel 1 up to the highest channel changed since the last packet.
     */
    send(universe, refresh, callback) {
        if (typeof refresh === 'function') {
            callback = refresh;
            refresh = false;
        }

        const u = this.#universe(universe);
        if (this.#closed) return this.#reject(callback, new Error('Art-Net socket is closed'));
        if (u === undefined) {
            return this.#reject(callback, new RangeError('universe must be in the range 0-' + MAX_UNIVERSE));
        }

        this.#send(u, Boolean(refresh), callback);
        return true;
    }

    /**
     * trigger([[oem,] subkey,] key [, callback])
     * Sends an ArtTrigger packet. Never throttled.
     */
    trigger(...args) {
        const callback = takeCallback(args);
        if (args.length === 0 || args.length > 3) return false;

        const key = int(args.pop(), 255);
        const subkey = int(args.pop(), 0);
        const oem = int(args.pop(), 0xffff); // 0xffff addresses every node

        return this.sendTrigger(oem, key, subkey, callback);
    }

    /** sendTrigger(oem, key, subkey [, callback]) - trigger() without the optional arguments. */
    sendTrigger(oem, key, subkey, callback) {
        if (this.#closed) return this.#reject(callback, new Error('Art-Net socket is closed'));

        const buf = packet(OP_TRIGGER, 18 + TRIGGER_PAYLOAD);
        // 12, 13: filler
        buf.writeUInt16BE(oem & 0xffff, 14);
        buf[16] = key;
        buf[17] = subkey;
        // 18-529: payload, its meaning is defined by the key - unused, all zero

        this.#transmit(buf, typeof callback === 'function' ? [callback] : []);
        return true;
    }

    /**
     * close([callback])
     * Stops the refresh, sends what is still waiting for the throttle and closes the socket.
     */
    close(callback) {
        if (typeof callback === 'function') {
            if (this.#finished) process.nextTick(callback);
            else this.once('close', callback);
        }
        if (this.#closed) return;
        this.#closed = true;

        this.#stopTimers();
        for (const [universe, state] of this.#universes) {
            if (state.pending) this.#flush(universe, state);
        }

        this.#settle();
    }

    setHost(host) {
        if (typeof host !== 'string' || host === '') throw new TypeError('host must be a non-empty string');
        this.#host = host;
    }

    setPort(port) {
        if (this.#host === DEFAULT_HOST) {
            throw new Error("Can't change port when using broadcast address 255.255.255.255");
        }
        const p = int(port, Number.NaN);
        if (!isPort(p) || p === 0) throw new RangeError('port must be in the range 1-65535');
        this.#port = p;
    }

    #universe(value) {
        const universe = int(value, 0);
        return universe >= 0 && universe <= MAX_UNIVERSE ? universe : undefined;
    }

    #reject(callback, err) {
        if (typeof callback === 'function') callback(err);
        return false;
    }

    #data(universe) {
        if (!isList(this.data[universe])) this.data[universe] = blankUniverse();
        return this.data[universe];
    }

    #state(universe) {
        let state = this.#universes.get(universe);
        if (!state) {
            state = {
                changed: 0, // highest channel number changed since the last packet
                refresh: false, // the next packet has to carry all 512 channels
                callbacks: [], // callbacks waiting for the next packet
                throttle: null, // timer, set while the universe must not send
                pending: false, // a packet is waiting for the throttle
                interval: null, // the refresh timer, running from the first packet on
            };
            this.#universes.set(universe, state);
        }
        return state;
    }

    #send(universe, refresh, callback) {
        const state = this.#state(universe);
        if (refresh) state.refresh = true;
        if (typeof callback === 'function') state.callbacks.push(callback);

        if (state.throttle) {
            state.pending = true;
            return;
        }

        state.interval ??= setInterval(() => this.#send(universe, true), this.#refresh);

        this.#flush(universe, state);
        state.throttle = setTimeout(() => {
            state.throttle = null;
            if (state.pending) this.#send(universe);
        }, THROTTLE);
    }

    // one ArtDmx packet with the current values; it answers every callback collected since the last one
    #flush(universe, state) {
        const data = this.#data(universe);

        // the length has to be even, 2 at least
        let length = state.refresh || this.#sendAll ? CHANNELS : Math.max(state.changed, 2);
        length += length % 2;

        const buf = packet(OP_DMX, 18 + length);
        // 12: sequence (0 = not used), 13: physical input port (informative only)
        buf.writeUInt16LE(universe, 14); // SubUni, Net
        buf.writeUInt16BE(length, 16);
        for (let i = 0; i < length; i++) buf[18 + i] = data[i];

        state.changed = 0;
        state.refresh = false;
        state.pending = false;
        this.#transmit(buf, state.callbacks.splice(0));
    }

    #transmit(buf, callbacks) {
        if (!this.#bound) {
            this.#outbox.push([buf, callbacks]);
            return;
        }
        this.#inflight++;
        this.#socket.send(buf, this.#port, this.#host, (err, bytes) => {
            this.#inflight--;
            for (const callback of callbacks) callback(err, bytes);
            this.#settle();
        });
    }

    // close the socket once close() was called and every datagram is out
    #settle() {
        if (this.#closed && !this.#closing && this.#inflight === 0 && this.#outbox.length === 0) {
            this.#closing = true;
            this.#socket.close();
        }
    }

    #stopTimers() {
        for (const state of this.#universes.values()) {
            clearInterval(state.interval);
            clearTimeout(state.throttle);
            state.throttle = null;
        }
    }

    // the socket could not be bound: nothing will ever be sent
    #fail(err) {
        this.#closed = true;
        this.#stopTimers();
        for (const [, callbacks] of this.#outbox.splice(0)) {
            for (const callback of callbacks) callback(err);
        }
        this.#settle();
    }
}

// 1.x was a constructor function that also worked without `new`: require('artnet')(options)
const Callable = new Proxy(Artnet, {
    apply: (target, thisArg, args) => new target(...args),
});

export default Callable;
export {Callable as Artnet, Callable as 'module.exports'};

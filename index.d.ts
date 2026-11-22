import {EventEmitter} from 'node:events';

declare namespace Artnet {
    interface Options {
        /** Hostname or IP address of the Art-Net node, default `'255.255.255.255'` (limited broadcast). */
        host?: string;
        /** Art-Net UDP port, default `6454`. */
        port?: number | string;
        /** Interval in ms for re-sending unchanged universes with all 512 channels, default `4000`. */
        refresh?: number | string;
        /** IP address of the local network interface to bind the socket to. */
        iface?: string;
        /** Always send all 512 channels instead of channel 1 up to the last changed one, default `false`. */
        sendAll?: boolean;
        /**
         * Local (source) UDP port. Default: `port` if the host is a broadcast address or `iface` is
         * set, otherwise a random port.
         */
        localPort?: number | string;
    }

    /**
     * `bytes` is the size of the UDP datagram that carried the change. `set()` calls back with
     * `(null, null)` if nothing changed and therefore nothing was sent.
     */
    type Callback = (err: Error | null, bytes?: number | null) => void;

    /** A channel value 0-255. `null` and `undefined` leave the channel unchanged. */
    type Value = number | null | undefined;
    type Values = ArrayLike<Value>;
}

interface Artnet extends EventEmitter {
    /** The channel values per universe: `data[universe][channel - 1]`, `null` until a channel was set. */
    data: Array<Array<number | null>>;

    /** Set channel 1 (and the following ones, if an array is given) of universe 0. */
    set(value: Artnet.Value | Artnet.Values, callback?: Artnet.Callback): boolean;
    /** Set a channel (1-512) of universe 0, or the channels from there on if an array is given. */
    set(channel: number, value: Artnet.Value | Artnet.Values, callback?: Artnet.Callback): boolean;
    /** Set a channel (1-512) of a universe (0-32767), or the channels from there on if an array is given. */
    set(universe: number, channel: number, value: Artnet.Value | Artnet.Values, callback?: Artnet.Callback): boolean;

    /** Send the current values of a universe: channel 1 up to the highest channel changed since the last packet. */
    send(universe: number, callback?: Artnet.Callback): boolean;
    /** Send the current values of a universe, all 512 channels if `refresh` is true. */
    send(universe: number, refresh: boolean, callback?: Artnet.Callback): boolean;

    /** Send an ArtTrigger with sub key 0 to all nodes. */
    trigger(key: number, callback?: Artnet.Callback): boolean;
    /** Send an ArtTrigger to all nodes. */
    trigger(subkey: number, key: number, callback?: Artnet.Callback): boolean;
    /** Send an ArtTrigger to the nodes of one manufacturer (`0xffff`: all). */
    trigger(oem: number, subkey: number, key: number, callback?: Artnet.Callback): boolean;

    /** `trigger()` with a fixed argument order. */
    sendTrigger(oem: number, key: number, subkey: number, callback?: Artnet.Callback): boolean;

    /** Stop the refresh, send what is still waiting for the throttle, close the socket. */
    close(callback?: () => void): void;

    /** Change the Art-Net node. */
    setHost(host: string): void;
    /** Change the Art-Net port. Throws while the host is `255.255.255.255`. */
    setPort(port: number | string): void;

    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
    once(event: 'close', listener: () => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
}

interface ArtnetConstructor {
    new (options?: Artnet.Options | null): Artnet;
    /** As in 1.x the constructor works without `new`. */
    (options?: Artnet.Options | null): Artnet;
    readonly prototype: Artnet;
}

declare const Artnet: ArtnetConstructor;

export default Artnet;
export {Artnet};

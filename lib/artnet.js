var dgram = require('dgram');

var Artnet = function (config) {

    if (!(this instanceof Artnet)) return new Artnet(config);

    var that = this;

    config = config || {};

    var host =     config.host                    || '255.255.255.255';
    var port =     parseInt(config.port)          || 6454;
    var refresh =  parseInt(config.refresh)       || 4000;

    var socket = dgram.createSocket("udp4");

    if (config.iface) {
        socket.bind(port, config.iface);
    }

    // index of the following arrays is the universe
    var data =          [];     // the 512 dmx channels
    var interval =      [];     // the intervals for the 4sec refresh
    var sendThrottle =  [];     // the timeouts
    var sendDelayed =   [];     // boolean flag indicating if data should be sent after sendThrottle timeout
    var dataChanged =   [];     // the highest channel number that had a change. mind that channel counting starts at 1!

    var startRefresh = function (universe) {
        interval[universe] = setInterval(function () {
            that.send(universe, 512);
        }, refresh);
    };

    // see http://www.artisticlicence.com/WebSiteMaster/User%20Guides/art-net.pdf page 45
    var artdmxPackage = function (universe, length) {

        length = parseInt(length, 10) || 2;
        if (length % 2) length += 1;


        var hUni = (universe >> 8) & 0xff;
        var lUni = universe & 0xff;
        
        var hLen = (length >> 8) & 0xff;
        var lLen = (length & 0xff);

        var header =   [65, 114, 116, 45, 78, 101, 116, 0, 0, 80, 0, 14, 0, 0, lUni, hUni, hLen, lLen];

        if (!data[universe]) data[universe] = Array.apply(null, new Array(512)).map(function () { return null; }, 0);
        return new Buffer(header.concat(data[universe].slice(0, (hLen * 256) + lLen)));

    };

    // if refresh is set to true all 512 channels will be sent, otherwise from channel 1 to the last changed channel
    this.send = function (universe, refresh, callback) {
        if (typeof refresh === 'function') {
            callback = refresh;
            refresh = false;
        }

        if (!interval[universe]) startRefresh(universe);

        if (sendThrottle[universe]) {
            sendDelayed[universe] = true;
            return;
        }

        clearTimeout(sendThrottle[universe]);
        sendThrottle[universe] = setTimeout(function () {
            sendThrottle[universe] = null;
            if (sendDelayed[universe]) {
                sendDelayed[universe] = false;
                that.send(universe, callback);
            }
        }, 25);

        var buf = artdmxPackage(universe, refresh ? 512 : dataChanged[universe]);
        dataChanged[universe] = 0;
        socket.send(buf, 0, buf.length, port, host, callback);
    };

    /* [ [ uint15 universe, ] uint9 channel, ] uint8 value [, function callback ] */
    /* [ [ uint15 universe, ] uint9 channel, ] array[uint8] values [, function callback ] */
    this.set = function () {

        var universe;
        var channel;
        var value;
        var callback;

        if (arguments.length === 4) {
            universe =      arguments[0];
            channel =       arguments[1];
            value =         arguments[2];
            callback =      arguments[3];
        } else if (arguments.length === 3) {
            if (typeof arguments[2] === 'function') {
                channel =   arguments[0];
                value =     arguments[1];
                callback =  arguments[2];
            } else {
                universe =  arguments[0];
                channel =   arguments[1];
                value =     arguments[2];
            }
        } else if (arguments.length === 2) {
            if (typeof arguments[1] === 'function') {
                channel =   1;
                value =     arguments[0];
                callback =  arguments[1];
            } else {
                channel =   arguments[0];
                value =     arguments[1];
            }
        } else if (arguments.length === 1) {
            channel =       1;
            value =         arguments[0];
        } else {
            return false;
        }


        universe = parseInt(universe, 10) || 0;

        //console.log('set universe=' + universe, 'channel=' + channel, 'value=' + value, 'typeof callback=' + typeof callback);

        if (!data[universe]) data[universe] = Array.apply(null, new Array(512)).map(function () { return null; }, 0);

        dataChanged[universe] = dataChanged[universe] || 0;

        var index;
        if (typeof value === 'object' && value.length) {
            for (var i = 0; i < value.length; i++) {
                index = channel + i - 1;
                if (typeof value[i] === 'number' && data[universe][index] !== value[i]) {
                    data[universe][index] = value[i];
                    if ((i + 1) > dataChanged[universe]) dataChanged[universe] = i + 1;
                }
            }
        } else {
            if (typeof value === 'number' && data[universe][channel - 1] !== value) {
                data[universe][channel - 1] = value;
                if (channel > dataChanged[universe]) dataChanged[universe] = channel;
            }
        }

        if (dataChanged[universe]) {
            that.send(universe, callback);
        } else {
            if (typeof callback === 'function') callback(null, null);
        }

        return true;
    };

    this.close = function () {
        for (var i = 0; i < interval.length; i++)
        clearInterval(interval[i]);
        socket.close();
    };


};

module.exports = Artnet;

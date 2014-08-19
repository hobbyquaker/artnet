var dgram = require('dgram');

var Artnet = function () {
    if (!(this instanceof Artnet)) {
        return new Artnet();
    }
};

Artnet.prototype.connect = function (host, port, universe, refresh) {

    this.host =     host                    || '255.255.255.255';
    this.port =     port                    || 6454;
    this.universe = parseInt(universe, 10)  || 0;
    this.refresh =  refresh                 || 0;

    this.header =   [65, 114, 116, 45, 78, 101, 116, 0, 0, 80, 0, 14, 0, 0, this.universe, 0, 2, 0];
    this.data =     Array.apply(null, new Array(512)).map(Number.prototype.valueOf, 0);

    this.socket = dgram.createSocket("udp4");

    if (this.refresh >= 50) {
        this.interval = setInterval(function (_this) {
            _this.send();
        }, this.refresh, this);
    }

};

Artnet.prototype.close = function () {
    clearInterval(this.interval);
    this.socket.close();
};

Artnet.prototype.send = function (callback) {
    var data = this.header.concat(this.data);
    var buf = new Buffer(data);
    this.socket.send(buf, 0, buf.length, this.port, this.host, function () {
        if (typeof callback === 'function') callback();
    });
};

Artnet.prototype.set = function (channel, value, callback) {
    if (value instanceof Array) {
        for (var i = 0; i < value.length; i++) {
            this.data[channel + i - 1] = value[i];
        }
    } else if (typeof channel === 'object') {
        for (var key in channel) {
            var id = parseInt(key, 10) - 1;
            this.data[id] = channel[key];
        }
        if (typeof value === 'function') callback = value;
    } else {
        this.data[channel - 1] = value;
    }
    if (callback !== false) this.send(callback);
};

module.exports = Artnet();

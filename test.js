var artnet = require('./lib/artnet.js')();

var c = 0;
setInterval(function () {

    if (++c > 255) c = 0;
    console.log('sending ' + c + ' to all channels in all universes');
    for (var i = 0; i < 8; i++) {
        (function (_i, _c) {

            artnet.set(_i, 1, Array.apply(null, new Array(512)).map(function () { return _c; }, 0), function (err, res) {
                if (err) {
                    console.error('error sending to universe ' + i, err);
                } else if (res === 530) {
                    console.log('sent ' + _c + ' to all channels in universe ' + _i);
                } else {
                    console.error('error sending to universe ' + _i + ': only ' + res + ' bytes where sent');
                }
            });

        })(i, c);

    }

}, 40);

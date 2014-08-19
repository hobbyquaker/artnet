# artnet

[![NPM version](https://badge.fury.io/js/artnet.svg)](http://badge.fury.io/js/artnet)

This is a [Node.js](http://nodejs.org) module that can be used to send commands to an [Art-Net](http://en.wikipedia.org/wiki/Art-Net) node.

## Usage

connect, set channel 1 to 255, disconnect.
```javascript
var artnet = require('artnet');

artnet.connect('172.16.23.15');

artnet.set(1, 255, function () {
    artnet.close();
});

```

The set method can set multiple channels at once:

Use an array to set subsequent channels...
```javascript
// set channel 100 to 10, channel 101 to 20 and channel 102 to 30
artnet.set(100, [10, 20, 30]); 
```

...or use an object to set multiple channels.
```javascript
// set channel 100 to 255 and channel 200 to 127
artnet.set({100: 255, 200: 127}); 
```


## Methods

* **connect( host, port, universe, interval )**
  * port (default ```6454```)
  * universe (default ```0```)
  * interval (if a number >= 50 is set, data will be send to the Art-Net node in given microsecond intervals)

* **set( )**
  * **set(** *number* **channel,** *number* **value,** *function* **callback )**
  * **set(** *number* **channel,** *array* **values,** *function* **callback )**
  * **set(** *object* **channelvalues,** *function* **callback )**    

if callback is set to boolean ```false``` data will only be written to the internal buffer without sending. This makes sense if you wanna make sure that multiple set commands are sent simultaneously or if you're using the interval option.

* **send( callback )**    
sends buffered data to the Art-Net node. callback is called with no arguments.

* **close( )**    
closes the connection


# Further Reading

* [Art-Net protocol specification](http://www.artisticlicence.com/WebSiteMaster/User%20Guides/art-net.pdf)


# License

Copyright (c) 2014 hobbyquaker <hq@ccu.io>

[MIT License](LICENSE)

#### Credits

Art-Net™ Designed by and Copyright [Artistic Licence Holdings Ltd](http://www.artisticlicence.com/).


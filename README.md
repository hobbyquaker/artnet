# artnet

[![NPM version](https://badge.fury.io/js/artnet.svg)](http://badge.fury.io/js/artnet)
[![Dependency Status](https://img.shields.io/gemnasium/hobbyquaker/artnet.svg?maxAge=2592000)](https://gemnasium.com/github.com/hobbyquaker/artnet)
[![Build Status](https://travis-ci.org/hobbyquaker/artnet.svg?branch=master)](https://travis-ci.org/hobbyquaker/artnet)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![License][mit-badge]][mit-url]

> This is a [Node.js](http://nodejs.org) module that can be used to send ArtDMX packages to an [Art-Net](http://en.wikipedia.org/wiki/Art-Net) node.

## Usage

connect, set channel 1 to 255, disconnect.
```javascript
var options = {
    host: '172.16.23.15'
}

var artnet = require('artnet')(options);

// set channel 1 to 255 and disconnect afterwards.
artnet.set(1, 255, function (err, res) {
    artnet.close();
});
```

The set method can set multiple channels at once:

Use an array to set subsequent channels...
```javascript
// set channel 100 to 10, channel 101 to 20 and channel 102 to 30
artnet.set(100, [10, 20, 30]);
```

...if you want to keep certain channels unchanged set them to null
```javascript
// set channel 50 to 255 and channel 52 to 127
artnet.set(50, [255, null, 127]);
```

you can omit the channel, it defaults to 1
```javascript
// Set channel 1 to 255 and channel 2 to 127:
artnet.set([255, 127]);
```

Additionally, you can send trigger macros to devices.

```javascript
// Send key 3, subkey 1 to all devices.
artnet.trigger(1, 3);

// Send key 2, subkey 71 (the letter 'G') to ArtNet Devices responding to 0x6A6B.
artnet.trigger(27243, 71, 2);
```

This lib throttles the maximum send rate to ~40Hz. Unchanged data is refreshed every ~4s.

## Options

  * host (Default ```"255.255.255.255"```)
  * port (Default ```6454```)
  * refresh (millisecond interval for sending unchanged data to the Art-Net node. Default ```4000```)
  * iface (optional string IP address - bind udp socket to specific network interface)
  * sendAll (sends always the full DMX universe instead of only changed values. Default ```false```)


## Methods

#### **set(** [ [ *uint15* **universe** , ] *uint9* **channel** , ] *uint8* **value** [ , *function(err, res)* **callback** ] **)**
#### **set(** [ [ *uint15* **universe** , ] *uint9* **channel** , ] *array[uint8]* **values** [ , *function(err, res)* **callback** ] **)**


Every parameter except the value(s) is optional. If you supply a universe you need to supply the channel also.
Defaults: universe = 0, channel = 1

Callback is called with (error, response) params.
If error and response are null data remained unchanged and therefore nothing has been sent.

#### **trigger(** [ [ *uint15* **oem** , ] *uint9* **subkey** , ] *uint8* **key** [ , *function(err, res)* **callback** ] **)**

Sends an ArtNet ArtTrigger packet. ArtTriggers are typically device specific and perform functions like starting and stopping shows.

Every parameter except the `key` is optional.  If you supply an `oem`, you need to supply a `subkey` also.

Defaults:

* `oem` = `0xFFFF`
* `subkey` = `null`

Callback is called with `(error, response)` params.

`trigger`s are NEVER throttled, as they are time sensitive. They are always sent immediately upon processing.

#### **close( )**

Closes the connection and stops the send interval.


#### **setHost(** *string* **host** **)**

Change the Art-Net hostname/address after initialization

#### **setPort(** *number* **port** **)**

Change the Art-Net port after initialization.
Does not work when using the broadcast address `255.255.255.255`.

# Further Reading

* [Art-Net protocol specification](http://www.artisticlicence.com/WebSiteMaster/User%20Guides/art-net.pdf)


# License

The MIT License (MIT)

Copyright (c) 2014-2017 Sebastian Raff and Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## Credits

Art-Net™ Designed by and Copyright [Artistic Licence Holdings Ltd](http://www.artisticlicence.com/).


[mit-badge]: https://img.shields.io/badge/License-MIT-blue.svg?style=flat
[mit-url]: LICENSE

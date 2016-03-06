'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var mdns = require('mdns');
var requireFu = require('require-fu');
var express = require('express');
var request = require('request');

var discovery = require('./discovery');
// BasePaths should *NOT* include a trailing '/'
var stServerBasePath = 'http://127.0.0.1:5006';
var bridgeBasePath = 'http://alexabridge.zwrose.com';
var bridgeID = 1;
var counter = 0;

var server = this;

var webroot = path.resolve(__dirname, 'static');

//Settings
var settings = {
    port: 5006,
    cacheDir: './cache',
    webroot: webroot,
    packagesDir: __dirname + '/package'
};

// load user settings
try {
    var userSettings = require(path.resolve(__dirname, 'settings.json'));
} catch (e) {
    console.log('No settings file found, will only use default settings');
}

if (userSettings) {
    for (var i in userSettings) {
        settings[i] = userSettings[i];
    }
}

// Create webroot + tts if not exist
if (!fs.existsSync(webroot)) {
    fs.mkdirSync(webroot);
}
if (!fs.existsSync(webroot + '/tts/')) {
    fs.mkdirSync(webroot + '/tts/');
}

var app = express();
var api = this;

// this handles registering of all actions
var services = [];
this.registerRestService = function (action, handler) {
    console.log("Registered:  " + action);
    services.push(action);
    app.get(action, function (req, res) {
        var json = "";

        //TODO: check if handler is known

        json = handler(discovery, req, res);

        if (json === false) {
            res.status(500).json({ message: 'error' });
        } else if (json === true)  {
            res.json({ message: 'success' });
        }
    });
};

this.registerDeviceRestService = function (action, handler) {
    action = '/:deviceName' + action;
    console.log("Registered:  " + action);
    services.push(action);
    app.get(action, function (req, res) {
        var json = "";

        var deviceName = req.params.deviceName;
        var device = discovery.getDevice(deviceName);

        if (device == undefined) {
            res.json({message:'No Device found with name ' + deviceName});
            return;
        }

        //TODO: check if handler is known

        json = handler(device, req, res);

        if (json === false) {
            res.status(500).json({ message: 'error' });
        } else if (json === true)  {
            res.json({ message: 'success' });
        }
    });
};

this.registerServerRestService = function (action, handler) {
    console.log("Registered:  " + action);
    services.push(action);
    app.get(action, function (req, res) {
        var json = "";

        //TODO: check if handler is known

        json = handler(server, req, res);

        if (json === false) {
            res.status(500).json({ message: 'error' });
        } else if (json === true)  {
            res.json({ message: 'success' });
        }
    });
};

this.getRegisteredServices = function() {
    return services;
};

//load packages
requireFu(settings.packagesDir)(this);

//TODO
//app.use(express.static('public'));
//app.use(express.static('files'));
app.use(express.static('static'));

var httpServer = http.createServer(app);

httpServer.listen(settings.port, function () {
    var port = httpServer.address().port;
    console.log('HTTP REST server listening on port', port);
    alexaSync();
});


discovery.search();

///////////////////////////

function alexaSync() {
    handleKeys();
    if(counter == 5) {
        updateHomeState();
        counter = 0;
    }
    counter += 1;
    setTimeout(alexaSync, 1000);
};

function updateHomeState() {
    // get home state from local server, and put to bridge with id
    getBoseHomeState(function(homeStateGenerated) {
        var postOptions = {
            'uri': bridgeBasePath + "/api/homeStates",
            'method': 'PUT',
            'body': {
                'currentState': homeStateGenerated,
                'id': bridgeID
            },
            'json': true
        };
        request(postOptions, function (error, response, body) {
            if (error) {
                console.log("Error:", error)
            } else {
                var currentdate = new Date();
                console.log("Updater has run. Synced: " + (currentdate.getMonth()+1)  + "/" 
                + currentdate.getDate() + "/"
                + currentdate.getFullYear() + " @ "  
                + currentdate.getHours() + ":"  
                + currentdate.getMinutes() + ":" 
                + currentdate.getSeconds());
                
            }
        });
    });
}

function getBoseHomeState(boseCallback) {
    var homeState = {
        speakers: {},
        zonesPlaying: []
    };

    // go get the list of speakers from the server
    http.get(stServerBasePath + '/device/listAdvanced', function(res) {
        var listBody = '';
        res.on('data', function(chunk) {listBody += chunk;});
        res.on('end', function() {JSON.parse(listBody).forEach(function(element, index, array) {

            // got get now playing info
            http.get(stServerBasePath + '/' + encodeURIComponent(element.name) + '/nowPlaying', function(res) {
                var nowPlayingBody = '';
                res.on('data', function(chunk) {nowPlayingBody += chunk;});
                res.on('end', function() {
                    var nowPlaying = JSON.parse(nowPlayingBody).nowPlaying;

                http.get(stServerBasePath + '/' + encodeURIComponent(element.name) + '/volume', function(res) {
                    var volumeBody = '';
                    res.on('data', function(chunk) {volumeBody += chunk;});
                    res.on('end', function() {
                        var volumeObj = JSON.parse(volumeBody);
                        var currentVolume = volumeObj.volume.actualvolume;

                        // go get zone info
                        http.get(stServerBasePath + '/' + encodeURIComponent(element.name) + '/getZone', function(res) {
                            var zoneBody = '';
                            res.on('data', function(chunk) {zoneBody += chunk;});
                            res.on('end', function() {
                                var zoneInfo = JSON.parse(zoneBody).zone;

                                // get the device names into the array
                                homeState.speakers[element.name.toLowerCase()] = element;
                                
                                // add volume
                                homeState.speakers[element.name.toLowerCase()].currentVolume = currentVolume;

                                // check for now playing
                                if (nowPlaying.source != 'STANDBY') {
                                    homeState.speakers[element.name.toLowerCase()].nowPlaying = nowPlaying;

                                    // check if master
                                    if (!zoneInfo.master || zoneInfo.master == element.mac_address){
                                        homeState.zonesPlaying.push(element.name.toLowerCase());
                                        if(zoneInfo.master == element.mac_address) {
                                            homeState.speakers[element.name.toLowerCase()].isMaster = true;
                                        }
                                    }
                                }
                                // ensure all speakers are discovered before proceeding
                                if(Object.keys(homeState.speakers).length === array.length){
                                    // console.log("Current State of the User's Home:", homeState);
                                    boseCallback(homeState);
                                };

                            });
                        }).on('error', function(e) {
                            console.log("Got error: " + e.message);
                        });
                    });
                }).on('error', function(e) {
                    console.log("Got error: " + e.message);
                });
                });
            }).on('error', function(e) {
                console.log("Got error: " + e.message);
            });
        });
        });
    }).on('error', function(e) {
        console.log("Got error: " + e.message);
    });
}
function handleKeys() {
    request({
        'uri': bridgeBasePath + "/api/homeKeys/" + bridgeID,
        'method': 'GET',
        'json': true
    }, function (error, response, body) {
        if (error) {
            console.log("Error:", error)
        } else {
            console.log(body);
            var keyStack = body.keyStack;
            if(keyStack.length > 0) {
                request({
                    'uri': stServerBasePath + keyStack[0],
                    'method': 'GET',
                    'json': true
                }, function (error, response, body) {
                    if (error) {
                        console.log("Error:", error)
                    } else {
                        var currentdate = new Date(); 
                        console.log("Called " + stServerBasePath + keyStack[0] + ". Sent: " + (currentdate.getMonth()+1)  + "/" 
                                    + currentdate.getDate() + "/"
                                    + currentdate.getFullYear() + " @ "  
                                    + currentdate.getHours() + ":"  
                                    + currentdate.getMinutes() + ":" 
                                    + currentdate.getSeconds());
                        
                        // TODO need to shift on the server
                        request({
                            'uri': bridgeBasePath + '/api/homeKeys/shiftStack?bridgeID=' + bridgeID,
                            'method': 'GET',
                            'json': true
                        }, function (error, response, body) {
                            if (error) {
                                console.log("Error:", error)
                            } else {
                                console.log("server shifted.");
                            }
                        });
                    }
                });
                
            } else {
                var currentdate = new Date(); 
                console.log("No keys found. Checked: " + (currentdate.getMonth()+1)  + "/" 
                            + currentdate.getDate() + "/"
                            + currentdate.getFullYear() + " @ "  
                            + currentdate.getHours() + ":"  
                            + currentdate.getMinutes() + ":" 
                            + currentdate.getSeconds());
            }
        }
    });
}
var request = require('request');

// config vars
// BasePaths should *NOT* include a trailing '/'
var stServerBasePath = 'http://127.0.0.1:5006';
var bridgeBasePath = 'http://alexabridge.zwrose.com';
var bridgeID = 1;

// functions
var keymgr = function() {
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
                                setTimeout(keymgr, 1000);
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
                setTimeout(handleKeys, 1000);
            }
        }
    });
}
module.exports = new keymgr();
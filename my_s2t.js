//. my_s2t.js
var s2tv1 = require( 'ibm-watson/speech-to-text/v1' );
var { IamAuthenticator } = require( 'ibm-watson/auth' );

var settings = require( './settings' );

exports.s2t = new s2tv1({
  //version: '2021-08-01',
  authenticator: new IamAuthenticator({
    apikey: settings.s2t_apiKey
  }),
  serviceUrl: settings.s2t_url
});


//. s2t.js
var fs = require( 'fs' );
var my = require( './my_s2t' );
var settings = require( './settings' );

if( process.argv.length < 2 ){
  console.log( 'Usage: node s2t [file]' );
  process.exit( 0 );
}else{
  var filepath = process.argv[2];
  var params = {
    objectMode: true,
    contentType: 'audio/mp3',
    model: settings.s2t_model + '_BroadbandModel',
    //keywords: [],
    //keywordsThreshold: 0.5,
    interimResults: true,
    maxAlternatives: 3
  };
  var stream = my.s2t.recognizeUsingWebSocket( params );
  fs.createReadStream( filepath ).pipe( stream );
  //stream.pipe( fs.createWriteStream( 'result.txt' ) );  //. uncommentable only when objectMode == false

  stream.on( 'data', function( evt ){
    /*
    evt = {
      result_index: 1,
      results: [
        {
          final: false,
          alternatives: [
            {
              transcript: "xxx xxxx xx xxxxxx ..."
            }
          ]
        }
      ]
    }
    */
    onEvent( 'data:', evt );
  });
  stream.on( 'error', function( evt ){
    onEvent( 'error:', evt );
  });
  stream.on( 'close', function( evt ){
    onEvent( 'close:', evt );
  });

  function onEvent( name, evt ){
    console.log( name, JSON.stringify( evt, null, 2 ) );
  }
}

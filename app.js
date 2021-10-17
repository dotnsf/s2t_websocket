//. app.js
var express = require( 'express' ),
    bodyParser = require( 'body-parser' ),
    ejs = require( 'ejs' ),
    fs = require( 'fs' ),
    app = express();
var { Readable } = require( 'stream' );

var my_s2t = require( './my_s2t' );

var settings = require( './settings' );

app.use( bodyParser.urlencoded( { extended: true } ) );
app.use( bodyParser.json() );
app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );

//.  HTTP server
var http = require( 'http' ).createServer( app );
var io = require( 'socket.io' )( http );

//. S2T for Mic
var s2t_mic_params = {
  objectMode: true,
  contentType: 'audio/g729',
  model: settings.s2t_model + '_NarrowbandModel',
  //keywords: [],
  //keywordsThreshold: 0.5,
  interimResults: true,
  //timestamps: true,
  maxAlternatives: 3
};

//. S2T for MP3
var s2t_mp3_params = {
  objectMode: true,
  contentType: 'audio/mp3',
  model: settings.s2t_model + '_BroadbandModel',
  //keywords: [],
  //keywordsThreshold: 0.5,
  interimResults: true,
  timestamps: true,
  maxAlternatives: 3
};

//. Page for client
app.get( '/', function( req, res ){
  res.render( 'index', {} );
});

app.get( '/files', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var files = [];
  var _files = fs.readdirSync( './public' );
  for( var i = 0; i < _files.length; i ++ ){
    if( _files[i].endsWith( '.mp3' ) ){
      files.push( _files[i] );
    }
  }

  res.write( JSON.stringify( { status: true, files: files }, 2, null ) );
  res.end();
});

app.post( '/voice', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var voice = req.body.voice;
  var uuid = req.body.uuid;
  var voicefile = './public/' + voice;

  processAudioFile( voicefile, uuid ).then( function( result ){
    res.write( JSON.stringify( { status: true }, 2, null ) );
    res.end();
  }).catch( function( err ){
    console.log( err );
    res.status( 400 );
    res.write( JSON.stringify( { status: false, error: err }, 2, null ) );
    res.end();
  })
});

app.post( '/audio', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var voicefile = req.file.path;
  var filename = req.file.originalname;
  var uuid = req.body.uuid;

  //. public フォルダへリネーム＆移動してから処理する
  fs.rename( voicefile, './public/' + filename, function( err ){
    if( err ){
      console.log( err );
      res.status( 400 );
      res.write( JSON.stringify( { status: false, error: err }, 2, null ) );
      res.end();
    }else{
      processAudioFile( './public/' + filename, uuid ).then( function( result ){
        res.write( JSON.stringify( { status: true }, 2, null ) );
        res.end();
      }).catch( function( err ){
        console.log( err );
        res.status( 400 );
        res.write( JSON.stringify( { status: false, error: err }, 2, null ) );
        res.end();
      })
    }
  });
});

app.post( '/setcookie', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var value = req.body.value;
  //console.log( 'value = ' + value );
  res.setHeader( 'Set-Cookie', value );

  res.write( JSON.stringify( { status: true }, 2, null ) );
  res.end();
});

async function processAudioFile( filepath, uuid, deleteFileWhenFinished ){
  return new Promise( async function( resolve, reject ){
    var s2t_mp3_stream = my_s2t.s2t.recognizeUsingWebSocket( s2t_mp3_params );
    fs.createReadStream( filepath ).pipe( s2t_mp3_stream );
    s2t_mp3_stream.on( 'data', function( evt ){
      //console.log( 's2t_stream:data', evt );
      /*
      evt = {
        result_index: 1,
        results: [
          {
            final: false,
            alternatives: [
              {
                transcript: "xxx xxxx xx xxxxxx ...",
                timestamps: [
                  [ "xxx", 15.55, 16.04 ],
                  [ "xxxx", 16.25, 16.6 ],
                  [ "xx", 16.6, 16.71 ],
                  [ "xxxxxx", 16.71, 17.21 ],
                    :
                ]
              }
            ]
          }
        ]
      }
      */
      sockets[uuid].emit( 'stt_result', evt ); 
      if( evt.results[0].final ){
        /*
        var idx = evt.result_index;
        var text = evt.results[0].alternatives[0].transcript;
        text = text.split( ' ' ).join( '' );
        console.log( 'text = ' + text );
        */

      }
    });
    s2t_mp3_stream.on( 'error', function( evt ){
      console.log( 's2t_stream:error', evt );
      if( deleteFileWhenFinished ){
        fs.unlinkSync( filepath );
      }
      reject( evt );
    });
    s2t_mp3_stream.on( 'close', function( evt ){
      //console.log( 's2t_stream:close', evt );
      if( deleteFileWhenFinished ){
        fs.unlinkSync( filepath );
      }
      resolve( true );
    });
  });
}


//. socket.io
var sockets = {};
io.sockets.on( 'connection', function( socket ){
  console.log( 'connected.' );

  //. 初期化時（ロード後の最初の resized 時）
  socket.on( 'init_client', function( msg ){
    //console.log( 'init_client', msg );

    //. これでは初期化時以外でも目的のクライアントに返せるよう connection 時の socket を記憶しておく
    if( !sockets[msg.uuid] ){
      sockets[msg.uuid] = socket;
    }

    //. init_client を実行したクライアントにだけ init_client_view を返す
    sockets[msg.uuid].emit( 'init_client_view', msg ); 
  });

  //. mic
  var s2t_mic_stream = null;
  socket.on( 'mic_start', function( b ){
    //console.log( 'mic_start' );
    //s2t_stream = my_s2t.s2t.recognizeUsingWebSocket( s2t_params );
    /*
    Error [ERR_STREAM_WRITE_AFTER_END]: write after end
    */
  });
  socket.on( 'mic_rate', function( rate ){
    //console.log( 'mic_rate', rate );  //. rate = 48000
    //s2t_params.contentType = 'audio/l16; rate=' + rate;
  });
  socket.on( 'mic_input', function( data ){
    //. ここは１秒に数回実行される（データは送信されてきている）
    //console.log( 'mic_input'/*, data*/ );
    s2t_mic_stream = my_s2t.s2t.recognizeUsingWebSocket( s2t_mic_params );
    Readable.from( data.voicedata ).pipe( s2t_mic_stream );
    s2t_mic_stream.on( 'data', function( evt ){
      //. 'audio/g729' & 'ja-JP_NarrowbandModel' だと、ここには来る？
      //console.log( evt );

      //. 元のクライアントにだけ stt_result を返す
      sockets[data.uuid].emit( 'stt_result', evt ); 
    });
    s2t_mic_stream.on( 'error', function( evt ){
      //console.log( 'error', evt );
      sockets[data.uuid].emit( 'stt_error', evt ); 
      /*
       一定時間（数秒）経過後にこれが頻発する
       マイクを止めて再試行すると、一定時間は正常に動いて、繰り返す。
       タイムアウト？
       WebSocket connection error: WebSocket connection error
      */
    });
    s2t_mic_stream.on( 'close', function( evt ){
      //console.log( 'close', evt );
      //s2t_stream.stop();
      //s2t_stream.unpipe();
    });
  });
  socket.on( 'mic_stop', function( b ){
    //console.log( 'mic_stop' );
    s2t_mic_stream.stop();
    s2t_mic_stream.unpipe();
  });

  //. mp3
  var s2t_mp3_stream = null;
  socket.on( 'mp3_start', function( b ){
    //console.log( 'mic_start' );
    //s2t_stream = my_s2t.s2t.recognizeUsingWebSocket( s2t_params );
    /*
    Error [ERR_STREAM_WRITE_AFTER_END]: write after end
    */
  });
  socket.on( 'mp3_rate', function( rate ){
    //console.log( 'mic_rate', rate );  //. rate = 48000
    //s2t_params.contentType = 'audio/l16; rate=' + rate;
  });
  socket.on( 'mp3_input', function( data ){
    //. ここは１秒に数回実行される（データは送信されてきている）
    //console.log( 'mic_input'/*, data*/ );
    s2t_mp3_stream = my_s2t.s2t.recognizeUsingWebSocket( s2t_mp3_params );
    Readable.from( data.voicedata ).pipe( s2t_mp3_stream );
    s2t_mp3_stream.on( 'data', function( evt ){
      //console.log( evt );

      //. 元のクライアントにだけ stt_result を返す
      sockets[data.uuid].emit( 'stt_result', evt ); 
    });
    s2t_mp3_stream.on( 'error', function( evt ){
      //console.log( 'error', evt );
      sockets[data.uuid].emit( 'stt_error', evt ); 
    });
    s2t_mp3_stream.on( 'close', function( evt ){
      //console.log( 'close', evt );
    });
  });
  socket.on( 'mp3_stop', function( b ){
    //console.log( 'mic_stop' );
    s2t_mp3_stream.stop();
    s2t_mp3_stream.unpipe();
  });
});


var port = process.env.PORT || 8080;
http.listen( port );
console.log( "server starting on " + port + " ..." );

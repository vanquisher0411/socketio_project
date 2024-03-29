
var http = require('http').Server;
var io = require('..');
var ioc = require('socket.io-client');
var request = require('supertest');
var expect = require('expect.js');

// Creates a socket.io client for the given server
function client(srv, nsp, opts){
  if ('object' == typeof nsp) {
    opts = nsp;
    nsp = null;
  }
  var addr = srv.address();
  if (!addr) addr = srv.listen().address();
  var url = 'ws://' + addr.address + ':' + addr.port + (nsp || '');
  return ioc(url, opts);
}

describe('socket.io', function(){
  describe('server attachment', function(){
    describe('http.Server', function(){
      var clientVersion = require('socket.io-client/package').version;

      it('should serve static files', function(done){
        var srv = http();
        io(srv);
        request(srv)
        .get('/socket.io/socket.io.js')
        .buffer(true)
        .end(function(err, res){
          if (err) return done(err);
          var ctype = res.headers['content-type'];
          expect(ctype).to.be('application/javascript');
          expect(res.headers.etag).to.be(clientVersion);
          expect(res.text).to.match(/engine\.io/);
          expect(res.status).to.be(200);
          done();
        });
      });

      it('should handle 304', function(done){
        var srv = http();
        io(srv);
        request(srv)
        .get('/socket.io/socket.io.js')
        .set('ETag', clientVersion)
        .end(function(err, res){
          if (err) return done(err);
          expect(res.statusCode).to.be(304);
          done();
        });
      });

      it('should not serve static files', function(done){
        var srv = http();
        io(srv, { static: false });
        request(srv)
        .get('/socket.io/socket.io.js')
        .expect(400, done);
      });

      it('should work with #attach', function(done){
        var srv = http(function(req, res){
          res.writeHead(404);
          res.end();
        });
        var sockets = io();
        sockets.attach(srv);
        request(srv)
        .get('/socket.io/socket.io.js')
        .end(function(err, res){
          if (err) return done(err);
          expect(res.status).to.be(200);
          done();
        });
      });
    });

    describe('port', function(done){
      it('should be bound', function(done){
        var sockets = io(54010);
        request('http://localhost:54010')
        .get('/socket.io/socket.io.js')
        .expect(200, done);
      });
    });

    it('should allow request when origin defined as function and same is supplied', function(done) {
      var sockets = io({ origins: function(origin,callback){
        if (origin == 'http://foo.example') {
          return callback(null, true);
        }
        return callback(null, false);
      } }).listen('54016');
      request.get('http://localhost:54016/socket.io/default/')
       .set('origin', 'http://foo.example')
       .query({ transport: 'polling' })
       .end(function (err, res) {
          expect(res.status).to.be(200);
          done();
        });
    });

    it('should allow request when origin defined as function and different is supplied', function(done) {
      var sockets = io({ origins: function(origin,callback){
        if (origin == 'http://foo.example') {
          return callback(null, true);
        }
        return callback(null, false);
      } }).listen('54017');
      request.get('http://localhost:54017/socket.io/default/')
       .set('origin', 'http://herp.derp')
       .query({ transport: 'polling' })
       .end(function (err, res) {
          expect(res.status).to.be(400);
          done();
        });
    });
  });

  describe('close', function(){

    it('should be able to close sio sending a srv', function(){
      var PORT   = 54018;
      var srv    = http().listen(PORT);
      var sio    = io(srv);
      var net    = require('net');
      var server = net.createServer();

      var clientSocket = client(srv, { reconnection: false });

      clientSocket.on('disconnect', function init() {
        expect(sio.nsps['/'].sockets.length).to.equal(0);
        server.listen(PORT);
      });

      clientSocket.on('connect', function init() {
        expect(sio.nsps['/'].sockets.length).to.equal(1);
        sio.close();
      });

      server.once('listening', function() {
        // PORT should be free
        server.close(function(error){
          expect(error).to.be(undefined);
        });
      });

    });

    it('should be able to close sio sending a port', function(){
      var PORT   = 54019;
      var sio    = io(PORT);
      var net    = require('net');
      var server = net.createServer();

      var clientSocket = ioc('ws://0.0.0.0:' + PORT, { reconnection: false });

      clientSocket.on('disconnect', function init() {
        expect(sio.nsps['/'].sockets.length).to.equal(0);
        server.listen(PORT);
      });

      clientSocket.on('connect', function init() {
        expect(sio.nsps['/'].sockets.length).to.equal(1);
        sio.close();
      });

      server.once('listening', function() {
        // PORT should be free
        server.close(function(error){
          expect(error).to.be(undefined);
        });
      });
    });

  });

  describe('namespaces', function(){
    var Socket = require('../lib/socket');
    var Namespace = require('../lib/namespace');

    describe('default', function(){
      it('should be accessible through .sockets', function(){
        var sio = io();
        expect(sio.sockets).to.be.a(Namespace);
      });

      it('should be aliased', function(){
        var sio = io();
        expect(sio.use).to.be.a('function');
        expect(sio.to).to.be.a('function');
        expect(sio.in).to.be.a('function');
        expect(sio.emit).to.be.a('function');
        expect(sio.send).to.be.a('function');
        expect(sio.write).to.be.a('function');
      });

      it('should automatically connect', function(done){
        var srv = http();
        var sio = io(srv);
        srv.listen(function(){
          var socket = client(srv);
          socket.on('connect', function(){
            done();
          });
        });
      });

      it('should fire a `connection` event', function(done){
        var srv = http();
        var sio = io(srv);
        srv.listen(function(){
          var socket = client(srv);
          sio.on('connection', function(socket){
            expect(socket).to.be.a(Socket);
            done();
          });
        });
      });

      it('should fire a `connect` event', function(done){
        var srv = http();
        var sio = io(srv);
        srv.listen(function(){
          var socket = client(srv);
          sio.on('connect', function(socket){
            expect(socket).to.be.a(Socket);
            done();
          });
        });
      });

      it('should work with many sockets', function(done){
        var srv = http();
        var sio = io(srv);
        srv.listen(function(){
          var chat = client(srv, '/chat');
          var news = client(srv, '/news');
          var total = 2;
          chat.on('connect', function(){
            --total || done();
          });
          news.on('connect', function(){
            --total || done();
          });
        });
      });

      it('should work with `of` and many sockets', function(done){
        var srv = http();
        var sio = io(srv);
        srv.listen(function(){
          var chat = client(srv, '/chat');
          var news = client(srv, '/news');
          var total = 2;
          sio.of('/news').on('connection', function(socket){
            expect(socket).to.be.a(Socket);
            --total || done();
          });
          sio.of('/news').on('connection', function(socket){
            expect(socket).to.be.a(Socket);
            --total || done();
          });
        });
      });

      it('should work with `of` second param', function(done){
        var srv = http();
        var sio = io(srv);
        srv.listen(function(){
          var chat = client(srv, '/chat');
          var news = client(srv, '/news');
          var total = 2;
          sio.of('/news', function(socket){
            expect(socket).to.be.a(Socket);
            --total || done();
          });
          sio.of('/news', function(socket){
            expect(socket).to.be.a(Socket);
            --total || done();
          });
        });
      });

      it('should disconnect upon transport disconnection', function(done){
        var srv = http();
        var sio = io(srv);
        srv.listen(function(){
          var chat = client(srv, '/chat');
          var news = client(srv, '/news');
          var total = 2;
          var totald = 2;
          var s;
          sio.of('/news', function(socket){
            socket.on('disconnect', function(reason){
              --totald || done();
            });
            --total || close();
          });
          sio.of('/chat', function(socket){
            s = socket;
            socket.on('disconnect', function(reason){
              --totald || done();
            });
            --total || close();
          });
          function close(){
            s.disconnect(true);
          }
        });
      });
    });
    
    it('should not reuse same-namespace connections', function(done){
      var srv = http();
      var sio = io(srv);
      var connections = 0;

      srv.listen(function() {
        var clientSocket1 = client(srv);
        var clientSocket2 = client(srv);
        sio.on('connection', function() {
          connections++;
          if(connections === 2) {
            done();
          }
        });
      });
    });
  });

  describe('socket', function(){

    it('should not fire events more than once after manually reconnecting', function(done) {
      var srv = http();
      var sio = io(srv);
      srv.listen(function(){
        var clientSocket = client(srv, { reconnection: false });
        clientSocket.on('connect', function init() {
          clientSocket.removeListener('connect', init);
          clientSocket.io.engine.close();

          clientSocket.connect();
          clientSocket.on('connect', function() {
            done();
          });
        });
      });
    });

    it('should not fire reconnect_failed event more than once when server closed', function(done) {
      var srv = http();
      var sio = io(srv);
      srv.listen(function(){
        var clientSocket = client(srv, { reconnectionAttempts: 3, reconnectionDelay: 10 });
        clientSocket.on('connect', function() {
          srv.close();
        });

        clientSocket.on('reconnect_failed', function() {
          done();
        });
      });
    });

    it('should receive events', function(done){
      var srv = http();
      var sio = io(srv);
      srv.listen(function(){
        var socket = client(srv);
        sio.on('connection', function(s){
          s.on('random', function(a, b, c){
            expect(a).to.be(1);
            expect(b).to.be('2');
            expect(c).to.eql([3]);
            done();
          });
          socket.emit('random', 1, '2', [3]);
        });
      });
    });

    it('should receive message events through `send`', function(done){
      var srv = http();
      var sio = io(srv);
      srv.listen(function(){
        var socket = client(srv);
        sio.on('connection', function(s){
          s.on('message', function(a){
            expect(a).to.be(1337);
            done();
          });
          socket.send(1337);
        });
      });
    });

    it('should emit events', function(done){
      var srv = http();
      var sio = io(srv);
      srv.listen(function(){
        var socket = client(srv);
        socket.on('woot', function(a){
          expect(a).to.be('tobi');
          done();
        });
        sio.on('connection', function(s){
          s.emit('woot', 'tobi');
        });
      });
    });

    it('should emit message events through `send`', function(done){
      var srv = http();
      var sio = io(srv);
      srv.listen(function(){
        var socket = client(srv);
        socket.on('message', function(a){
          expect(a).to.be('a');
          done();
        });
        sio.on('connection', function(s){
          s.send('a');
        });
      });
    });

    it('should receive event with callbacks', function(done){
      var srv = http();
      var sio = io(srv);
      srv.listen(function(){
        var socket = client(srv);
        sio.on('connection', function(s){
          s.on('woot', function(fn){
            fn(1, 2);
          });
          socket.emit('woot', function(a, b){
            expect(a).to.be(1);
            expect(b).to.be(2);
            done();
          });
        });
      });
    });

    it('should receive all events emitted from namespaced client immediately and in order', function(done) {
      var srv = http();
      var sio = io(srv);
      var total = 0;
      srv.listen(function(){
        sio.of('/chat', function(s){
          s.on('hi', function(letter){
            total++;
            if (total == 2 && letter == 'b') {
              done();
            } else if (total == 1 && letter != 'a') {
              throw new Error('events out of order');
            }
          });
        });

        var chat = client(srv, '/chat');
        chat.emit('hi', 'a');
        setTimeout(function() {
          chat.emit('hi', 'b');
        }, 50);
      });
    });

    it('should emit events with callbacks', function(done){
      var srv = http();
      var sio = io(srv);
      srv.listen(function(){
        var socket = client(srv);
        sio.on('connection', function(s){
          socket.on('hi', function(fn){
            fn();
          });
          s.emit('hi', function(){
            done();
          });
        });
      });
    });

    it('should receive events with args and callback', function(done){
      var srv = http();
      var sio = io(srv);
      srv.listen(function(){
        var socket = client(srv);
        sio.on('connection', function(s){
          s.on('woot', function(a, b, fn){
            expect(a).to.be(1);
            expect(b).to.be(2);
            fn();
          });
          socket.emit('woot', 1, 2, function(){
            done();
          });
        });
      });
    });

    it('should emit events with args and callback', function(done){
      var srv = http();
      var sio = io(srv);
      srv.listen(function(){
        var socket = client(srv);
        sio.on('connection', function(s){
          socket.on('hi', function(a, b, fn){
            expect(a).to.be(1);
            expect(b).to.be(2);
            fn();
          });
          s.emit('hi', 1, 2, function(){
            done();
          });
        });
      });
    });
  });

  describe('messaging many', function(){
    it('emits to a namespace', function(done){
      var srv = http();
      var sio = io(srv);
      var total = 2;

      srv.listen(function(){
        var socket1 = client(srv, { multiplex: false });
        var socket2 = client(srv, { multiplex: false });
        var socket3 = client(srv, '/test');
        socket1.on('a', function(a){
          expect(a).to.be('b');
          --total || done();
        });
        socket2.on('a', function(a){
          expect(a).to.be('b');
          --total || done();
        });
        socket3.on('a', function(){ done(new Error('not')); });

        var sockets = 3;
        sio.on('connection', function(socket){
          --sockets || emit();
        });
        sio.of('/test', function(socket){
          --sockets || emit();
        });

        function emit(){
          sio.emit('a', 'b');
        }
      });
    });

    it('emits to the rest', function(done){
      var srv = http();
      var sio = io(srv);
      var total = 2;

      srv.listen(function(){
        var socket1 = client(srv, { multiplex: false });
        var socket2 = client(srv, { multiplex: false });
        var socket3 = client(srv, '/test');
        socket1.on('a', function(a){
          expect(a).to.be('b');
          socket1.emit('finish');
        });
        socket2.emit('broadcast');
        socket2.on('a', function(){ done(new Error('done')); });
        socket3.on('a', function(){ done(new Error('not')); });

        var sockets = 2;
        sio.on('connection', function(socket){
          socket.on('broadcast', function(){
            socket.broadcast.emit('a', 'b');
          });
          socket.on('finish', function(){
            done();
          });
        });
      });
    });

    it('emits to rooms', function(done){
      var srv = http();
      var sio = io(srv);
      var total = 2;

      srv.listen(function(){
        var socket1 = client(srv, { multiplex: false });
        var socket2 = client(srv, { multiplex: false });

        socket2.on('a', function(){
          done(new Error('not'));
        });
        socket1.on('a', function(){
          done();
        });
        socket1.emit('join', 'woot', function(){
          socket1.emit('emit', 'woot');
        });

        sio.on('connection', function(socket){
          socket.on('join', function(room, fn){
            socket.join(room, fn);
          });

          socket.on('emit', function(room){
            sio.in(room).emit('a');
          });
        });
      });
    });

    it('emits to rooms avoiding dupes', function(done){
      var srv = http();
      var sio = io(srv);
      var total = 2;

      srv.listen(function(){
        var socket1 = client(srv, { multiplex: false });
        var socket2 = client(srv, { multiplex: false });

        socket2.on('a', function(){
          done(new Error('not'));
        });
        socket1.on('a', function(){
          --total || done();
        });
        socket2.on('b', function(){
          --total || done();
        });

        socket1.emit('join', 'woot');
        socket1.emit('join', 'test');
        socket2.emit('join', 'third', function(){
          socket2.emit('emit');
        });

        sio.on('connection', function(socket){
          socket.on('join', function(room, fn){
            socket.join(room, fn);
          });

          socket.on('emit', function(room){
            sio.in('woot').in('test').emit('a');
            sio.in('third').emit('b');
          });
        });
      });
    });

    it('broadcasts to rooms', function(done){
      var srv = http();
      var sio = io(srv);
      var total = 2;

      srv.listen(function(){
        var socket1 = client(srv, { multiplex: false });
        var socket2 = client(srv, { multiplex: false });
        var socket3 = client(srv, { multiplex: false });

        socket1.emit('join', 'woot');
        socket2.emit('join', 'test');
        socket3.emit('join', 'test', function(){
          socket3.emit('broadcast');
        });

        socket1.on('a', function(){
          done(new Error('not'));
        });
        socket2.on('a', function(){
          --total || done();
        });
        socket3.on('a', function(){
          done(new Error('not'));
        });
        socket3.on('b', function(){
          --total || done();
        });

        sio.on('connection', function(socket){
          socket.on('join', function(room, fn){
            socket.join(room, fn);
          });

          socket.on('broadcast', function(){
            socket.broadcast.to('test').emit('a');
            socket.emit('b');
          });
        });
      });
    });

    it('keeps track of rooms', function(done){
      var srv = http();
      var sio = io(srv);

      srv.listen(function(){
        var socket = client(srv);
        sio.on('connection', function(s){
          s.join('a', function(){
            expect(s.rooms).to.eql([s.id, 'a']);
            s.join('b', function(){
              expect(s.rooms).to.eql([s.id, 'a', 'b']);
              s.leave('b', function(){
                expect(s.rooms).to.eql([s.id, 'a']);
                done();
              });
            });
          });
        });
      });
    });

    it('deletes empty rooms', function(done) {
      var srv = http();
      var sio = io(srv);

      srv.listen(function(){
        var socket = client(srv);
        sio.on('connection', function(s){
          s.join('a', function(){
            expect(s.nsp.adapter.rooms).to.have.key('a');
            s.leave('a', function(){
              expect(s.nsp.adapter.rooms).to.not.have.key('a');
              done();
            });
          });
        });
      });
    });
  });

  describe('middleware', function(done){
    var Socket = require('../lib/socket');

    it('should call functions', function(done){
      var srv = http();
      var sio = io(srv);
      var run = 0;
      sio.use(function(socket, next){
        expect(socket).to.be.a(Socket);
        run++;
        next();
      });
      sio.use(function(socket, next){
        expect(socket).to.be.a(Socket);
        run++;
        next();
      });
      srv.listen(function(){
        var socket = client(srv);
        socket.on('connect', function(){
          expect(run).to.be(2);
          done();
        });
      });
    });

    it('should pass errors', function(done){
      var srv = http();
      var sio = io(srv);
      var run = 0;
      sio.use(function(socket, next){
        next(new Error('Authentication error'));
      });
      sio.use(function(socket, next){
        done(new Error('nope'));
      });
      srv.listen(function(){
        var socket = client(srv);
        socket.on('connect', function(){
          done(new Error('nope'));
        });
        socket.on('error', function(err){
          expect(err).to.be('Authentication error');
          done();
        });
      });
    });

    it('should pass `data` of error object', function(done){
      var srv = http();
      var sio = io(srv);
      var run = 0;
      sio.use(function(socket, next){
        var err = new Error('Authentication error');
        err.data = { a: 'b', c: 3 };
        next(err);
      });
      srv.listen(function(){
        var socket = client(srv);
        socket.on('connect', function(){
          done(new Error('nope'));
        });
        socket.on('error', function(err){
          expect(err).to.eql({ a: 'b', c: 3 });
          done();
        });
      });
    });

    it('should only call connection after fns', function(done){
      var srv = http();
      var sio = io(srv);
      sio.use(function(socket, next){
        socket.name = 'guillermo';
        next();
      });
      srv.listen(function(){
        var socket = client(srv);
        sio.on('connection', function(socket){
          expect(socket.name).to.be('guillermo');
          done();
        });
      });
    });

    it('should be ignored if socket gets closed', function(done){
      var srv = http();
      var sio = io(srv);
      var socket;
      sio.use(function(s, next){
        socket.io.engine.on('open', function(){
          socket.io.engine.close();
          s.client.conn.on('close', function(){
            process.nextTick(next);
            setTimeout(function(){
              done();
            }, 50);
          });
        });
      });
      srv.listen(function(){
        socket = client(srv);
        sio.on('connection', function(socket){
          done(new Error('should not fire'));
        });
      });
    });
  });
});

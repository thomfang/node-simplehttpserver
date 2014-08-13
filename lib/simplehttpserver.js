#! /usr/bin/env node

// This is a Simple HTTP Server by Node.js. You could start a static files
// server anywhere by using like:
//     `$ node yourdir/simplehttpserver.js targetdir port`
// If you had used Python SimpleHTTPServer module, it's easy to understand this

var http = require('http');
var url = require('url');
var path = require('path');
var zlib = require('zlib');
var fs = require('fs');

var SimpleHTTPServer = function (options) {
    this._port = options.port;
    this._base = options.base;
    this._server = http.createServer(this._requestHandler.bind(this));
};

SimpleHTTPServer.prototype = {

    // base url
    _base: '',

    // server running at port
    _port: 8000,

    // server instance
    _server: null,

    // server running status
    _running: false,

    // start the server
    start: function () {
        if (!this._running) {
            this._server.listen(this._port);
            this._running = true;
        }
    },

    // stop the running server
    stop: function () {
        if (this._running) {
            this._server.stop();
            this._running = false;
        }
    },

    _translatePath: function (pathname) {
        // remove .. (parent path)
        pathname = path.normalize(pathname);
        // replace to realpath
        var realpath = path.join(this._base, path.normalize(pathname));
        try {
            var st = fs.statSync(realpath);
            if (st.isDirectory(realpath)) {
                if (!/\/$/.test(realpath)) {
                    return {code: 301, path: realpath};
                }
                realpath = path.join(realpath, 'index.html');
                return fs.existsSync(realpath) && realpath;
            }
            if (st.isFile())
                return realpath;
        } catch (e) {
            return false;
        }    
    },

    _requestHandler: function (request, response) {
        response.setHeader('Accept-Range', 'bytes');
        var pathname = url.parse(request.url).pathname;
        var realpath = this._translatePath(pathname);
        if (realpath.code === 301) {
            response.writeHead(301, {'Location': realpath.path + '/'});
            response.end('301 ');
            console.log('[301] ' + realpath.path);
        } else if (!realpath) {
            response.writeHead(404, {'Content-Type': 'text/plain'});
            response.write('404 Not Found!');
            response.end();
            console.log('[404] ' + pathname);
        } else {
            var ext = path.extname(realpath);
            ext = ext ? ext.slice(1) : 'unknow';
            var ctnType = mimetypes[ext];
            var self = this;
            response.setHeader('Content-Type', ctnType);
            fs.stat(realpath, function (err, st) {
                var lastModified = st.mtime.toUTCString();
                var ifModifiedSince = 'if-modified-since';
                response.setHeader('Last-Modified', lastModified);
                // set cache control and expires time
                if (ext.match(config.Expires.fileMatch)) {
                    var expires = new Date();
                    var time = expires.getTime() + config.Expires.maxAge * 1000;
                    var maxAge = 'max-age=' + config.Expires.maxAge;
                    expires.setTime(time);
                    response.setHeader('Expires', expires.toUTCString());
                    response.setHeader('Cache-Control', maxAge);
                }
                // if not modified response 304 and end
                if (request.headers[ifModifiedSince] &&
                    request.headers[ifModifiedSince] == lastModified) {
                    response.writeHead(304, 'Not Modified');
                    response.end();
                    console.log('[304] ' + pathname);
                } else {
                    self._checkRange(realpath, ext, st, request, response);
                }
            });
        }
    },

    _checkRange: function (pathname, ext, st, request, response) {
        var responseFile = function (raw, status, header) {
            var stream = raw;
            var acceptEncoding = request.headers['accept-encoding'] || '';
            // if need to compress
            var matched = ext.match(config.Compress.match);
            // check which type to zip
            if (matched && acceptEncoding.match(/\bgzip\b/)) {
                response.setHeader('Content-Encoding', 'gzip');
                stream = raw.pipe(zlib.createGzip());
            } else if (matched && acceptEncoding.match(/\bdeflate\b/)) {
                response.setHeader('Content-Encoding', 'deflate');
                stream = raw.pipe(zlib.createDeflate());
            }
            console.log('[' + status + '] ' +  pathname);
            response.writeHead(status, header);
            stream.pipe(response);
        };

        if (request.headers['range']) {
            var range = this._parseRange(request.headers['range'], st.size);
            if (range) {
                response.setHeader(
                    'Content-Range',
                    'bytes ' + range.start + '-' + range.end + '/' + st.size);
                response.setHeader(
                    'Content-Length', range.end - range.start + 1);
                var opts = {start: range.start, end: range.end};
                var raw = fs.createReadStream(pathname, opts);
                responseFile(raw, 206, 'Partial Content');
            } else {
                response.writeHead(416, 'Request Range Not Satisfiable');
                response.end();
            }
        } else {
            // if not request range, response the whole file
            var raw = fs.createReadStream(pathname);
            //response.setHeader('Content-Length', st.size);
            responseFile(raw, 200, 'ok')
        }
    },

    _parseRange: function (str, size) {
        if (str.indexOf(',') != -1)
            return null;
        str = str.replace(/^[^=]+=/, '');
        var range = str.split('-');
        var start = parseInt(range[0]);
        var end = parseInt(range[1]);

        // -100
        if (isNaN(start)) {
            start = size - end;
            end = size - 1;
        }
        // 100-
        else if (isNaN(end)) {
            end = size - 1;
        }

        if (isNaN(start) || isNaN(end) || start > end || end > size)
            return null;
        return {start: start, end: end};
    },

};

var mimetypes = {
    'js': 'text/javascript',
    'css': 'text/css',
    'txt': 'text/plain',
    'cvs': 'text/csv',
    'xml': 'text/xml',
    'htm': 'text/htm',
    'html': 'text/html',

    'png': 'image/png',
    'jpg': 'image/jpeg',
    'gif': 'image/gif',
    'tif': 'image/tiff',

    'json': 'application/json',
    'swf': 'application/x-shockwave-flash',
    'pdf': 'application/pdf',

    'wav': 'audio/wav',
    'wma': 'audio/x-ms-wma',
    'mp3': 'audio/mpeg',
    'ogg': 'audio/ogg',
    'm4a': 'audio/x-mp4a-latm',
    'wmv': 'video/x-ms-wmv',
    'mp4': 'video/mp4',
};

var config = {

    Expires: {
        maxAge: 86400,
        fileMatch: /^(gif|png|jpg|css|js)$/i
    },

    Compress: {
        match: /css|html|js/i,
    }
};

module.exports = SimpleHTTPServer;

function main() {
    var options = {
        base: process.argv[2] || process.cwd(),
        port: process.argv[3] || 8000,
    };
    var simpleServer = new SimpleHTTPServer(options);
    simpleServer.start();
    console.log('Serving HTTP on 0.0.0.0 port ' + options.port + ' ...');
}

if (require.main === module)
    main();

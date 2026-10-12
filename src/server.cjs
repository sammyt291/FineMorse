const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/':'index.html','/app.js':'app.js','/cw.js':'cw.js','/style.css':'style.css'};
http.createServer((req,res)=>{
  const file=files[req.url];
  if(!file) {res.writeHead(404);return res.end('Not found');}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  fs.createReadStream(path.join(__dirname,file)).pipe(res);
}).listen(5173,'127.0.0.1',()=>console.log('FineMorse web validation server on port 5173'));

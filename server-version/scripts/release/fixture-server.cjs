// A-only upstream. UI fixture requests are intercepted by the browser harness.
require('node:http').createServer((q,r)=>{r.setHeader('Content-Type','application/json');r.end(JSON.stringify({code:0,data:{cognitive:true,parentPortal:true}}))}).listen(3000,'0.0.0.0');
setInterval(()=>{},10000);

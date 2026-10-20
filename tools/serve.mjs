import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||4186);
http.createServer((req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png'};
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(file).on('error',()=>res.end()).pipe(res);
 }catch{res.writeHead(404).end();}
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));

import assert from "node:assert/strict";
import { io } from "socket.io-client";

const baseUrl=process.env.TEST_API_URL||"http://localhost:3000";
const login=await fetch(`${baseUrl}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:"admin@parkplaza.com",password:"ParkPlaza123*"})});
assert.equal(login.status,200,"El backend debe estar levantado para probar tiempo real");const {token}=await login.json();
const socket=io(baseUrl,{transports:["websocket"],timeout:5000});
try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Socket.IO no conectó")),5000);socket.once("realtime:ready",()=>{clearTimeout(timer);resolve();});socket.once("connect_error",reject);});
  const event=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("No llegó state:changed sin recargar")),5000);socket.on("state:changed",(payload)=>{if(payload.path==="/api/realtime/ping"){clearTimeout(timer);resolve(payload);}});});
  const response=await fetch(`${baseUrl}/api/realtime/ping`,{method:"POST",headers:{authorization:`Bearer ${token}`}});assert.equal(response.status,200);const payload=await event;assert.equal(payload.method,"POST");
  console.log(JSON.stringify({status:"PASSED",tests:1,results:[{name:"Actualización en vivo sin recargar",detail:"Socket.IO recibió state:changed desde el backend y el cliente está suscrito al mismo evento"}]},null,2));
}finally{socket.close();}

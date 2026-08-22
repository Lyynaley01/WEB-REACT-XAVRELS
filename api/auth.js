import crypto from "node:crypto";
import { sql } from "../lib/db.js";
import { json, body } from "../lib/http.js";
import { sessionCookie, clearCookie, parseSession, csrfOk, sameOrigin, getClientIp, hashIdentity, audit } from "../lib/security.js";

function passwordOk(input){
  const actual=process.env.ADMIN_PASSWORD||"";
  if(!actual||!input)return false;
  const a=Buffer.from(String(input)); const b=Buffer.from(actual);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
export default async function handler(req){
  const url=new URL(req.url); const action=url.searchParams.get("action")||"";
  if(req.method==="GET" && action==="me"){
    const s=parseSession(req);
    if(!s)return json({ok:false,message:"Unauthorized."},401);
    return json({ok:true,csrf:s.csrf,expiresAt:s.exp});
  }
  if(req.method==="POST" && !sameOrigin(req))return json({ok:false,message:"Origin tidak diizinkan."},403);
  if(req.method==="POST"){
    const b=await body(req); const act=b.action||"login";
    if(act==="login"){
      const ip=hashIdentity(getClientIp(req));
      const recent=await sql`SELECT COUNT(*)::int AS n FROM auth_attempts WHERE ip_hash=${ip} AND created_at > NOW()-INTERVAL '15 minutes'`;
      if(Number(recent[0].n)>=10)return json({ok:false,message:"Terlalu banyak percobaan login. Coba lagi nanti."},429);
      await sql`INSERT INTO auth_attempts(ip_hash) VALUES(${ip})`;
      if(!passwordOk(String(b.password||"")))return json({ok:false,message:"Password salah. Coba lagi."},401);
      const csrf=crypto.randomBytes(24).toString("hex");
      const payload={iat:Date.now(),exp:Date.now()+12*60*60*1000,csrf};
      await audit("admin_login",ip);
      return json({ok:true},200,{"set-cookie":sessionCookie(payload)});
    }
    if(act==="logout"){
      const s=parseSession(req); if(s && !csrfOk(req,s))return json({ok:false,message:"CSRF token tidak valid."},403);
      return json({ok:true},200,{"set-cookie":clearCookie()});
    }
  }
  return json({ok:false,message:"Action tidak dikenal."},400);
        }
  

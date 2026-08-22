import crypto from "node:crypto";
import { sql } from "../lib/db.js";
import { json, body } from "../lib/http.js";
import { requireAdmin, csrfOk, sameOrigin, getClientIp, hashIdentity } from "../lib/security.js";

function gen(){return "BOOST-"+crypto.randomBytes(6).toString("hex").toUpperCase().slice(0,8)}
async function settings(){const rows=await sql`SELECT key,value FROM settings`;const s={generate_count:1,bonus_limit:5,max_redeem_users:0};for(const r of rows)s[r.key]=Number(r.value);return s}
export default async function handler(req){
  if(req.method==="GET"){
    const auth=await requireAdmin(req);if(!auth.ok)return json({ok:false,message:"Unauthorized."},401);
    const url=new URL(req.url); if(url.searchParams.get("action")!=="list")return json({ok:false,message:"Action tidak dikenal."},400);
    const rows=await sql`SELECT c.code,c.bonus_limit,c.created_at,c.is_active,COUNT(r.id)::int AS used_count FROM redeem_codes c LEFT JOIN redemptions r ON r.code_id=c.id GROUP BY c.id ORDER BY c.created_at DESC`;
    return json({ok:true,codes:rows.map(x=>({...x,bonus_limit:Number(x.bonus_limit),used_count:Number(x.used_count)}))});
  }
  if(req.method!=="POST")return json({ok:false,message:"Method tidak valid."},405);
  if(!sameOrigin(req))return json({ok:false,message:"Origin tidak diizinkan."},403);
  const b=await body(req); const action=b.action||"redeem";
  if(action==="redeem"){
    const code=String(b.code||"").trim().toUpperCase();if(!code)return json({ok:false,message:"Kode tidak boleh kosong."},400);
    const rows=await sql`SELECT * FROM redeem_codes WHERE UPPER(code)=${code} LIMIT 1`;
    if(!rows.length)return json({ok:false,message:"Kode tidak ditemukan atau sudah tidak berlaku."},404);
    const c=rows[0];if(!c.is_active)return json({ok:false,message:"Kode sudah dinonaktifkan."},403);
    const settings=await settings();const identity=hashIdentity(getClientIp(req));
    const used=await sql`SELECT 1 FROM redemptions WHERE code_id=${c.id} AND ip_hash=${identity} LIMIT 1`;
    if(used.length)return json({ok:false,message:"Kamu sudah menggunakan kode ini sebelumnya."},403);
    if(settings.max_redeem_users>0){const count=await sql`SELECT COUNT(*)::int n FROM redemptions WHERE code_id=${c.id}`;if(Number(count[0].n)>=settings.max_redeem_users)return json({ok:false,message:`Kode ini sudah mencapai batas maksimal ${settings.max_redeem_users} pengguna.`},403)}
    const bonus=Number(c.bonus_limit)>0?Number(c.bonus_limit):settings.bonus_limit;
    await sql`INSERT INTO redemptions(code_id,ip_hash) VALUES(${c.id},${identity})`;
    return json({ok:true,message:`Berhasil! Limit ditambah +${bonus}`,bonus});
  }
  const auth=await requireAdmin(req);if(!auth.ok)return json({ok:false,message:"Unauthorized."},401);
  if(!sameOrigin(req)||!csrfOk(req,auth.session))return json({ok:false,message:"Request tidak diizinkan."},403);
  if(action==="generate"){
    const count=Number(b.count),bonus=Number(b.bonus);if(!Number.isInteger(count)||count<1||count>500)return json({ok:false,message:"Jumlah harus antara 1-500."},400);if(!Number.isInteger(bonus)||bonus<1||bonus>9999)return json({ok:false,message:"Bonus limit harus antara 1-9999."},400);
    const out=[];for(let i=0;i<count;i++){let code;for(let j=0;j<5;j++){code=gen();const x=await sql`SELECT 1 FROM redeem_codes WHERE code=${code}`;if(!x.length)break}await sql`INSERT INTO redeem_codes(code,bonus_limit) VALUES(${code},${bonus})`;out.push(code)}
    return json({ok:true,message:`Berhasil membuat ${count} kode.`,codes:out});
  }
  if(action==="toggle"){const code=String(b.code||"").trim();const r=await sql`UPDATE redeem_codes SET is_active=NOT is_active WHERE code=${code} RETURNING is_active`;if(!r.length)return json({ok:false,message:"Kode tidak ditemukan."},404);return json({ok:true,message:"Status kode diperbarui."})}
  if(action==="delete"){const code=String(b.code||"").trim();const r=await sql`DELETE FROM redeem_codes WHERE code=${code} RETURNING id`;if(!r.length)return json({ok:false,message:"Kode tidak ditemukan."},404);return json({ok:true,message:"Kode dihapus."})}
  return json({ok:false,message:"Action tidak dikenal."},400);
                                                              }

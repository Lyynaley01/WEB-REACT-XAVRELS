import { sql } from "../lib/db.js";
import { json, body } from "../lib/http.js";
import { requireAdmin, csrfOk, sameOrigin } from "../lib/security.js";
const defaults={generate_count:1,bonus_limit:5,max_redeem_users:0};
export default async function handler(req){
  const auth=await requireAdmin(req); if(!auth.ok)return json({ok:false,message:"Unauthorized."},401);
  if(req.method==="GET"){
    const rows=await sql`SELECT key,value FROM settings`;
    const s={...defaults}; for(const r of rows)s[r.key]=Number(r.value);
    return json({ok:true,settings:s});
  }
  if(req.method==="POST"){
    if(!sameOrigin(req)||!csrfOk(req,auth.session))return json({ok:false,message:"Request tidak diizinkan."},403);
    const b=await body(req); if(b.action!=="save_settings")return json({ok:false,message:"Action tidak dikenal."},400);
    const generateCount=Number(b.generate_count),bonusLimit=Number(b.bonus_limit),maxRedeemUsers=Number(b.max_redeem_users);
    if(!Number.isInteger(generateCount)||generateCount<1||generateCount>500)return json({ok:false,message:"Jumlah generate harus antara 1-500."},400);
    if(!Number.isInteger(bonusLimit)||bonusLimit<1||bonusLimit>9999)return json({ok:false,message:"Bonus limit harus antara 1-9999."},400);
    if(!Number.isInteger(maxRedeemUsers)||maxRedeemUsers<0)return json({ok:false,message:"Max redeem users tidak boleh negatif."},400);
    for(const [k,v] of Object.entries({generate_count:generateCount,bonus_limit:bonusLimit,max_redeem_users:maxRedeemUsers}))
      await sql`INSERT INTO settings(key,value) VALUES(${k},${String(v)}) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`;
    return json({ok:true,message:"Settings berhasil disimpan.",settings:{generate_count:generateCount,bonus_limit:bonusLimit,max_redeem_users:maxRedeemUsers}});
  }
  return json({ok:false,message:"Method tidak valid."},405);
                                                                         }

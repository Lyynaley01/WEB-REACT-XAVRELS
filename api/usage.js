import { sql } from "../lib/db.js";
import { json } from "../lib/http.js";
import { getClientIp, hashIdentity } from "../lib/security.js";
export default async function handler(req){
  if(req.method!=="GET")return json({ok:false,message:"Method tidak valid."},405);
  const id=hashIdentity(getClientIp(req)),day=new Date().toISOString().slice(0,10);
  const bonus=await sql`SELECT COALESCE(SUM(rc.bonus_limit),0)::int n FROM redemptions r JOIN redeem_codes rc ON rc.id=r.code_id WHERE r.ip_hash=${id}`;
  const row=await sql`SELECT used,limit_value FROM usage_daily WHERE ip_hash=${id} AND usage_date=${day} LIMIT 1`;
  const limit=10+Number(bonus[0]?.n||0),used=Number(row[0]?.used||0);
  return json({ok:true,used,limit,remaining:Math.max(0,limit-used)});
}

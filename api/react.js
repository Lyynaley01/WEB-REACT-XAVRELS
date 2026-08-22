import { sql } from "../lib/db.js";
import { json, body } from "../lib/http.js";
import { normalize, sendReaction } from "../lib/reaction.js";
import { getClientIp, hashIdentity, requireAdmin, csrfOk, sameOrigin } from "../lib/security.js";

const BASE_LIMIT=10;
export default async function handler(req){
  if(req.method!=="POST")return json({ok:false,message:"Method tidak valid."},405);
  if(!sameOrigin(req))return json({ok:false,message:"Origin tidak diizinkan."},403);
  const b=await body(req); const parsed=normalize(String(b.url||"").trim(),String(b.reaction||"").trim()); if(parsed.error)return json({ok:false,message:parsed.error},400);
  const isAdmin=(await requireAdmin(req)).ok;
  const identity=hashIdentity(getClientIp(req)); const day=new Date().toISOString().slice(0,10);
  const bonusRows=await sql`SELECT COALESCE(SUM(rc.bonus_limit),0)::int bonus FROM redemptions r JOIN redeem_codes rc ON rc.id=r.code_id WHERE r.ip_hash=${identity}`;
  const bonus=Number(bonusRows[0]?.bonus||0);
  const limit=BASE_LIMIT+bonus;
  const row=await sql`INSERT INTO usage_daily(ip_hash,usage_date,used,limit_value) VALUES(${identity},${day},0,${limit})
    ON CONFLICT(ip_hash,usage_date) DO UPDATE SET limit_value=${limit}
    RETURNING used,limit_value`;
  if(!isAdmin){
    const claimed=await sql`UPDATE usage_daily SET used=used+1,updated_at=NOW()
      WHERE ip_hash=${identity} AND usage_date=${day} AND used < limit_value
      RETURNING used,limit_value`;
    if(!claimed.length)return json({ok:false,message:"Limit harian kamu sudah habis.\nBalik lagi besok ya — limit direset otomatis setiap hari!"},429);
  }
  const results=[];for(const emoji of parsed.reactions)results.push(await sendReaction(parsed.url,emoji));
  const ok=results.filter(x=>x.ok),fail=results.filter(x=>!x.ok);
  if(ok.length===results.length)return json({ok:true,message:results.length===1?"✅ Reaction berhasil!\n\nLihat postingan channel anda 🫡":`✅ Semua ${results.length} reaction berhasil!\n\n${ok.map(x=>x.emoji).join("  ")}\n\nLihat postingan channel anda 🫡`});
  if(!ok.length)return json({ok:false,message:`❌ Semua reaction gagal!\n\n${fail.map(x=>`${x.emoji} (${x.message})`).join("\n")}`},400);
  return json({ok:false,partial:true,message:`⚠️ ${ok.length} dari ${results.length} reaction berhasil.\n\n✅ Berhasil: ${ok.map(x=>x.emoji).join("  ")}\n❌ Gagal:\n${fail.map(x=>`${x.emoji} (${x.message})`).join("\n")}`},207);
}

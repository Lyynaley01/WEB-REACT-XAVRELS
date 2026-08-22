const API_URL="https://api.nexadev.my.id/api/rch";
const MAX_EMOJI=5;
const ALLOWED_HOSTS=["t.me","telegram.me","www.t.me","www.telegram.me"];

export function normalize(url, raw){
  let u;
  try{u=new URL(url)}catch{return {error:"URL target tidak valid."}}
  if(!["http:","https:"].includes(u.protocol))return {error:"URL target tidak valid."};
  if(!ALLOWED_HOSTS.includes(u.hostname.toLowerCase()))return {error:"URL harus berupa link Telegram (t.me/...)."};
  const reactions=raw.split(",").map(x=>x.trim()).filter(Boolean).slice(0,MAX_EMOJI);
  if(!reactions.length)return {error:"Tidak ada emoji valid yang ditemukan."};
  if(reactions.length>MAX_EMOJI)return {error:`Maksimal ${MAX_EMOJI} reaction.`};
  return {url:u.toString(),reactions};
}
export async function sendReaction(url,emoji){
  const q=new URLSearchParams({key:process.env.REACTION_API_KEY,url,reaction:emoji});
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),55000);
  try{
    const r=await fetch(`${API_URL}?${q}`,{signal:controller.signal,headers:{"accept":"application/json","user-agent":"WA-Reaction/2.0"}});
    const text=await r.text();
    if(!text)return {ok:false,emoji,message:"API mengembalikan response kosong."};
    let data; try{data=JSON.parse(text)}catch{return {ok:false,emoji,message:"Response API tidak valid (bukan JSON)."}}
    if(data?.result?.success===true)return {ok:true,emoji,message:"Berhasil"};
    return {ok:false,emoji,message:data?.result?.message||data?.message||"Gagal diproses."};
  }catch(e){return {ok:false,emoji,message:e.name==="AbortError"?"Request timeout.":`Request gagal: ${e.message}`}}
  finally{clearTimeout(timer)}
}
export {MAX_EMOJI};

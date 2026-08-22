import "dotenv/config";
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
const sql=neon(process.env.DATABASE_URL);
const statements=fs.readFileSync(new URL("../schema.sql",import.meta.url),"utf8").split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean);
for(const statement of statements) await sql.query(statement);
console.log("Database siap.");

import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function probe(name, path) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  const body = await res.text();
  if (res.ok) {
    console.log(`OK   ${name}`);
  } else {
    console.log(`FAIL ${name} -> ${res.status}: ${body.slice(0, 140)}`);
  }
}

await probe("009: stock_items.client_pppoe/wifi columns", "stock_items?select=id,client_pppoe,wifi_name,wifi_password&limit=1");
await probe("010: stock_items.client_name column", "stock_items?select=id,client_name&limit=1");
await probe("011: stock_qr_labels table", "stock_qr_labels?select=id&limit=1");
await probe("012: stock_items.client_address column", "stock_items?select=id,client_address&limit=1");
await probe("013: stock_item_visits table", "stock_item_visits?select=id&limit=1");
await probe("013: client_support_requests table", "client_support_requests?select=id&limit=1");
await probe("014: stock_sundries table", "stock_sundries?select=id&limit=1");
await probe(
  "015: recoverable four-digit portal codes",
  "stock_items?select=id,client_pin_ciphertext&limit=1"
);

async function probeRpc(name, fn, args) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await res.text();
  if (res.ok) {
    console.log(`OK   ${name} (response: ${body.slice(0, 100)})`);
  } else {
    console.log(`FAIL ${name} -> ${res.status}: ${body.slice(0, 140)}`);
  }
}

await probeRpc("011: claim_stock_qr_label function", "claim_stock_qr_label", { p_qr_token: "__probe__" });
await probeRpc("011: return_stock_item_by_qr function", "return_stock_item_by_qr", { p_qr_token: "__probe__" });

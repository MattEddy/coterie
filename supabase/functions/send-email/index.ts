import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_SES_ACCESS_KEY_ID")!;
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SES_SECRET_ACCESS_KEY")!;
const AWS_REGION = "us-east-1";

const APP_SENDERS: Record<string, string> = {
  vivi: "Vivi <noreply@letsvivi.com>",
  bossword: "Bossword <noreply@bossword.app>",
  subscriptix: "Subscriptix <noreply@subscriptix.com>",
  coterie: "Coterie <noreply@coteriepro.com>",
  survivalbox: "Survival Box <noreply@survivalbox.app>",
};

async function hmac(key: BufferSource, msg: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(msg));
}

async function hmacHex(key: BufferSource, msg: string): Promise<string> {
  const sig = await hmac(key, msg);
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(msg: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(msg),
  );
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<Record<string, string>> {
  const now = new Date();
  const dateStamp =
    now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const shortDate = dateStamp.substring(0, 8);

  const host = new URL(url).host;
  headers["host"] = host;
  headers["x-amz-date"] = dateStamp;
  headers["content-type"] = "application/x-www-form-urlencoded";

  const signedHeaderKeys = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join("");

  const payloadHash = await sha256Hex(body);
  const canonicalRequest = [
    method,
    "/",
    "",
    canonicalHeaders,
    signedHeaderKeys,
    payloadHash,
  ].join("\n");

  const credentialScope = `${shortDate}/${AWS_REGION}/ses/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    dateStamp,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const encoder = new TextEncoder();
  const kDate = await hmac(
    encoder.encode("AWS4" + AWS_SECRET_ACCESS_KEY),
    shortDate,
  );
  const kRegion = await hmac(kDate, AWS_REGION);
  const kService = await hmac(kRegion, "ses");
  const kSigning = await hmac(kService, "aws4_request");

  const signature = await hmacHex(kSigning, stringToSign);

  headers["authorization"] =
    `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaderKeys}, Signature=${signature}`;

  return headers;
}

serve(async (req) => {
  // Auth: only allow calls from our own service_role key
  const authHeader = req.headers.get("authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const { app, to, subject, html, text, from } = await req.json();

  // Validate app (unless custom from is provided)
  const sender = from || APP_SENDERS[app];
  if (!sender) {
    return new Response(JSON.stringify({ error: "Invalid app or missing from" }), {
      status: 400,
    });
  }
  if (!to || !subject || (!html && !text)) {
    return new Response(
      JSON.stringify({ error: "Missing: to, subject, and html or text" }),
      { status: 400 },
    );
  }

  // Build SES SendEmail request
  const params = new URLSearchParams();
  params.set("Action", "SendEmail");
  params.set("Source", sender);
  params.set("Destination.ToAddresses.member.1", to);
  params.set("Message.Subject.Data", subject);
  params.set("Message.Subject.Charset", "UTF-8");

  if (html) {
    params.set("Message.Body.Html.Data", html);
    params.set("Message.Body.Html.Charset", "UTF-8");
  }
  if (text) {
    params.set("Message.Body.Text.Data", text);
    params.set("Message.Body.Text.Charset", "UTF-8");
  }

  const sesUrl = `https://email.${AWS_REGION}.amazonaws.com/`;
  const body = params.toString();
  const headers = await signRequest("POST", sesUrl, {}, body);

  const sesRes = await fetch(sesUrl, { method: "POST", headers, body });
  const sesBody = await sesRes.text();

  if (!sesRes.ok) {
    console.error("SES error:", sesBody);
    return new Response(
      JSON.stringify({ error: "Send failed", detail: sesBody }),
      { status: 502 },
    );
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});

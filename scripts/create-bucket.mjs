// Creates the "captures" storage bucket and verifies public read.
//
// Needs SUPABASE_SECRET_KEY (sb_secret_... / service_role) in .env.local.
// That key bypasses RLS — it is server-only and must never reach the client.
//
// This covers section 3 of supabase/schema.sql only. The products table and
// its policies are DDL, which no REST endpoint can run: paste sections 1 and 2
// of schema.sql into the Supabase SQL editor.
//
//   node --env-file=.env.local scripts/create-bucket.mjs

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  console.error(
    "Missing config. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY\n" +
      "in .env.local. Get the secret key from:\n" +
      "  Dashboard -> Project Settings -> API keys -> service_role / secret",
  );
  process.exit(1);
}

const auth = {
  apikey: secret,
  Authorization: `Bearer ${secret}`,
  "Content-Type": "application/json",
};

const BUCKET = "captures";

async function main() {
  // 1. Create, or confirm it already exists.
  const create = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  const createBody = await create.json().catch(() => ({}));

  if (create.ok) {
    console.log(`created bucket "${BUCKET}"`);
  } else if (
    create.status === 409 ||
    createBody?.error === "Duplicate" ||
    String(createBody?.message ?? "").includes("already exists")
  ) {
    console.log(`bucket "${BUCKET}" already exists`);
  } else {
    console.error(`create failed: ${create.status}`, createBody);
    process.exit(1);
  }

  // 2. Force public, in case it existed as private.
  const update = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({ public: true }),
  });
  if (!update.ok) {
    console.error(`could not set public: ${update.status}`, await update.text());
    process.exit(1);
  }

  // 3. Read it back.
  const info = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, {
    headers: auth,
  }).then((r) => r.json());
  console.log(`  public: ${info.public}`);

  // 4. Prove anonymous read works end to end: upload, fetch with no auth,
  //    then clean up.
  const probe = `_healthcheck/${Date.now()}.txt`;
  const put = await fetch(`${url}/storage/v1/object/${BUCKET}/${probe}`, {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "text/plain" },
    body: "shelf storage healthcheck",
  });
  if (!put.ok) {
    console.error(`probe upload failed: ${put.status}`, await put.text());
    process.exit(1);
  }

  const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${probe}`;
  const anon = await fetch(publicUrl);
  console.log(`  anonymous read: HTTP ${anon.status} ${anon.ok ? "OK" : "FAILED"}`);

  await fetch(`${url}/storage/v1/object/${BUCKET}/${probe}`, {
    method: "DELETE",
    headers: auth,
  });
  console.log("  probe file removed");

  console.log(
    "\nStill to do in the SQL editor: sections 1 and 2 of supabase/schema.sql\n" +
      "(products table + policies), and the storage.objects INSERT policy in\n" +
      "section 3 if the browser will upload directly.",
  );
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});

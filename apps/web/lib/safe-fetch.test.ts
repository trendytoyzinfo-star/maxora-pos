import assert from "node:assert/strict";
import test from "node:test";
import { friendlyMessage, readJsonSafely, SERVER_ERROR_MESSAGE } from "./safe-fetch.ts";

const text500 = () => new Response("Internal Server Error", { status: 500 });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("a plain-text 500 never throws and gives the friendly message", async () => {
  const r = await readJsonSafely<{ message?: string }>(text500());
  assert.equal(r.ok, false);
  assert.equal(r.data, null);
  assert.equal(friendlyMessage(r), SERVER_ERROR_MESSAGE);
});

test("the message never contains technical JSON-parse wording", async () => {
  const msg = friendlyMessage(await readJsonSafely(text500()));
  assert.doesNotMatch(msg, /unexpected token|json/i);
});

test("malformed JSON with a json content-type is handled", async () => {
  const res = new Response("{not json", { status: 502, headers: { "content-type": "application/json" } });
  const r = await readJsonSafely(res);
  assert.equal(r.data, null);
  assert.equal(friendlyMessage(r), SERVER_ERROR_MESSAGE);
});

test("a 401 JSON body keeps the server's own message", async () => {
  const r = await readJsonSafely<{ message?: string }>(json(401, { message: "Invalid credentials" }));
  assert.equal(friendlyMessage(r), "Invalid credentials");
});

test("a 200 JSON body is parsed", async () => {
  const r = await readJsonSafely<{ accountType: string }>(json(200, { accountType: "platform" }));
  assert.equal(r.ok, true);
  assert.equal(r.data?.accountType, "platform");
});

test("a 204 has no data and does not throw", async () => {
  const r = await readJsonSafely(new Response(null, { status: 204 }));
  assert.equal(r.ok, true);
  assert.equal(r.data, null);
});

test("an empty 401 falls back to a generic message", async () => {
  const r = await readJsonSafely(new Response("", { status: 401 }));
  assert.equal(friendlyMessage(r), "Invalid credentials");
});

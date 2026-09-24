import assert from "node:assert/strict";
import test from "node:test";
import { getBackendOrigin } from "../src/server/backend-config";

const originalEnvironment = process.env.NODE_ENV;
const originalBackendUrl = process.env.ELOVA_BACKEND_URL;

test.after(() => {
  if (originalEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment;
  if (originalBackendUrl === undefined) delete process.env.ELOVA_BACKEND_URL;
  else process.env.ELOVA_BACKEND_URL = originalBackendUrl;
});

test("production accepts private Tailnet origins and rejects loopback or public origins", () => {
  process.env.NODE_ENV = "production";

  process.env.ELOVA_BACKEND_URL = "http://100.100.10.20:8787";
  assert.equal(getBackendOrigin().origin, "http://100.100.10.20:8787");

  for (const publicUrl of ["http://127.0.0.1:8787", "https://api.example.com", "http://8.8.8.8:8787"]) {
    process.env.ELOVA_BACKEND_URL = publicUrl;
    assert.throws(() => getBackendOrigin(), /Private backend is not configured/);
  }
});

test("local development permits an explicitly configured loopback origin", () => {
  process.env.NODE_ENV = "development";
  process.env.ELOVA_BACKEND_URL = "http://127.0.0.1:8787";
  assert.equal(getBackendOrigin().origin, "http://127.0.0.1:8787");
});

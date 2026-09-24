import assert from "node:assert/strict";
import test from "node:test";
import { getBackendOrigin } from "../src/server/backend-config";

const mutableEnvironment = process.env as Record<string, string | undefined>;
const originalEnvironment = mutableEnvironment.NODE_ENV;
const originalBackendUrl = mutableEnvironment.ELOVA_BACKEND_URL;

test.after(() => {
  if (originalEnvironment === undefined) delete mutableEnvironment.NODE_ENV;
  else mutableEnvironment.NODE_ENV = originalEnvironment;
  if (originalBackendUrl === undefined) delete mutableEnvironment.ELOVA_BACKEND_URL;
  else mutableEnvironment.ELOVA_BACKEND_URL = originalBackendUrl;
});

test("production accepts private Tailnet origins and rejects loopback or public origins", () => {
  mutableEnvironment.NODE_ENV = "production";

  mutableEnvironment.ELOVA_BACKEND_URL = "http://100.100.10.20:3001";
  assert.equal(getBackendOrigin().origin, "http://100.100.10.20:3001");

  for (const publicUrl of ["http://127.0.0.1:3001", "https://api.example.com", "http://8.8.8.8:3001"]) {
    mutableEnvironment.ELOVA_BACKEND_URL = publicUrl;
    assert.throws(() => getBackendOrigin(), /Private backend is not configured/);
  }
});

test("local development permits an explicitly configured loopback origin", () => {
  mutableEnvironment.NODE_ENV = "development";
  mutableEnvironment.ELOVA_BACKEND_URL = "http://127.0.0.1:3001";
  assert.equal(getBackendOrigin().origin, "http://127.0.0.1:3001");
});

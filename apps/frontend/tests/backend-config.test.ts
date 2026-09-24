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

test("production accepts only Tailnet IP and MagicDNS origins", () => {
  mutableEnvironment.NODE_ENV = "production";

  for (const tailnetUrl of [
    "http://100.64.0.1:3001",
    "http://100.127.255.254:3001",
    "http://[fd7a:115c:a1e0::1]:3001",
    "http://gx10:3001",
    "http://gx10.example-tailnet.ts.net:3001",
  ]) {
    mutableEnvironment.ELOVA_BACKEND_URL = tailnetUrl;
    assert.equal(getBackendOrigin().origin, tailnetUrl);
  }

  for (const rejectedUrl of [
    "http://127.0.0.1:3001",
    "http://10.0.0.2:3001",
    "http://172.16.0.2:3001",
    "http://192.168.0.2:3001",
    "http://169.254.0.2:3001",
    "http://100.128.0.1:3001",
    "http://[fd00::1]:3001",
    "http://[fe80::1]:3001",
    "http://gx10.internal:3001",
    "http://gx10.local:3001",
    "http://example-tailnet.ts.net:3001",
    "https://gx10.example-tailnet.ts.net:3001",
    "https://api.example.com:3001",
    "http://8.8.8.8:3001",
  ]) {
    mutableEnvironment.ELOVA_BACKEND_URL = rejectedUrl;
    assert.throws(() => getBackendOrigin(), /Private backend is not configured/);
  }
});

test("local development permits only explicit loopback or Tailnet origins", () => {
  mutableEnvironment.NODE_ENV = "development";
  for (const allowedUrl of [
    "http://127.0.0.1:3001",
    "http://localhost:3001",
    "http://[::1]:3001",
    "http://100.100.10.20:3001",
  ]) {
    mutableEnvironment.ELOVA_BACKEND_URL = allowedUrl;
    assert.equal(getBackendOrigin().origin, allowedUrl);
  }

  for (const rejectedUrl of [
    "http://10.0.0.2:3001",
    "http://192.168.0.2:3001",
    "http://api.example.com:3001",
  ]) {
    mutableEnvironment.ELOVA_BACKEND_URL = rejectedUrl;
    assert.throws(() => getBackendOrigin(), /Private backend is not configured/);
  }

  mutableEnvironment.NODE_ENV = "test";
  mutableEnvironment.ELOVA_BACKEND_URL = "http://127.0.0.1:3001";
  assert.throws(() => getBackendOrigin(), /Private backend is not configured/);
});

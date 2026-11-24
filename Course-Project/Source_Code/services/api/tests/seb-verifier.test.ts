import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeSebHash, verifySebRequest } from "../src/seb-verifier.ts";

describe("PHASE 14: SAFE EXAM BROWSER (SEB) CRYPTOGRAPHIC VERIFICATION", () => {
  const TEST_URL = "http://localhost:3000/student?exam=26ECAC401";
  const MOCK_CONFIG_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const MOCK_BEK = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  test("1. Computes deterministic SHA-256 hash for URL + Key", () => {
    const hash = computeSebHash(TEST_URL, MOCK_CONFIG_KEY);
    assert.equal(hash.length, 64);
    assert.equal(hash, computeSebHash(TEST_URL, MOCK_CONFIG_KEY));
  });

  test("2. Verifies authentic SEB Config Key request header", () => {
    const hash = computeSebHash(TEST_URL, MOCK_CONFIG_KEY);
    const headers = {
      "X-SafeExamBrowser-ConfigKeyHash": hash,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SEB/3.7.0",
    };

    const res = verifySebRequest(headers, TEST_URL, MOCK_CONFIG_KEY, "CONFIG_KEY");
    assert.equal(res.verified, true);
    assert.equal(res.keyType, "CONFIG_KEY");
  });

  test("3. Verifies authentic Browser Exam Key (BEK) request header", () => {
    const hash = computeSebHash(TEST_URL, MOCK_BEK);
    const headers = {
      "X-SafeExamBrowser-RequestHash": hash,
    };

    const res = verifySebRequest(headers, TEST_URL, MOCK_BEK, "BROWSER_EXAM_KEY");
    assert.equal(res.verified, true);
    assert.equal(res.keyType, "BROWSER_EXAM_KEY");
  });

  test("4. Missing header rejects request immediately", () => {
    const headers = {
      "User-Agent": "Chrome/120.0",
    };

    const res = verifySebRequest(headers, TEST_URL, MOCK_CONFIG_KEY, "CONFIG_KEY");
    assert.equal(res.verified, false);
    assert.ok(res.reason?.includes("SEB_HEADER_MISSING"));
  });

  test("5. Tampered URL fails hash verification", () => {
    const hash = computeSebHash(TEST_URL, MOCK_CONFIG_KEY);
    const headers = {
      "X-SafeExamBrowser-ConfigKeyHash": hash,
    };

    const tamperedUrl = "http://localhost:3000/student?exam=OTHER_EXAM";
    const res = verifySebRequest(headers, tamperedUrl, MOCK_CONFIG_KEY, "CONFIG_KEY");
    assert.equal(res.verified, false);
    assert.ok(res.reason?.includes("SEB_HASH_MISMATCH"));
  });

  test("6. Spoofed isSEB flag without cryptographically valid header fails closed", () => {
    const headers = {
      "isSEB": "true",
      "X-Client-Is-SEB": "true",
    };

    const res = verifySebRequest(headers, TEST_URL, MOCK_CONFIG_KEY, "CONFIG_KEY");
    assert.equal(res.verified, false);
  });

  test("7. Malformed non-hex hash fails closed", () => {
    const headers = {
      "X-SafeExamBrowser-ConfigKeyHash": "not-a-valid-sha256-hex-hash",
    };

    const res = verifySebRequest(headers, TEST_URL, MOCK_CONFIG_KEY, "CONFIG_KEY");
    assert.equal(res.verified, false);
    assert.ok(res.reason?.includes("SEB_HASH_MALFORMED"));
  });
});

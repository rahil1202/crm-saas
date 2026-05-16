import dns from "node:dns/promises";
import net from "node:net";

import { AppError } from "@/lib/errors";

/**
 * SSRF-hardened external HTTP client.
 *
 * Use this for every outbound fetch where the destination URL or host is
 * derived from user-controlled input. It blocks the well-known SSRF egress
 * targets (cloud metadata, RFC1918, loopback, link-local, etc.), manually
 * follows redirects (each hop is re-validated), enforces a wall-clock
 * timeout, and caps the response body size while streaming.
 */

// IPv4 ranges that must never be reachable from a user-influenced URL.
// Source: IANA Special-Purpose Address Registry.
const PRIVATE_V4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local incl. cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
  ["255.255.255.255", 32], // broadcast
];

function ipv4ToNumber(ip: string) {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
  );
}

function isPrivateIPv4(ip: string) {
  if (!net.isIPv4(ip)) return true;
  const num = ipv4ToNumber(ip);
  for (const [base, bits] of PRIVATE_V4_RANGES) {
    const baseNum = ipv4ToNumber(base);
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((num & mask) === (baseNum & mask)) {
      return true;
    }
  }
  return false;
}

function expandIPv6(ip: string): number[] | null {
  // Returns 8 16-bit groups, or null if it cannot be parsed.
  const lower = ip.toLowerCase();

  // IPv4-mapped: ::ffff:a.b.c.d -> still IPv6, but tail is dotted-quad.
  const v4MappedMatch = lower.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  let normalized = lower;
  let v4Tail: number[] = [];
  if (v4MappedMatch) {
    const head = v4MappedMatch[1];
    const dotted = v4MappedMatch[2];
    const octets = dotted.split(".").map((o) => Number(o));
    if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return null;
    v4Tail = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
    normalized = head.replace(/:$/, "");
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":").filter((p) => p.length > 0) : [];
  const tail = halves[1] ? halves[1].split(":").filter((p) => p.length > 0) : [];

  const fixed = [...head, ...tail].map((p) => parseInt(p, 16));
  if (fixed.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;

  const targetLen = 8 - v4Tail.length;
  const explicitLen = head.length + tail.length;
  if (halves.length === 1 && explicitLen !== targetLen) return null;
  const padLen = targetLen - explicitLen;
  if (padLen < 0) return null;

  const groups = [
    ...head.map((p) => parseInt(p, 16)),
    ...new Array<number>(padLen).fill(0),
    ...tail.map((p) => parseInt(p, 16)),
    ...v4Tail,
  ];
  return groups.length === 8 ? groups : null;
}

function isPrivateIPv6(ip: string) {
  const groups = expandIPv6(ip);
  if (!groups) return true;

  // ::1 (loopback) and :: (unspecified)
  if (groups.every((g, i) => (i === 7 ? g === 1 : g === 0))) return true;
  if (groups.every((g) => g === 0)) return true;

  const first = groups[0];
  // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfe80) return true;
  // fc00::/7 unique local
  if ((first & 0xfe00) === 0xfc00) return true;
  // ff00::/8 multicast
  if ((first & 0xff00) === 0xff00) return true;

  // IPv4-mapped (::ffff:0:0/96): re-check as v4
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    const a = (groups[6] >> 8) & 0xff;
    const b = groups[6] & 0xff;
    const c = (groups[7] >> 8) & 0xff;
    const d = groups[7] & 0xff;
    return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
  }

  return false;
}

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unknown family — fail closed
}

const FORBIDDEN_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".intranet", ".home"];

async function assertHostnamePublic(hostname: string) {
  if (!hostname) {
    throw AppError.badRequest("URL host is missing");
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw AppError.badRequest("URL host resolves to a non-public address");
    }
    return;
  }

  const lower = hostname.toLowerCase();
  if (lower === "localhost") {
    throw AppError.badRequest("URL host is not allowed");
  }
  for (const suffix of FORBIDDEN_HOST_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      throw AppError.badRequest("URL host is not allowed");
    }
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw AppError.badRequest("URL host could not be resolved");
  }

  if (resolved.length === 0) {
    throw AppError.badRequest("URL host could not be resolved");
  }

  for (const entry of resolved) {
    if (isPrivateIp(entry.address)) {
      throw AppError.badRequest("URL host resolves to a non-public address");
    }
  }
}

export interface SafeFetchOptions {
  /** Hard cap on response body size in bytes. Default: 50 MB. */
  maxBytes?: number;
  /** Wall-clock timeout in milliseconds. Default: 15 s. */
  timeoutMs?: number;
  /** Maximum number of redirect hops to follow. Default: 3. */
  maxRedirects?: number;
  /** Allowed URL protocols. Default: ["https:"]. */
  allowedProtocols?: string[];
}

export interface SafeFetchResult {
  status: number;
  ok: boolean;
  headers: Headers;
  body: Buffer;
  finalUrl: string;
}

const DEFAULTS: Required<SafeFetchOptions> = {
  maxBytes: 50 * 1024 * 1024,
  timeoutMs: 15_000,
  maxRedirects: 3,
  allowedProtocols: ["https:"],
};

/**
 * Fetch an external URL with SSRF protections. Always returns the buffered
 * body — for very large downloads, set `maxBytes` accordingly or use a
 * dedicated streaming pipeline.
 */
export async function safeExternalFetch(
  rawUrl: string,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const { maxBytes, timeoutMs, maxRedirects, allowedProtocols } = { ...DEFAULTS, ...options };

  let currentUrl = rawUrl;
  let redirects = 0;

  for (;;) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw AppError.badRequest("Invalid URL");
    }

    if (!allowedProtocols.includes(parsed.protocol)) {
      throw AppError.badRequest(`URL protocol ${parsed.protocol} is not allowed`);
    }
    // Block embedded credentials — they let attackers bypass logs and target oddly-resolving hosts.
    if (parsed.username || parsed.password) {
      throw AppError.badRequest("URL credentials are not allowed");
    }

    await assertHostnamePublic(parsed.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === "AbortError") {
        throw AppError.badRequest("Remote request timed out");
      }
      throw AppError.badRequest("Unable to reach remote host");
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400 && response.status !== 304) {
      const location = response.headers.get("location");
      // Drain so the connection can be reused.
      try { await response.arrayBuffer(); } catch { /* ignore */ }
      if (!location) {
        throw AppError.badRequest("Redirect response missing Location header");
      }
      redirects += 1;
      if (redirects > maxRedirects) {
        throw AppError.badRequest("Too many redirects");
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw AppError.payloadTooLarge("Remote response exceeds maximum size", { maxBytes });
    }

    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw AppError.payloadTooLarge("Remote response exceeds maximum size", { maxBytes });
        }
        chunks.push(value);
      }
    }

    const body = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));

    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      body,
      finalUrl: currentUrl,
    };
  }
}

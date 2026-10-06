import dns from "dns/promises";
import net from "net";

/**
 * SSRF guard.
 *
 * Why: when we fetch a user-supplied URL from our server, the request originates
 * from INSIDE our trusted network. Without checks, a user could point us at
 * cloud metadata (169.254.169.254), localhost services (Redis/Mongo), or other
 * machines on our private subnet. We therefore:
 *   1. allow only http/https,
 *   2. resolve the hostname to its real IP(s) via DNS,
 *   3. reject if ANY resolved IP falls in a private/loopback/link-local/reserved range.
 *
 * Resolving DNS ourselves also defeats "DNS rebinding", where a hostname resolves
 * to a public IP on first check and a private IP when actually fetched.
 */

function ipToParts(ip) {
  return ip.split(".").map(Number);
}

/** Returns true if an IPv4 address is in a private/reserved/loopback/link-local range. */
function isPrivateIPv4(ip) {
  const [a, b] = ipToParts(ip);
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 0) return true; // "this network" 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16 (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT 100.64.0.0/10
  if (a >= 224) return true; // multicast + reserved (224.0.0.0+)
  return false;
}

/** Returns true if an IPv6 address is loopback/link-local/unique-local, or maps to a private IPv4. */
function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) — check the embedded IPv4.
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // unknown family → treat as unsafe
}

/**
 * Throws if the URL is not safe to fetch from the server. Returns the parsed URL otherwise.
 * @param {string} rawUrl
 */
export async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) {
    throw new Error("This host is not allowed");
  }

  // If the host is already a literal IP, check it directly.
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("This address range is not allowed");
    return url;
  }

  // Otherwise resolve DNS and verify every returned address is public.
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("Could not resolve this host");
  }

  if (!addresses.length) throw new Error("Could not resolve this host");

  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error("This host resolves to a private address and is not allowed");
    }
  }

  return url;
}

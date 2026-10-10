// 挑出手机真正能连上的局域网地址。
//
// 之前只是把所有非回环 IPv4 都列出来，结果把 "198.18.0.1"（VPN / TUN 虚拟网卡的
// 基准测试网段）也当成"手机地址"打印，而实测从浏览器访问它连界面都渲染不出来。
// 这里只保留 RFC1918 私有网段，并显式排除链路本地与虚拟网卡常见网段。
import { networkInterfaces } from "node:os";

function toOctets(address) {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

export function isPrivateLanAddress(address) {
  const octets = toOctets(address);
  if (!octets) return false;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

// 明确要跳过的：链路本地、CGNAT、以及会出现在 VPN/TUN 网卡上的基准测试网段
export function isLikelyVirtual(address) {
  const octets = toOctets(address);
  if (!octets) return true;
  const [a, b] = octets;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking (常见于 TUN)
  if (a === 0) return true;
  return false;
}

/** 返回可直接给手机用的地址；按"最可能是真实网卡"排序。 */
export function lanAddresses() {
  const found = new Set();
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (isLikelyVirtual(addr.address)) continue;
      if (!isPrivateLanAddress(addr.address)) continue;
      found.add(addr.address);
    }
  }
  return [...found].sort();
}

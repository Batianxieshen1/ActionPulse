import { describe, expect, it } from "vitest";
import { isLikelyVirtual, isPrivateLanAddress } from "../server/lan.mjs";

/**
 * 回归守卫：启动横幅曾经把所有非回环 IPv4 都当成"手机地址"打印，
 * 结果把 VPN/TUN 虚拟网卡的 198.18.0.1 也列了出来 —— 实测从浏览器访问它连界面都渲染不出来。
 */
describe("isPrivateLanAddress", () => {
  it("接受 RFC1918 三段私有网段", () => {
    expect(isPrivateLanAddress("10.0.0.5")).toBe(true);
    expect(isPrivateLanAddress("172.16.0.1")).toBe(true);
    expect(isPrivateLanAddress("172.31.255.254")).toBe(true);
    expect(isPrivateLanAddress("192.168.1.10")).toBe(true);
  });

  it("拒绝公网地址", () => {
    expect(isPrivateLanAddress("8.8.8.8")).toBe(false);
    expect(isPrivateLanAddress("1.1.1.1")).toBe(false);
    expect(isPrivateLanAddress("172.32.0.1")).toBe(false);
    expect(isPrivateLanAddress("172.15.0.1")).toBe(false);
  });

  it("拒绝回环与虚拟网段", () => {
    expect(isPrivateLanAddress("127.0.0.1")).toBe(false);
    expect(isPrivateLanAddress("198.18.0.1")).toBe(false);
    expect(isPrivateLanAddress("169.254.1.1")).toBe(false);
  });

  it("对畸形输入返回 false 而不是崩溃", () => {
    expect(isPrivateLanAddress("")).toBe(false);
    expect(isPrivateLanAddress("10.0.0")).toBe(false);
    expect(isPrivateLanAddress("10.0.0.999")).toBe(false);
    expect(isPrivateLanAddress("not-an-ip")).toBe(false);
  });
});

describe("isLikelyVirtual", () => {
  it("识别出 TUN / VPN 常见的基准测试网段（就是它导致了那个错误的横幅）", () => {
    expect(isLikelyVirtual("198.18.0.1")).toBe(true);
    expect(isLikelyVirtual("198.19.5.5")).toBe(true);
  });

  it("识别链路本地与 CGNAT", () => {
    expect(isLikelyVirtual("169.254.10.20")).toBe(true);
    expect(isLikelyVirtual("100.64.0.1")).toBe(true);
  });

  it("正常的家庭局域网地址不算虚拟", () => {
    expect(isLikelyVirtual("192.168.1.10")).toBe(false);
    expect(isLikelyVirtual("192.168.1.50")).toBe(false);
    expect(isLikelyVirtual("172.20.3.4")).toBe(false);
  });
});

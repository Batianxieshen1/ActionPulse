// server/*.mjs 是纯 JS，没有类型声明。这份声明只描述 lan.mjs 的对外契约，
// 让 TypeScript 测试可以静态 import 它（顺带让契约本身可读）。
export declare function isPrivateLanAddress(address: string): boolean;
export declare function isLikelyVirtual(address: string): boolean;
export declare function lanAddresses(): string[];

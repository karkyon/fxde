export declare const API_PREFIX = "/api/v1";
export declare const USER_ROLES: readonly ["FREE", "BASIC", "PRO", "PRO_PLUS", "ADMIN"];
export declare const ROLE_HIERARCHY: Record<string, number>;
export declare const TIMEFRAMES: readonly ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"];
export type Timeframe = (typeof TIMEFRAMES)[number];
export declare const DEFAULT_PAGINATION: {
    page: number;
    limit: number;
    maxLimit: number;
};
export declare const DEFAULT_TIMEZONE = "UTC";
//# sourceMappingURL=index.d.ts.map
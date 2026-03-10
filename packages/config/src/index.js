"use strict";
// ============================================================
// FXDE v5.1 — Shared Configuration
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TIMEZONE = exports.DEFAULT_PAGINATION = exports.TIMEFRAMES = exports.ROLE_HIERARCHY = exports.USER_ROLES = exports.API_PREFIX = void 0;
exports.API_PREFIX = '/api/v1';
exports.USER_ROLES = ['FREE', 'BASIC', 'PRO', 'PRO_PLUS', 'ADMIN'];
exports.ROLE_HIERARCHY = {
    FREE: 0,
    BASIC: 1,
    PRO: 2,
    PRO_PLUS: 3,
    ADMIN: 99,
};
exports.TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
exports.DEFAULT_PAGINATION = {
    page: 1,
    limit: 20,
    maxLimit: 100,
};
exports.DEFAULT_TIMEZONE = 'UTC';
//# sourceMappingURL=index.js.map
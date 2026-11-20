export const AUTH_ERRORS = {
    MISSING_TOKEN: 'AUTH-VAL-002 - Access token not provided.',
    TOKEN_NOT_FOUND: 'AUTH-VAL-003 - Access token not found in cache.',
    TOKEN_MISMATCH: 'AUTH-VAL-004 - Invalid access token.',
    INVALID_TOKEN: 'AUTH-VAL-005 - Invalid token, please log in again.',
    TERMS_REQUIRED: 'TERMS-VAL-002 - Terms acceptance required.',
    CACHE_UNAVAILABLE: 'CACHE-VAL-001 - Cache service unavailable.',
} as const;

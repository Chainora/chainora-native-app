export const DEFAULT_AUTH_TEMPLATE = 'Sign this to login to Chainora: %s';
export const REQUEST_TIMEOUT_MS = 12_000;
export const PRECHECK_DIAG_TIMEOUT_MS = 5_000;
export const PRECHECK_SIMULATE_TIMEOUT_MS = 3_500;
export const RECEIPT_WAIT_TIMEOUT_MS = 240_000;
export const RECEIPT_POLL_INTERVAL_MS = 1_200;
export const RECEIPT_TIMEOUT_RETRY_LIMIT = 4;
export const RECEIPT_RETRY_DELAY_MS = 1_000;

export const CREATE_POOL_QR_FEATURE = 'chainora-native-wallet:create-pool';
export const POOL_ACTION_QR_FEATURE = 'chainora-native-wallet:pool-action';

export const DEVICE_NOT_VERIFIED_MESSAGE = 'Create pool blocked: this wallet is not device-verified on protocol adapter yet.';
export const DEVICE_VERIFY_CACHE_TTL_MS = 30 * 60 * 1000;
export const CREATE_POOL_RPC_TIMEOUT_MESSAGE =
  'Create pool pre-check timed out because Chainora RPC is responding too slowly. Please retry shortly.';
export const CREATE_POOL_PRECHECK_CONTINUE_STATUS = 'create_pool_precheck_timeout_continue';

import { REQUEST_TIMEOUT_MS } from './constants';

export const normalizeApiBase = (apiBase: string): string => {
  const trimmed = apiBase.trim();
  if (!trimmed) {
    throw new Error('Missing apiBase in QR payload');
  }
  const url = new URL(trimmed);
  return `${url.protocol}//${url.host}`;
};

export const sanitizeRelayerErrorMessage = (raw: string): string => {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return '';
  }

  const usageIndex = trimmed.indexOf('Usage:');
  if (usageIndex > 0) {
    return trimmed.slice(0, usageIndex).trim();
  }

  return trimmed;
};

export const readApiErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  const text = (await response.text()).trim();
  if (!text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string; data?: { error?: string; message?: string } };
    const detail = String(
      parsed?.error ?? parsed?.message ?? parsed?.data?.error ?? parsed?.data?.message ?? text,
    ).trim();
    return sanitizeRelayerErrorMessage(detail) || fallback;
  } catch {
    return sanitizeRelayerErrorMessage(text) || fallback;
  }
};

export const fetchWithTimeout = async (input: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    let hint = '';
    try {
      const parsed = new URL(input);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        hint = ' If using a real phone, localhost points to the phone itself. Use your laptop LAN IP as apiBase.';
      }
    } catch {
      // Ignore URL parsing failures.
    }

    throw new Error(`Network request failed for ${input}. ${reason}.${hint}`);
  } finally {
    clearTimeout(timer);
  }
};

export const ensureField = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid QR payload: ${field} is required`);
  }
  return value.trim();
};

export const extractResponseData = <T extends object>(raw: { data?: T } | T): T => {
  if (raw && typeof raw === 'object' && 'data' in raw && raw.data) {
    return raw.data;
  }

  return raw as T;
};

import type { NotifyLoginProgressRequest } from './qrTypes';

// Session progress publishing is shared across all QR features.
export const notifyQrLoginProgress = async ({
  apiBase,
  sessionId,
  status,
}: NotifyLoginProgressRequest): Promise<void> => {
  const endpoint = `${apiBase}/v1/auth/progress`;

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        status,
      }),
    });
  } catch (error) {
    console.warn('[QRLogin] progress notify failed', {
      endpoint,
      sessionId,
      status,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
};

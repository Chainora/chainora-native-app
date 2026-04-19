import { FACTORY_READ_ABI, REGISTRY_READ_ABI } from './qr-login/abi';
import { createStatusPublisher } from './qr-login/statusPublisher';
import { notifyQrLoginProgress } from './qrSessionProgressService';
import { getPublicViemClient } from './web3Client';

const QR_FLOW_CANCELLED_ERROR_MESSAGE = 'QR flow cancelled by user before main transaction submission.';

export const isQrFlowCancelledError = (error: unknown): boolean =>
  error instanceof Error && error.message === QR_FLOW_CANCELLED_ERROR_MESSAGE;

export const throwIfQrFlowCancelled = (isCancelled?: () => boolean): void => {
  if (isCancelled?.()) {
    throw new Error(QR_FLOW_CANCELLED_ERROR_MESSAGE);
  }
};

export const resolveRegistryAndDeviceAdapter = async ({
  client,
  factoryAddress,
}: {
  client: ReturnType<typeof getPublicViemClient>;
  factoryAddress: `0x${string}`;
}): Promise<{ registryAddress: `0x${string}`; deviceAdapterAddress: `0x${string}` }> => {
  const registryAddress = await client.readContract({
    address: factoryAddress,
    abi: FACTORY_READ_ABI,
    functionName: 'registry',
  });

  const deviceAdapterAddress = await client.readContract({
    address: registryAddress,
    abi: REGISTRY_READ_ABI,
    functionName: 'deviceAdapter',
  });

  return {
    registryAddress,
    deviceAdapterAddress,
  };
};

export const createSessionStatusPublisher = ({
  apiBase,
  sessionId,
  enabled = true,
  minIntervalMs = 250,
}: {
  apiBase: string;
  sessionId: string;
  enabled?: boolean;
  minIntervalMs?: number;
}) => {
  return createStatusPublisher({
    enabled: enabled && Boolean(sessionId) && Boolean(apiBase),
    minIntervalMs,
    publish: status => {
      if (!sessionId || !apiBase) {
        return;
      }
      void notifyQrLoginProgress({
        apiBase,
        sessionId,
        status,
      }).catch(() => undefined);
    },
  });
};

import {
  DEVICE_ADAPTER_READ_ABI,
  FACTORY_READ_ABI,
  REGISTRY_READ_ABI,
  REPUTATION_ADAPTER_READ_ABI,
  ZERO_ADDRESS,
} from './qr-login/abi';
import { DEVICE_NOT_VERIFIED_MESSAGE } from './qr-login/constants';
import { getPublicViemClient } from './web3Client';

export const diagnoseCreatePoolPrecheck = async ({
  client,
  factoryAddress,
  accountAddress,
  minReputation,
}: {
  client: ReturnType<typeof getPublicViemClient>;
  factoryAddress: `0x${string}`;
  accountAddress: `0x${string}`;
  minReputation: bigint;
}): Promise<string | null> => {
  try {
    const registryAddress = await client.readContract({
      address: factoryAddress,
      abi: FACTORY_READ_ABI,
      functionName: 'registry',
    });
    const [stablecoinAddress, deviceAdapterAddress, reputationAdapterAddress] = await Promise.all([
      client.readContract({
        address: registryAddress,
        abi: REGISTRY_READ_ABI,
        functionName: 'stablecoin',
      }),
      client.readContract({
        address: registryAddress,
        abi: REGISTRY_READ_ABI,
        functionName: 'deviceAdapter',
      }),
      client.readContract({
        address: registryAddress,
        abi: REGISTRY_READ_ABI,
        functionName: 'reputationAdapter',
      }),
    ]);

    if (stablecoinAddress.toLowerCase() === ZERO_ADDRESS) {
      return 'Create pool blocked: protocol registry stablecoin is not configured.';
    }

    if (deviceAdapterAddress.toLowerCase() === ZERO_ADDRESS) {
      return null;
    }

    const isVerified = await client.readContract({
      address: deviceAdapterAddress,
      abi: DEVICE_ADAPTER_READ_ABI,
      functionName: 'isDeviceVerified',
      args: [accountAddress],
    });

    if (!isVerified) {
      return DEVICE_NOT_VERIFIED_MESSAGE;
    }

    if (minReputation > 0n && reputationAdapterAddress.toLowerCase() !== ZERO_ADDRESS) {
      const currentScore = await client.readContract({
        address: reputationAdapterAddress,
        abi: REPUTATION_ADAPTER_READ_ABI,
        functionName: 'scoreOf',
        args: [accountAddress],
      });

      if (currentScore < minReputation) {
        return `Create pool blocked: wallet reputation score (${currentScore.toString()}) must be greater than or equal to minReputation (${minReputation.toString()}).`;
      }
    }

    return null;
  } catch {
    return null;
  }
};

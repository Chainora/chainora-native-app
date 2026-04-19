import {
  DEVICE_ADAPTER_READ_ABI,
  POOL_READ_ABI,
  REGISTRY_READ_ABI,
  REPUTATION_ADAPTER_READ_ABI,
  ZERO_ADDRESS,
} from './qr-login/abi';
import { getPublicViemClient } from './web3Client';

export const diagnoseSubmitJoinRequestPrecheck = async ({
  client,
  poolAddress,
  accountAddress,
}: {
  client: ReturnType<typeof getPublicViemClient>;
  poolAddress: `0x${string}`;
  accountAddress: `0x${string}`;
}): Promise<string | null> => {
  try {
    const [poolStatus, publicRecruitment, isActiveMember, minReputation, registryAddress] = await Promise.all([
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'poolStatus',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'publicRecruitment',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'isActiveMember',
        args: [accountAddress],
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'minReputation',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'registry',
      }),
    ]);

    if (Number(poolStatus) !== 0) {
      return 'Join request blocked: this group is no longer in Forming state.';
    }

    if (!publicRecruitment) {
      return 'Join request blocked: this group is private and only accepts invite proposals.';
    }

    if (isActiveMember) {
      return 'Join request blocked: this wallet is already an active member of the group.';
    }

    const [deviceAdapterAddress, reputationAdapterAddress] = await Promise.all([
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

    if (deviceAdapterAddress.toLowerCase() !== ZERO_ADDRESS) {
      const isVerified = await client.readContract({
        address: deviceAdapterAddress,
        abi: DEVICE_ADAPTER_READ_ABI,
        functionName: 'isDeviceVerified',
        args: [accountAddress],
      });

      if (!isVerified) {
        return 'Join request blocked: this wallet is not device-verified on protocol adapter yet.';
      }
    }

    if (minReputation > 0n && reputationAdapterAddress.toLowerCase() !== ZERO_ADDRESS) {
      const currentScore = await client.readContract({
        address: reputationAdapterAddress,
        abi: REPUTATION_ADAPTER_READ_ABI,
        functionName: 'scoreOf',
        args: [accountAddress],
      });

      if (currentScore < minReputation) {
        return `Join request blocked: wallet reputation score (${currentScore.toString()}) must be greater than or equal to minReputation (${minReputation.toString()}).`;
      }
    }

    return null;
  } catch {
    return null;
  }
};

export const diagnoseProposeInvitePrecheck = async ({
  client,
  poolAddress,
  accountAddress,
  candidateAddress,
}: {
  client: ReturnType<typeof getPublicViemClient>;
  poolAddress: `0x${string}`;
  accountAddress: `0x${string}`;
  candidateAddress: `0x${string}`;
}): Promise<string | null> => {
  try {
    if (candidateAddress.toLowerCase() === ZERO_ADDRESS) {
      return 'Invite blocked: candidate wallet address is zero address.';
    }

    const [poolStatus, proposerIsActive, candidateIsActive, minReputation, registryAddress] = await Promise.all([
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'poolStatus',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'isActiveMember',
        args: [accountAddress],
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'isActiveMember',
        args: [candidateAddress],
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'minReputation',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'registry',
      }),
    ]);

    if (Number(poolStatus) !== 0) {
      return 'Invite blocked: this group is no longer in Forming state.';
    }

    if (!proposerIsActive) {
      return 'Invite blocked: only active members can propose invites.';
    }

    if (accountAddress.toLowerCase() === candidateAddress.toLowerCase()) {
      return 'Invite blocked: you cannot invite your own wallet.';
    }

    if (candidateIsActive) {
      return 'Invite blocked: candidate is already an active member of this group.';
    }

    const [deviceAdapterAddress, reputationAdapterAddress] = await Promise.all([
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

    if (deviceAdapterAddress.toLowerCase() !== ZERO_ADDRESS) {
      const isVerified = await client.readContract({
        address: deviceAdapterAddress,
        abi: DEVICE_ADAPTER_READ_ABI,
        functionName: 'isDeviceVerified',
        args: [candidateAddress],
      });

      if (!isVerified) {
        return 'Invite blocked: candidate wallet is not device-verified on protocol adapter yet.';
      }
    }

    if (minReputation > 0n && reputationAdapterAddress.toLowerCase() !== ZERO_ADDRESS) {
      const candidateScore = await client.readContract({
        address: reputationAdapterAddress,
        abi: REPUTATION_ADAPTER_READ_ABI,
        functionName: 'scoreOf',
        args: [candidateAddress],
      });

      if (candidateScore < minReputation) {
        return `Invite blocked: candidate reputation score (${candidateScore.toString()}) must be greater than or equal to minReputation (${minReputation.toString()}).`;
      }
    }

    return null;
  } catch {
    return null;
  }
};

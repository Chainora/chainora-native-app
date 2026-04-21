import { getAddress } from 'viem';

import { POOL_READ_ABI } from './qr-login/abi';
import { getPublicViemClient } from './web3Client';

const toBigIntSafe = (value: unknown): bigint => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  return 0n;
};

const readMemberListWithFallback = async ({
  client,
  poolAddress,
}: {
  client: ReturnType<typeof getPublicViemClient>;
  poolAddress: `0x${string}`;
}): Promise<`0x${string}`[]> => {
  let lastError: unknown = null;

  try {
    const activeMembersRead = await client.readContract({
      address: poolAddress,
      abi: POOL_READ_ABI,
      functionName: 'activeMembers',
    });
    if (Array.isArray(activeMembersRead)) {
      return activeMembersRead
        .map(member => getAddress(member))
        .filter(Boolean) as `0x${string}`[];
    }
  } catch (error) {
    lastError = error;
  }

  try {
    const membersRead = await client.readContract({
      address: poolAddress,
      abi: POOL_READ_ABI,
      functionName: 'members',
    });
    if (!Array.isArray(membersRead)) {
      return [];
    }

    const normalizedMembers = membersRead
      .map(member => getAddress(member))
      .filter(Boolean) as `0x${string}`[];
    if (normalizedMembers.length === 0) {
      return [];
    }

    const activeFlags = await Promise.all(
      normalizedMembers.map(async member => {
        try {
          const active = await client.readContract({
            address: poolAddress,
            abi: POOL_READ_ABI,
            functionName: 'isActiveMember',
            args: [member],
          });
          return Boolean(active);
        } catch {
          return false;
        }
      }),
    );

    return normalizedMembers.filter((_, index) => activeFlags[index]);
  } catch (error) {
    lastError = error;
  }

  if (lastError) {
    throw lastError;
  }
  return [];
};

export const diagnoseSubmitDiscountBidPrecheck = async ({
  client,
  poolAddress,
  accountAddress,
  discountWei,
}: {
  client: ReturnType<typeof getPublicViemClient>;
  poolAddress: `0x${string}`;
  accountAddress: `0x${string}`;
  discountWei: bigint;
}): Promise<string | null> => {
  try {
    const [poolStatus, isActiveMember, cycleCompleted, cycleId, periodId] = await Promise.all([
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
        functionName: 'cycleCompleted',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'currentCycle',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'currentPeriod',
      }),
    ]);

    if (Number(poolStatus) !== 1) {
      return 'Bid blocked: group is not Active.';
    }

    if (!isActiveMember) {
      return 'Bid blocked: only active members can submit discount bids.';
    }

    if (cycleCompleted) {
      return 'Bid blocked: current cycle is already completed.';
    }

    const [hasReceivedInCycle, periodInfo] = await Promise.all([
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'hasReceivedInCycle',
        args: [cycleId, accountAddress],
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'periodInfo',
        args: [cycleId, periodId],
      }),
    ]);

    if (hasReceivedInCycle) {
      return 'Bid blocked: this wallet already received payout in current cycle and is not eligible to bid.';
    }

    const periodStatus = Number(Array.isArray(periodInfo) ? periodInfo[0] : 0);
    const contributionDeadline = toBigIntSafe(Array.isArray(periodInfo) ? periodInfo[2] : 0n);
    const auctionDeadline = toBigIntSafe(Array.isArray(periodInfo) ? periodInfo[3] : 0n);
    const bestDiscount = toBigIntSafe(Array.isArray(periodInfo) ? periodInfo[6] : 0n);
    const totalContributed = toBigIntSafe(Array.isArray(periodInfo) ? periodInfo[7] : 0n);
    const nowUnix = BigInt(Math.floor(Date.now() / 1000));

    if (periodStatus === 0) {
      if (contributionDeadline > 0n && nowUnix < contributionDeadline) {
        return 'Bid blocked: auction has not started yet (waiting for contribution deadline).';
      }

      const activeMembers = await readMemberListWithFallback({
        client,
        poolAddress,
      });

      if (activeMembers.length > 0) {
        const contributedStates = await Promise.all(
          activeMembers.map(member => client.readContract({
            address: poolAddress,
            abi: POOL_READ_ABI,
            functionName: 'hasContributed',
            args: [cycleId, periodId, member],
          })),
        );
        const missingContribution = contributedStates.some(contributed => !contributed);
        if (missingContribution) {
          return 'Bid blocked: not all active members have contributed yet, so auction cannot open.';
        }
      }
    } else if (periodStatus !== 1) {
      return 'Bid blocked: this period is not in auction phase.';
    }

    if (auctionDeadline > 0n && nowUnix >= auctionDeadline) {
      return 'Bid blocked: auction deadline has passed. Please close auction.';
    }

    if (discountWei <= bestDiscount) {
      return `Bid blocked: discount must be greater than current best discount (${bestDiscount.toString()}).`;
    }

    if (totalContributed > 0n && discountWei >= totalContributed) {
      return `Bid blocked: discount must be lower than total contributed (${totalContributed.toString()}).`;
    }

    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `Bid pre-check failed due RPC/read error: ${reason}. Please retry QR signing in a few seconds.`;
  }
};

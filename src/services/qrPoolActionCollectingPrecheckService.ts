import {
  ERC20_READ_ABI,
  POOL_READ_ABI,
  ZERO_ADDRESS,
} from './qr-login/abi';
import { getPublicViemClient } from './web3Client';

export type ContributePrecheckResult = {
  blockedReason: string | null;
  needsApproval: boolean;
  stablecoinAddress: `0x${string}` | null;
  contributionAmount: bigint | null;
  allowance: bigint | null;
  balance: bigint | null;
  cycleId: bigint | null;
  periodId: bigint | null;
  contributionDeadline: bigint | null;
};

export const diagnoseContributePrecheck = async ({
  client,
  poolAddress,
  accountAddress,
}: {
  client: ReturnType<typeof getPublicViemClient>;
  poolAddress: `0x${string}`;
  accountAddress: `0x${string}`;
}): Promise<ContributePrecheckResult> => {
  const fallback = (blockedReason: string | null): ContributePrecheckResult => ({
    blockedReason,
    needsApproval: false,
    stablecoinAddress: null,
    contributionAmount: null,
    allowance: null,
    balance: null,
    cycleId: null,
    periodId: null,
    contributionDeadline: null,
  });

  try {
    const [
      poolStatus,
      isActiveMember,
      cycleCompleted,
      stablecoinAddress,
      contributionAmount,
      cycleId,
      periodId,
    ] = await Promise.all([
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
        functionName: 'stablecoin',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'contributionAmount',
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
      return fallback('Contribute blocked: group is not Active yet.');
    }

    if (!isActiveMember) {
      return fallback('Contribute blocked: only active members can contribute.');
    }

    if (cycleCompleted) {
      return fallback('Contribute blocked: current cycle has completed and no longer accepts contributions.');
    }

    if (stablecoinAddress.toLowerCase() === ZERO_ADDRESS) {
      return fallback('Contribute blocked: group stablecoin is not configured.');
    }

    const [periodInfo, hasContributed, allowance, balance] = await Promise.all([
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'periodInfo',
        args: [cycleId, periodId],
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'hasContributed',
        args: [cycleId, periodId, accountAddress],
      }),
      client.readContract({
        address: stablecoinAddress,
        abi: ERC20_READ_ABI,
        functionName: 'allowance',
        args: [accountAddress, poolAddress],
      }),
      client.readContract({
        address: stablecoinAddress,
        abi: ERC20_READ_ABI,
        functionName: 'balanceOf',
        args: [accountAddress],
      }),
    ]);

    const periodStatusRaw = Array.isArray(periodInfo) ? periodInfo[0] : 0;
    const contributionDeadlineRaw = Array.isArray(periodInfo) ? periodInfo[2] : 0n;
    const periodStatus = Number(periodStatusRaw);
    const contributionDeadline = typeof contributionDeadlineRaw === 'bigint'
      ? contributionDeadlineRaw
      : BigInt(Number(contributionDeadlineRaw ?? 0));
    const nowUnix = BigInt(Math.floor(Date.now() / 1000));

    if (periodStatus !== 0) {
      return {
        blockedReason: 'Contribute blocked: this period is not in collecting phase.',
        needsApproval: false,
        stablecoinAddress,
        contributionAmount,
        allowance,
        balance,
        cycleId,
        periodId,
        contributionDeadline,
      };
    }

    if (contributionDeadline > 0n && nowUnix > contributionDeadline) {
      return {
        blockedReason: 'Contribute blocked: contribution deadline has already passed.',
        needsApproval: false,
        stablecoinAddress,
        contributionAmount,
        allowance,
        balance,
        cycleId,
        periodId,
        contributionDeadline,
      };
    }

    if (hasContributed) {
      return {
        blockedReason: 'Contribute blocked: this wallet already contributed for current period.',
        needsApproval: false,
        stablecoinAddress,
        contributionAmount,
        allowance,
        balance,
        cycleId,
        periodId,
        contributionDeadline,
      };
    }

    if (balance < contributionAmount) {
      return {
        blockedReason:
          `Contribute blocked: stablecoin balance is too low. `
          + `Required ${contributionAmount.toString()}, current ${balance.toString()}.`,
        needsApproval: false,
        stablecoinAddress,
        contributionAmount,
        allowance,
        balance,
        cycleId,
        periodId,
        contributionDeadline,
      };
    }

    return {
      blockedReason: null,
      needsApproval: allowance < contributionAmount,
      stablecoinAddress,
      contributionAmount,
      allowance,
      balance,
      cycleId,
      periodId,
      contributionDeadline,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fallback(
      `Contribute pre-check failed due RPC/read error: ${reason}. `
      + 'Please retry QR signing in a few seconds.',
    );
  }
};

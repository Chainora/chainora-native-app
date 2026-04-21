export const FACTORY_CREATE_POOL_ABI = [
  {
    type: 'function',
    name: 'createPool',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'config',
        type: 'tuple',
        components: [
          { name: 'contributionAmount', type: 'uint256' },
          { name: 'minReputation', type: 'uint256' },
          { name: 'targetMembers', type: 'uint16' },
          { name: 'periodDuration', type: 'uint32' },
          { name: 'contributionWindow', type: 'uint32' },
          { name: 'auctionWindow', type: 'uint32' },
        ],
      },
    ],
    outputs: [
      { name: 'pool', type: 'address' },
      { name: 'poolId', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'createPool',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'config',
        type: 'tuple',
        components: [
          { name: 'contributionAmount', type: 'uint256' },
          { name: 'minReputation', type: 'uint256' },
          { name: 'targetMembers', type: 'uint16' },
          { name: 'periodDuration', type: 'uint32' },
          { name: 'contributionWindow', type: 'uint32' },
          { name: 'auctionWindow', type: 'uint32' },
        ],
      },
      { name: 'publicRecruitment', type: 'bool' },
    ],
    outputs: [
      { name: 'pool', type: 'address' },
      { name: 'poolId', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'ChainoraPoolCreated',
    inputs: [
      { indexed: true, name: 'poolId', type: 'uint256' },
      { indexed: true, name: 'pool', type: 'address' },
      { indexed: true, name: 'creator', type: 'address' },
    ],
    anonymous: false,
  },
] as const;

export const FACTORY_READ_ABI = [
  {
    type: 'function',
    name: 'registry',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

export const POOL_READ_ABI = [
  {
    type: 'function',
    name: 'poolStatus',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'publicRecruitment',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isActiveMember',
    stateMutability: 'view',
    inputs: [{ name: 'member', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'minReputation',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'registry',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'stablecoin',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'contributionAmount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'currentCycle',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'currentPeriod',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'cycleCompleted',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'hasContributed',
    stateMutability: 'view',
    inputs: [
      { name: 'cycleId', type: 'uint256' },
      { name: 'periodId', type: 'uint256' },
      { name: 'member', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'hasReceivedInCycle',
    stateMutability: 'view',
    inputs: [
      { name: 'cycleId', type: 'uint256' },
      { name: 'member', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'activeMembers',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'members',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'periodInfo',
    stateMutability: 'view',
    inputs: [
      { name: 'cycleId', type: 'uint256' },
      { name: 'periodId', type: 'uint256' },
    ],
    outputs: [
      { name: 'status', type: 'uint8' },
      { name: 'startAt', type: 'uint64' },
      { name: 'contributionDeadline', type: 'uint64' },
      { name: 'auctionDeadline', type: 'uint64' },
      { name: 'recipient', type: 'address' },
      { name: 'bestBidder', type: 'address' },
      { name: 'bestDiscount', type: 'uint256' },
      { name: 'totalContributed', type: 'uint256' },
      { name: 'payoutAmount', type: 'uint256' },
      { name: 'payoutClaimed', type: 'bool' },
      { name: 'reputationSnapshotId', type: 'bytes32' },
    ],
  },
] as const;

export const REGISTRY_READ_ABI = [
  {
    type: 'function',
    name: 'stablecoin',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'deviceAdapter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'reputationAdapter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

export const DEVICE_ADAPTER_READ_ABI = [
  {
    type: 'function',
    name: 'isDeviceVerified',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const DEVICE_ADAPTER_WRITE_ABI = [
  {
    type: 'function',
    name: 'submitVerification',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'attestation',
        type: 'tuple',
        components: [
          { name: 'user', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint64' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

export const REPUTATION_ADAPTER_READ_ABI = [
  {
    type: 'function',
    name: 'scoreOf',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const ERC20_READ_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const ERC20_WRITE_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

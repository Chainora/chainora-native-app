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

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

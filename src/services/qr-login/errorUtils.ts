export const isRpcTimeoutLikeError = (message: string): boolean => {
  const lower = message.toLowerCase();
  return (
    lower.includes('timeout')
    || lower.includes('timed out')
    || lower.includes('request took too long')
    || lower.includes('network request failed')
    || lower.includes('failed to fetch')
  );
};

export const isUnknownAccountLikeError = (message: string): boolean => {
  const lower = message.toLowerCase();
  return (
    lower.includes('unknown address')
    || (lower.includes('account') && lower.includes('does not exist'))
  );
};

export const isInsufficientGasLikeError = (message: string): boolean => {
  const lower = message.toLowerCase();
  return (
    lower.includes('insufficient funds')
    || lower.includes('insufficient balance')
    || (lower.includes('gas') && lower.includes('not enough'))
  );
};

export const logCreateGroupGasIssue = ({
  stage,
  accountAddress,
  reason,
}: {
  stage: string;
  accountAddress: string;
  reason: string;
}): void => {
  console.warn('[CreateGroup][GasIssue]', {
    stage,
    accountAddress: accountAddress.toLowerCase(),
    reason,
    hint: 'wallet has no tCNR for gas or account is not activated on Chainora',
  });
};

export const logPoolActionEvent = ({
  stage,
  actionLabel,
  accountAddress,
  targetAddress,
  selector,
  txHash,
  sessionId,
}: {
  stage: string;
  actionLabel: string;
  accountAddress: string;
  targetAddress: string;
  selector: string;
  txHash?: string;
  sessionId?: string;
}): void => {
  console.log('[PoolAction]', {
    stage,
    actionLabel,
    accountAddress: accountAddress.toLowerCase(),
    targetAddress: targetAddress.toLowerCase(),
    selector,
    txHash,
    sessionId: sessionId || 'n/a',
  });
};

export const logPoolActionIssue = ({
  stage,
  actionLabel,
  accountAddress,
  targetAddress,
  selector,
  reason,
  txHash,
  sessionId,
}: {
  stage: string;
  actionLabel: string;
  accountAddress: string;
  targetAddress: string;
  selector: string;
  reason: string;
  txHash?: string;
  sessionId?: string;
}): void => {
  console.warn('[PoolAction][Issue]', {
    stage,
    actionLabel,
    accountAddress: accountAddress.toLowerCase(),
    targetAddress: targetAddress.toLowerCase(),
    selector,
    txHash,
    sessionId: sessionId || 'n/a',
    reason,
    hint: 'check wallet tCNR gas balance and account activation on Chainora',
  });
};

export const buildAccountNotActivatedMessage = (address: string): string =>
  `Wallet ${address} is not activated on Chainora yet. `
  + 'Please receive a small amount of tCNR to this wallet, then retry create group.';

export const buildInsufficientGasMessage = (address: string): string =>
  `Wallet ${address} does not have enough tCNR to pay gas. `
  + 'Please top up tCNR and retry create group.';

export const buildPoolActionAccountNotActivatedMessage = (address: string): string =>
  `Wallet ${address} is not activated on Chainora yet. `
  + 'Please receive a small amount of tCNR to this wallet, then retry this action.';

export const buildPoolActionInsufficientGasMessage = (address: string): string =>
  `Wallet ${address} does not have enough tCNR to pay gas. `
  + 'Please top up tCNR and retry this action.';

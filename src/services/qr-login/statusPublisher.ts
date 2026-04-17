export const createStatusPublisher = ({
  enabled = true,
  minIntervalMs = 250,
  publish,
}: {
  enabled?: boolean;
  minIntervalMs?: number;
  publish: (status: string) => void;
}) => {
  let lastStatus = '';
  let lastSentAt = 0;

  return (status: string) => {
    const normalizedStatus = status.trim();
    if (!enabled || !normalizedStatus) {
      return;
    }

    const now = Date.now();
    if (normalizedStatus === lastStatus && now - lastSentAt < minIntervalMs) {
      return;
    }

    lastStatus = normalizedStatus;
    lastSentAt = now;
    publish(normalizedStatus);
  };
};

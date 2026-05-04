export const VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES = 4_500_000;
export const PROXY_PAYLOAD_SOFT_LIMIT_BYTES = 3_800_000;

export function estimateProxyBodyBytes(body: unknown): number {
  return new TextEncoder().encode(JSON.stringify(body)).length;
}

export function splitByEstimatedProxyBytes<T>(
  items: T[],
  options: {
    maxItems: number;
    maxBytes?: number;
    estimateBytes: (items: T[]) => number;
  },
): T[][] {
  const maxBytes = options.maxBytes ?? PROXY_PAYLOAD_SOFT_LIMIT_BYTES;
  const chunks: T[][] = [];
  let current: T[] = [];

  for (const item of items) {
    const singleBytes = options.estimateBytes([item]);
    if (singleBytes > maxBytes) {
      throw new Error(`A single item exceeds the hosted proxy payload limit (${singleBytes} bytes).`);
    }

    const candidate = [...current, item];
    const candidateTooLarge = current.length > 0 && options.estimateBytes(candidate) > maxBytes;
    const candidateTooMany = current.length >= options.maxItems;

    if (candidateTooLarge || candidateTooMany) {
      chunks.push(current);
      current = [item];
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

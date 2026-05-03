export function isE2EMockPro(): boolean {
  return process.env.NEXT_PUBLIC_E2E_MOCK_PRO === "1";
}

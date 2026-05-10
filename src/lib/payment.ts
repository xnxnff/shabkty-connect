export const MASTERCARD_NUMBER = "8557885855";

export function generateVerificationCode(): string {
  const part = () => Math.floor(1000 + Math.random() * 9000).toString();
  return `SHB-${part()}-${part()}`;
}

export function formatIQD(v: number): string {
  return new Intl.NumberFormat("ar-IQ").format(v) + " د.ع";
}

import { PriceMove } from "./Types";

export function getPrecision(a: number): number {
  if (!isFinite(a)) return 0;
  let e = 1;
  let p = 0;
  while (Math.round(a * e) / e !== a) {
    e *= 10;
    p++;
  }
  return p;
}

export function floor(value: number, decimals: number): number {
  const ratio = Math.pow(10, decimals);
  return Math.floor(value * ratio) / ratio;
}

export function floorLastDigit(value: number, precision: number): number {
  return floor(value, precision - 1);
}

interface FloorResult {
  result: number;
  precision: number;
  precisionDiff: number;
}

export function floorToOptimalGrid(v: number, precision?: number): FloorResult {
  let result = precision === undefined ? v : floor(v, precision);
  let p = precision ?? getPrecision(v);
  const originalPrecision = p;
  // keep flooring each decimal until price step exceeds 0.075% step
  for (; p >= 0 && v / result < 1.000075; p--) {
    result = floor(v, p);
  }
  return { result, precision: p, precisionDiff: originalPrecision - p };
}

export function sumWithMaxPrecision(a: number, b: number): number {
  const aSplit = `${a}`.split(`.`);
  const bSplit = `${b}`.split(`.`);
  const precision = Math.max(
    (aSplit[1] || aSplit[0]).length,
    (bSplit[1] || bSplit[0]).length,
  );
  return +(a + b).toFixed(precision);
}

export function getRandomFromList<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function absPercentageChange(v1: number, v2: number): number {
  // |100 x (v2 - v1) / |v1||
  return f2(Math.abs((100 * (v2 - v1)) / Math.abs(v1)));
}

export function f0(n: number): number {
  return +n.toFixed(0);
}

export function f2(n: number): number {
  return +n.toFixed(2);
}

export function f3(n: number): number {
  return +n.toFixed(3);
}

export function f8(n: number): number {
  return +n.toFixed(8);
}

/**
 * Returns the number of consecutive prices that are increasing.
 * The result is negative if prices are decreasing.
 * @example [3, 2, 1] => -2
 * @example [2, 2, 1] => -1
 * @example [1, 2, 2] => 0
 * @example [2, 2, 3] => 1
 * @example [1, 2, 3] => 2
 * @param prices
 */
export function getPriceChangeIndex(prices: number[]): number {
  let result = 0;
  // if next price greater than current price, increase result
  // otherwise decrease result
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) {
      result++;
    } else if (prices[i] < prices[i - 1]) {
      result--;
    }
  }
  return result;
}

export function getPriceMove(maxCapacity: number, prices: number[]): PriceMove {
  const index = getPriceChangeIndex(prices);
  return +(
    ((index + maxCapacity) / (2 * maxCapacity)) *
    PriceMove.STRONG_UP
  ).toFixed(0);
}

export function enumKeys<T>(enumType: any): T[] {
  return Object.keys(enumType).filter((k) =>
    isNaN(Number(k)),
  ) as unknown as T[];
}

export interface ExecParams {
  context?: any;
  runnable: (arg0: any) => any;
  interval?: number;
  attempts?: number;
}

export const INTERRUPT = `⛔`;
export const SERVICE_LIMIT = `Service invoked too many times`;

export function execute({
  context,
  runnable,
  interval = 500,
  attempts = 5,
}: ExecParams): any {
  let err: Error | any;
  do {
    try {
      err = null;
      return runnable(context);
    } catch (e: any) {
      err = e;
      if (e.message.includes(INTERRUPT) || e.message.includes(SERVICE_LIMIT)) {
        break;
      }
    }
    if (attempts > 0) {
      Utilities.sleep(interval);
    }
  } while (--attempts > 0);

  if (err) {
    throw err;
  }
}

export function waitTillCurrentSecond(s = 0): number {
  let waited = 0;
  while (new Date().getSeconds() !== s) {
    Utilities.sleep(500);
    waited += 500;
  }
  return waited;
}

export function formatUSDCurrency(value) {
  return new Intl.NumberFormat(`en-US`, {
    style: `currency`,
    currency: `USD`,
    signDisplay: `always`,
    maximumFractionDigits: 2,
  }).format(value);
}

export function calculateBollingerBands(
  prices: number[],
  period: number,
  multiplier: number,
): { middle: number; upper: number; lower: number } {
  if (prices.length < period) {
    return { middle: -1, upper: -1, lower: -1 };
  }

  // Calculate the Simple Moving Average (SMA)
  let sum = 0.0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  const middle = sum / period;

  // Calculate the standard deviation
  let variance = 0.0;
  for (let i = 0; i < period; i++) {
    const diff = prices[i] - middle;
    variance += diff * diff;
  }
  variance /= period;
  const stdDev = Math.sqrt(variance);

  // Calculate the upper and lower Bollinger Bands
  const upper = middle + multiplier * stdDev;
  const lower = middle - multiplier * stdDev;

  return { middle, upper, lower };
}

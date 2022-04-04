import {CoinStats} from "./CoinStats";
import {Binance, IExchange} from "./Binance";
import {Config} from "./Store";

export class BinanceStats implements IExchange {
  private binance: Binance;
  private coinStats: CoinStats;

  constructor(config: Config) {
    this.binance = new Binance(config);
    this.coinStats = new CoinStats();
  }

  getFreeAsset(assetName: string): number {
    return this.binance.getFreeAsset(assetName);
  }

  getPrice(symbol: ExchangeSymbol): number {
    return this.coinStats.getPrice(symbol);
  }

  getPrices(): { [p: string]: number } {
    return this.coinStats.getPrices();
  }

  marketBuy(symbol: ExchangeSymbol, cost: number): TradeResult {
    return this.binance.marketBuy(symbol, cost);
  }

  marketSell(symbol: ExchangeSymbol, quantity: number): TradeResult {
    return this.binance.marketSell(symbol, quantity);
  }
}

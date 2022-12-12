import { Log } from "./Common";
import {
  ExchangeSymbol,
  execute,
  floor,
  getPrecision,
  INTERRUPT,
  SymbolInfo,
  TradeResult,
} from "../lib";
import { IExchange } from "./Exchange";
import URLFetchRequestOptions = GoogleAppsScript.URL_Fetch.URLFetchRequestOptions;

export class Binance implements IExchange {
  private readonly key: string;
  private readonly secret: string;
  private readonly defaultReqOpts: URLFetchRequestOptions;
  private readonly tradeReqOpts: URLFetchRequestOptions;
  private readonly serverIds: number[];
  readonly #balances: { [coinName: string]: number } = {};
  readonly #cloudURL: string;

  #curServerId: number;

  constructor(key: string, secret: string) {
    this.key = key ?? ``;
    this.secret = secret ?? ``;
    this.defaultReqOpts = {
      headers: { "X-MBX-APIKEY": this.key },
      muteHttpExceptions: true,
    };
    this.tradeReqOpts = Object.assign({ method: `post` }, this.defaultReqOpts);
    this.serverIds = this.#shuffleServerIds();
    this.#curServerId = this.serverIds[0];
    this.#cloudURL = global.TradingHelperLibrary.getBinanceURL();
  }

  #getSymbolInfo(symbol: ExchangeSymbol): SymbolInfo {
    return global.TradingHelperLibrary.getBinanceSymbolInfo(symbol);
  }

  getBalance(coinName: string): number {
    if (this.#balances[coinName]) {
      return this.#balances[coinName];
    }
    const resource = `account`;
    const query = ``;
    try {
      const accountData = this.fetch(
        () => `${resource}?${this.addSignature(query)}`,
        this.defaultReqOpts
      );
      accountData.balances.forEach((balance: any) => {
        this.#balances[balance.asset] = +(balance.free || 0);
      });
    } catch (e: any) {
      throw new Error(`Failed to get available ${coinName}: ${e.message}`);
    }
    return +(this.#balances[coinName] || 0);
  }

  getLatestKlineOpenPrices(
    symbol: ExchangeSymbol,
    interval: string,
    limit: number
  ): number[] {
    Log.debug(
      `Fetching latest kline open prices for ${symbol}, interval: ${interval}, limit: ${limit}`
    );
    const resource = `klines`;
    const query = `symbol=${symbol}&interval=${interval}&limit=${limit}`;
    try {
      return this.fetch(() => `${resource}?${query}`, this.defaultReqOpts).map(
        (kline: any) => +kline[1]
      );
    } catch (e: any) {
      throw new Error(
        `Failed to get latest kline open prices for ${symbol}: ${e.message}`
      );
    }
  }

  #updateBalance(coinName: string, amount: number): void {
    const balance = this.#balances[coinName] || 0;
    this.#balances[coinName] = balance + amount;
  }

  marketBuy(symbol: ExchangeSymbol, cost: number): TradeResult {
    const moneyAvailable = this.getBalance(symbol.priceAsset);
    if (moneyAvailable < cost) {
      return new TradeResult(
        symbol,
        `Not enough money to buy: ${symbol.priceAsset}=${moneyAvailable}`
      );
    }
    Log.alert(
      `➕ Buying ${symbol.quantityAsset} for ${cost} ${symbol.priceAsset}`
    );
    const query = `symbol=${symbol}&type=MARKET&side=BUY&quoteOrderQty=${cost}`;
    try {
      const tradeResult = this.marketTrade(symbol, query);
      tradeResult.paid = tradeResult.cost;
      this.#updateBalance(symbol.priceAsset, -tradeResult.cost);
      return tradeResult;
    } catch (e: any) {
      if (e.message.includes(`Market is closed`)) {
        return new TradeResult(symbol, `Market is closed for ${symbol}.`);
      }
      throw e;
    }
  }

  /**
   * Sells specified quantity or all available asset.
   * @param symbol
   * @param quantity
   */
  marketSell(symbol: ExchangeSymbol, quantity: number): TradeResult {
    const qty = this.quantityForLotStepSize(symbol, quantity);
    const query = `symbol=${symbol}&type=MARKET&side=SELL&quantity=${qty}`;
    Log.alert(
      `➖ Selling ${qty} ${symbol.quantityAsset} for ${symbol.priceAsset}`
    );
    try {
      const tradeResult = this.marketTrade(symbol, query);
      tradeResult.gained = tradeResult.cost;
      tradeResult.soldPrice = tradeResult.avgPrice;
      this.#updateBalance(symbol.priceAsset, tradeResult.cost);
      return tradeResult;
    } catch (e: any) {
      if (e.message.includes(`Account has insufficient balance`)) {
        return new TradeResult(
          symbol,
          `Account has no ${qty} of ${symbol.quantityAsset}`
        );
      }
      if (e.message.includes(`Market is closed`)) {
        return new TradeResult(symbol, `Market is closed for ${symbol}.`);
      }
      if (e.message.includes(`MIN_NOTIONAL`)) {
        return new TradeResult(
          symbol,
          `The cost of ${symbol.quantityAsset} is less than minimal needed to sell it.`
        );
      }
      throw e;
    }
  }

  quantityForLotStepSize(symbol: ExchangeSymbol, quantity: number): number {
    const precision = this.getLotSizePrecision(symbol);
    return floor(quantity, precision);
  }

  getLotSizePrecision(symbol: ExchangeSymbol): number {
    const lotSize = this.#getSymbolInfo(symbol)?.filters.find(
      (f) => f.filterType === `LOT_SIZE`
    );
    if (!lotSize) {
      throw new Error(`Failed to get LOT_SIZE for ${symbol}`);
    }
    return getPrecision(+lotSize.stepSize);
  }

  getPricePrecision(symbol: ExchangeSymbol): number {
    const priceFilter = this.#getSymbolInfo(symbol)?.filters.find(
      (f) => f.filterType === `PRICE_FILTER`
    );
    if (!priceFilter) {
      throw new Error(`Failed to get PRICE_FILTER for ${symbol}`);
    }
    return getPrecision(+priceFilter.tickSize);
  }

  marketTrade(symbol: ExchangeSymbol, query: string): TradeResult {
    try {
      const order = this.fetch(
        () => `order?${this.addSignature(query)}`,
        this.tradeReqOpts
      );
      Log.debug(order);
      const tradeResult = new TradeResult(symbol);
      const fees = this.#getFees(symbol, order.fills);
      tradeResult.quantity = +order.origQty - fees.origQty;
      tradeResult.cost = +order.cummulativeQuoteQty - fees.quoteQty;
      tradeResult.commission = fees.BNB;
      tradeResult.fromExchange = true;
      return tradeResult;
    } catch (e: any) {
      throw new Error(`Failed to trade ${symbol}: ${e.message}`);
    }
  }

  #getFees(
    symbol: ExchangeSymbol,
    fills: any[] = []
  ): { BNB: number; origQty: number; quoteQty: number } {
    const fees = { BNB: 0, origQty: 0, quoteQty: 0 };
    fills.forEach((f) => {
      if (f.commissionAsset === `BNB`) {
        fees.BNB += +f.commission;
      } else if (f.commissionAsset === symbol.quantityAsset) {
        fees.origQty += +f.commission;
      } else if (f.commissionAsset === symbol.priceAsset) {
        fees.quoteQty += +f.commission;
      }
    });
    return fees;
  }

  private addSignature(data: string): string {
    const timestamp = Number(new Date().getTime()).toFixed(0);
    const sigData = `${data}${data ? `&` : ``}timestamp=${timestamp}`;
    const sig = Utilities.computeHmacSha256Signature(sigData, this.secret)
      .map((e) => {
        const v = (e < 0 ? e + 256 : e).toString(16);
        return v.length === 1 ? `0` + v : v;
      })
      .join(``);

    return `${sigData}&signature=${sig}`;
  }

  fetch(
    resource: () => string,
    options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions
  ): any {
    const cloudURL = this.#cloudURL;
    return execute({
      interval: 200,
      attempts: cloudURL ? 2 : this.serverIds.length * 4,
      runnable: () => {
        const server =
          cloudURL || `https://api${this.#curServerId}.binance.com/api/v3/`;
        const resp = UrlFetchApp.fetch(
          `${server}${encodeURI(resource())}`,
          options
        );

        if (resp.getResponseCode() === 200) {
          try {
            return JSON.parse(resp.getContentText());
          } catch (e: any) {
            Log.debug(`Failed to parse response from Binance: ${e.message}`);
          }
        }

        this.#rotateServer();

        if (resp.getResponseCode() === 418 || resp.getResponseCode() === 429) {
          Log.debug(`Limit reached on Binance`);
        }

        if (resp.getResponseCode() === 451) {
          Log.alert(
            `⛔ Binance blocked the request because it originates from a restricted location (most likely US-based Google Apps Script server). TradingHelper has EU-based service which is automatically enabled for Patrons that unlocked the autonomous trading.`
          );
          throw new Error(
            `${INTERRUPT} ${resp.getResponseCode()} ${resp.getContentText()}`
          );
        }

        if (
          resp.getResponseCode() === 400 &&
          resp.getContentText().includes(`Not all sent parameters were read`)
        ) {
          // Likely a request signature verification timeout
          Log.debug(`Got 400 response code from Binance`);
        }

        throw new Error(`${resp.getResponseCode()} ${resp.getContentText()}`);
      },
    });
  }

  #shuffleServerIds(): number[] {
    // 3 distinct addresses were verified.
    return [1, 2, 3].sort(() => Math.random() - 0.5);
  }

  #rotateServer(): void {
    this.#curServerId = this.serverIds.shift();
    this.serverIds.push(this.#curServerId);
  }

  getImbalance(
    symbol: ExchangeSymbol,
    limit: number,
    bidCutOffPrice: number
  ): number {
    const data = this.fetch(
      () => `depth?symbol=${symbol}&limit=${limit}`,
      this.defaultReqOpts
    );

    // Sum volume of bids above bidCutOffPrice
    const bidsVol: number = data.bids.reduce((s: number, b) => {
      return +b[0] > bidCutOffPrice ? s + +b[1] : s;
    }, 0);

    const topBid = data.bids[0]?.[0] ?? 0;
    const topAsk = data.asks[0]?.[0] ?? 0;
    const midPrice = (+topBid + +topAsk) / 2;
    // askCutOffPrice is the price on the same distance from midPrice as
    // bidCutOffPrice is from topBid, aka cut-off prices form a range around midPrice
    const askCutOffPrice = midPrice * (midPrice / bidCutOffPrice);

    // Sum volume of asks below askCutOffPrice
    const asksVol: number = data.asks.reduce((s: number, a) => {
      return +a[0] < askCutOffPrice ? s + +a[1] : s;
    }, 0);
    const imb = (bidsVol - asksVol) / (bidsVol + asksVol);
    // if NaN, return 0
    // NaN can happen if there are no bids or asks for this bidCutOffPrice
    return imb || 0;
  }
}

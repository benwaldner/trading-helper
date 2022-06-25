import { DefaultCacheProxy, Entries, ExpirationEntries } from "../CacheProxy"
import { Log, SECONDS_IN_MIN } from "../Common"
import {
  absPercentageChange,
  CoinName,
  Config,
  IPriceProvider,
  PriceHoldersMap,
  PricesHolder,
  TradeState,
} from "trading-helper-lib"
import { TradeActions } from "../TradeActions"
import { TradesDao } from "../dao/Trades"
import { ConfigDao } from "../dao/Config"

export enum PriceAnomaly {
  NONE,
  PUMP,
  DUMP,
  TRACKING,
}

export class AnomalyTrader {
  readonly #cache: DefaultCacheProxy
  readonly #priceProvider: IPriceProvider
  readonly #tradesDao: TradesDao
  readonly #configDao: ConfigDao
  readonly #tradeActions: TradeActions

  #cacheGetAll: Entries = {}
  #cachePutAll: ExpirationEntries = {}
  #cacheRemoveAll: string[] = []
  #config: Config

  constructor(tradesDao: TradesDao, configDao: ConfigDao, cache: DefaultCacheProxy, priceProvider: IPriceProvider,
              tradeActions: TradeActions) {
    this.#cache = cache
    this.#priceProvider = priceProvider
    this.#tradesDao = tradesDao
    this.#configDao = configDao
    this.#tradeActions = tradeActions
  }

  trade(): void {
    // Get current config
    this.#config = this.#configDao.get()

    if (!this.#config.SellPumps && !this.#config.BuyDumps) {
      return
    }

    const prices = this.#priceProvider.get(this.#config.StableCoin)

    this.#getAllCache(prices)

    Object.keys(prices).forEach((coin: CoinName) => {
      const anomaly = this.#checkAnomaly(coin, prices[coin])
      this.#handleAnomaly(coin, anomaly)
    })

    this.#updateAllCache()
  }

  #handleAnomaly(coin: string, anomaly: PriceAnomaly) {
    if (anomaly === PriceAnomaly.DUMP && this.#config.BuyDumps) {
      Log.alert(`ℹ️ Buying price dumps is enabled: ${coin} will be bought.`)
      this.#tradeActions.buy(coin)
      return
    }

    if (anomaly === PriceAnomaly.PUMP && this.#config.SellPumps) {
      this.#tradesDao.update(coin, (tm) => {
        if (tm.profit() > 0) {
          Log.alert(`ℹ️ Selling price pumps is enabled: ${coin} will be sold.`)
          tm.setState(TradeState.SELL)
          return tm
        }
      })
      return
    }
  }

  #getAllCache(prices: PriceHoldersMap): void {
    const cacheKeys: string[] = []
    Object.keys(prices).forEach((coin) => {
      cacheKeys.push(`${coin}-pump-dump-tracking`)
      cacheKeys.push(`${coin}-start-price`)
    })
    this.#cacheGetAll = this.#cache.getAll(cacheKeys)
  }

  #checkAnomaly(coin: CoinName, ph: PricesHolder): PriceAnomaly {
    const trackingKey = `${coin}-pump-dump-tracking`
    const tracking = this.#cacheGetAll[trackingKey]
    const startPriceKey = `${coin}-start-price`
    const anomalyStartPrice = this.#cacheGetAll[startPriceKey]

    const strongMove = ph.priceGoesStrongUp() || ph.priceGoesStrongDown()
    if (strongMove) {
      // If price strong move continues - refresh expirations and continue tracking
      const anomalyWindowDuration = SECONDS_IN_MIN * 1.5
      this.#cachePutAll[trackingKey] = { value: `true`, expiration: anomalyWindowDuration }
      // Saving the max or min price of the anomaly depending on the direction
      const minMaxPrice = ph.priceGoesStrongUp() ? Math.min(...ph.prices) : Math.max(...ph.prices)
      this.#cachePutAll[startPriceKey] = {
        value: tracking ? `${anomalyStartPrice}` : `${minMaxPrice}`,
        expiration: anomalyWindowDuration * 2,
      }
      return PriceAnomaly.TRACKING
    }
    if (tracking) {
      // no strong move, but still tracking
      return PriceAnomaly.TRACKING
    }
    if (!anomalyStartPrice) {
      return PriceAnomaly.NONE
    }

    this.#cacheRemoveAll.push(startPriceKey)
    const percent = absPercentageChange(+anomalyStartPrice, ph.currentPrice)

    if (this.#config.PriceAnomalyAlert && percent < this.#config.PriceAnomalyAlert) {
      return PriceAnomaly.NONE
    }

    if (+anomalyStartPrice > ph.currentPrice) {
      Log.alert(
        `ℹ️ ${coin} price dumped for ${percent}%: ${anomalyStartPrice} -> ${ph.currentPrice}`,
      )
      return PriceAnomaly.DUMP
    }

    if (+anomalyStartPrice < ph.currentPrice) {
      Log.alert(
        `ℹ️ ${coin} price pumped for ${percent}%: ${anomalyStartPrice} -> ${ph.currentPrice}`,
      )
      return PriceAnomaly.PUMP
    }

    return PriceAnomaly.NONE
  }

  #updateAllCache(): void {
    this.#cache.putAll(this.#cachePutAll)
    this.#cache.removeAll(this.#cacheRemoveAll)
    this.#cachePutAll = {}
    this.#cacheRemoveAll = []
  }
}

import { DefaultTrader } from "./traders/DefaultTrader"
import { Exchange } from "./Exchange"
import { Statistics } from "./Statistics"
import { DefaultStore } from "./Store"
import { Log, StopWatch } from "./Common"
import { ScoreTrader } from "./traders/ScoreTrader"
import { CacheProxy } from "./CacheProxy"
import { IScores } from "./Scores"
import { PriceProvider } from "./PriceProvider"
import { AnomalyTrader } from "./traders/AnomalyTrader"
import { TradesDao } from "./dao/Trades"
import { ConfigDao } from "./dao/Config"
import { TradeActions } from "./TradeActions"

export class Process {
  static tick() {
    const stopWatch = new StopWatch((...args) => Log.debug(...args))

    const store = DefaultStore
    const tradesDao = new TradesDao(store)
    const configDao = new ConfigDao(store)

    const config = configDao.get()
    const exchange = new Exchange(config.KEY, config.SECRET)
    const statistics = new Statistics(store)
    const priceProvider = PriceProvider.getInstance(exchange, CacheProxy)
    const tradeActions = new TradeActions(tradesDao, config.StableCoin, priceProvider)
    const defaultTrader = new DefaultTrader(tradesDao, configDao, exchange, priceProvider, statistics)
    const scores = global.TradingHelperScores.create(DefaultStore, priceProvider, config) as IScores
    const scoreTrader = new ScoreTrader(configDao, tradesDao, scores, tradeActions)
    const anomalyTrader = new AnomalyTrader(tradesDao, configDao, CacheProxy, priceProvider, tradeActions)

    // Updating prices every tick
    // This should be the only place to call `update` on the price provider.
    stopWatch.start(`Prices update`)
    priceProvider.update()
    stopWatch.stop()

    try {
      stopWatch.start(`Trades check`)
      defaultTrader.trade()
      stopWatch.stop()
    } catch (e) {
      Log.alert(`Failed to trade: ${e.message}`)
      Log.error(e)
    }

    try {
      stopWatch.start(`Stable Coins update`)
      defaultTrader.updateStableCoinsBalance(store)
      stopWatch.stop()
    } catch (e) {
      Log.alert(`Failed to update stable coins balance: ${e.message}`)
      Log.error(e)
    }

    try {
      stopWatch.start(`Scores update`)
      scores.update()
      stopWatch.stop()
    } catch (e) {
      Log.alert(`Failed to update scores: ${e.message}`)
      Log.error(e)
    }

    try {
      stopWatch.start(`Recommended coins check`)
      scoreTrader.trade()
      stopWatch.stop()
    } catch (e) {
      Log.alert(`Failed to trade recommended coins: ${e.message}`)
      Log.error(e)
    }

    try {
      stopWatch.start(`Anomalies check`)
      anomalyTrader.trade()
      stopWatch.stop()
    } catch (e) {
      Log.alert(`Failed to trade price anomalies: ${e.message}`)
      Log.error(e)
    }
  }
}

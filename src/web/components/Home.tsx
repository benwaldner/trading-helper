import * as React from "react";
import { useState } from "react";
import { Button, Chip, Grid, Stack, Typography } from "@mui/material";
import { featureDisabledInfo } from "./Common";
import {
  type AppState,
  type CandidatesData,
  type Config,
  Key,
  type TradeMemo,
  TradeState,
} from "../../lib";
import AssetCard from "./cards/AssetCard";
import BalanceCard from "./cards/BalanceCard";
import CandidateCard from "./cards/CandidateCard";
import MarketCard from "./cards/MarketCard";

export function Home({ state }: { state: AppState }): JSX.Element {
  const config = state.config;
  const assetsValue = state.assets.reduce((s, tm) => s + tm.currentValue, 0);
  const [hideBalances, setHideBalances] = useState(config.HideBalances);

  const toggleHideBalances = (): void => {
    setHideBalances(!hideBalances);
  };

  const sorted = state.assets.sort((t1, t2) => (t1.ttl > t2.ttl ? 1 : -1));
  const current = sorted.filter(
    (t) => t.currentValue || t.stateIs(TradeState.BUY),
  );
  const sold = sorted.filter((t) => t.stateIs(TradeState.SOLD));

  const dryRunMsg = config.DryRun ? (
    <Typography variant="body1" textAlign={`center`}>
      <b>"Dry Run" mode.</b>
      <br />
    </Typography>
  ) : undefined;
  const currentInfoMessage = config.AdvancedAccess ? (
    <>
      {dryRunMsg}
      <Typography variant="body1" textAlign={`center`}>
        {config.ViewOnly
          ? `🔕 Auto-trading is disabled. Toggle off "View-only" in Settings to activate.`
          : config.TradingAutoStopped
            ? `⏸️ Auto-trading is paused. Market strength should reach ${config.MarketStrengthTargets.max}.`
            : `▶️ Auto-trading is active. Waiting for specific conditions to buy a candidate.`}
      </Typography>
    </>
  ) : (
    dryRunMsg
  );

  return (
    <>
      <Grid
        sx={{ flexGrow: 1 }}
        display="flex"
        justifyContent="center"
        container
        spacing={2}
      >
        <Grid item xs={12}>
          {balanceCard(config, hideBalances, assetsValue, toggleHideBalances)}
        </Grid>
        <Grid item xs={12} md={4} order={{ xs: 2, md: 1 }}>
          {candidates(`⚖️ Candidates`, state.candidates)}
        </Grid>
        {!config.AdvancedAccess ? (
          <Grid item xs={12} md={12} order={{ xs: 1, md: 0 }}>
            {featureDisabledInfo}
          </Grid>
        ) : (
          <>
            <Grid item xs={12} md={4} order={{ xs: 1, md: 2 }}>
              {assetsCards(
                `🪙 Current`,
                current,
                hideBalances,
                config,
                currentInfoMessage,
              )}
            </Grid>
            <Grid item xs={12} md={4} order={{ xs: 1, md: 3 }}>
              {assetsCards(`💸 Sold`, sold, hideBalances, config)}
            </Grid>
          </>
        )}
      </Grid>
    </>
  );
}

function balanceCard(
  config: Config,
  hideBalances: boolean,
  assetsValue: number,
  toggleHideBalances: () => void,
): JSX.Element {
  const [hide, setHide] = useState(false);

  return (
    <Stack spacing={1} alignItems={`center`}>
      <Chip
        sx={{ mb: `8px` }}
        onClick={() => {
          setHide(!hide);
        }}
        label={<Typography variant={`h6`}>💰 Balance</Typography>}
      />
      {!hide && (
        <BalanceCard
          name={config.StableCoin}
          balances={{
            [config.StableCoin]: config.StableBalance,
            feesBudget: config.FeesBudget,
          }}
          assetsValue={assetsValue}
          viewOnly={config.ViewOnly}
          hide={hideBalances}
          toggleHide={toggleHideBalances}
        />
      )}
    </Stack>
  );
}

function assetsCards(
  title: string,
  elems: TradeMemo[],
  hideBalances: boolean,
  config: Config,
  topItem?: JSX.Element,
): JSX.Element {
  const [hide, setHide] = useState(false);

  return (
    <Stack spacing={1} alignItems={`center`}>
      <Chip
        onClick={() => {
          setHide(!hide);
        }}
        label={
          <Typography variant={`h6`}>
            {title} ({elems.length})
          </Typography>
        }
      />
      {!hide && (
        <>
          <Grid
            container
            display="flex"
            justifyContent="center"
            spacing={2}
            ml={`-16px !important`}
          >
            {topItem && <Grid item>{topItem}</Grid>}
            {elems.map((t) => (
              <Grid key={t.getCoinName()} item>
                <AssetCard tm={t} cfg={config} hideBalances={hideBalances} />
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Stack>
  );
}

function candidates(
  title: string,
  { selected, other, marketInfo }: CandidatesData,
): JSX.Element {
  const all = Object.assign({}, selected, other);
  const coins = Object.keys(all);
  const sorted = coins.sort((a, b) =>
    all[a][Key.STRENGTH] > all[b][Key.STRENGTH] ? -1 : 1,
  );

  const [hide, setHide] = useState(false);

  const defaultShow = Object.keys(selected).length;
  const [itemsToShow, setItemsToShow] = useState(defaultShow);
  // Add pinned candidates first
  const pinned = coins.filter((coin) => all[coin][Key.PINNED]);
  const displayCoins = hide
    ? []
    : [
        ...pinned,
        ...sorted.filter((c) => !pinned.includes(c)).slice(0, itemsToShow),
      ];
  return (
    <Stack spacing={1} alignItems={`center`}>
      <Chip
        onClick={() => {
          setHide(!hide);
        }}
        label={
          <Typography variant={`h6`}>
            {title} ({Object.keys(selected).length})
          </Typography>
        }
      />
      {!hide && (
        <Grid
          container
          display="flex"
          justifyContent="center"
          spacing={2}
          ml={`-16px !important`}
        >
          <>
            <Grid item>
              <MarketCard marketInfo={marketInfo}></MarketCard>
            </Grid>
            {displayCoins.map((coin, i) => {
              return (
                <Grid item key={coin}>
                  <CandidateCard coin={coin} ci={all[coin]} />
                </Grid>
              );
            })}
          </>
        </Grid>
      )}
      {!hide && !displayCoins.length && (
        <Typography alignSelf={`center`} variant={`body2`}>
          Nothing to show yet. Investment candidates will appear after some
          {` `}
          period of observation.
        </Typography>
      )}
      {!hide && itemsToShow === defaultShow && (
        <Button
          variant="outlined"
          onClick={() => {
            setItemsToShow(sorted.length);
          }}
        >
          Show others
        </Button>
      )}
      {!hide && itemsToShow !== defaultShow && (
        <Button
          variant="outlined"
          onClick={() => {
            setItemsToShow(defaultShow);
          }}
        >
          Hide others
        </Button>
      )}
    </Stack>
  );
}

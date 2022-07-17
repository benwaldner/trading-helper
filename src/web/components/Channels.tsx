import * as React from "react"
import { useEffect } from "react"
import { Box, List, ListItem, ListItemAvatar, ListItemText, Stack, Typography } from "@mui/material"
import { cardWidth, circularProgress, growthIconMap } from "./Common"
import { ChannelState, Config, f8, Key, PriceChannelsDataResponse, PriceMove } from "../../lib"
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material"

export function Channels({ config }: { config: Config }) {
  const [priceChannelsData, setPriceChannelsData] = React.useState<PriceChannelsDataResponse>(null)

  const reload = () => {
    google.script.run.withSuccessHandler(setPriceChannelsData).getPriceChannelsData()
  }

  useEffect(() => {
    reload()
    const interval = setInterval(reload, 1000 * 60)
    return () => clearInterval(interval)
  }, [])

  return (
    <Box sx={{ justifyContent: `center`, display: `flex` }}>
      {!priceChannelsData && circularProgress}
      {priceChannelsData && <Stack spacing={2}>{list(priceChannelsData, config)}</Stack>}
    </Box>
  )
}

function list(data: PriceChannelsDataResponse, config: Config) {
  const keysSortedByDuration = Object.keys(data).sort(
    (a, b) => data[b][Key.DURATION] - data[a][Key.DURATION],
  )
  const stateIcon = {
    [ChannelState.NONE]: growthIconMap.get(PriceMove.NEUTRAL),
    [ChannelState.TOP]: growthIconMap.get(PriceMove.UP),
    [ChannelState.BOTTOM]: growthIconMap.get(PriceMove.DOWN),
    [ChannelState.MIDDLE]: growthIconMap.get(PriceMove.NEUTRAL),
  }

  return (
    <>
      <Typography alignSelf={`center`} variant={`subtitle1`}>
        Price Channels
      </Typography>
      {!keysSortedByDuration.length && (
        <Typography alignSelf={`center`} variant={`body2`}>
          Nothing to show yet.
        </Typography>
      )}
      {!!keysSortedByDuration.length && (
        <Stack>
          <List
            sx={{ padding: 0, marginTop: 0, width: cardWidth, overflow: `auto`, maxHeight: 440 }}
          >
            {keysSortedByDuration.map((coin, i) => {
              const {
                [Key.DURATION]: duration,
                [Key.MIN]: min,
                [Key.MAX]: max,
                [Key.S0]: s0,
                [Key.S1]: s1,
                [Key.S2]: s2,
              } = data[coin]
              const dataHint = `${duration}/${config.ChannelWindowMins} | ${f8(min)} | ${f8(max)}`
              return (
                <ListItem
                  sx={{
                    padding: `0 0 6px 0`,
                  }}
                  key={i}
                  disablePadding={true}
                >
                  <ListItemAvatar sx={{ minWidth: `48px` }}>#{i + 1}</ListItemAvatar>
                  <ListItemText
                    sx={{ margin: `3px 0 0 0` }}
                    primary={
                      <Typography sx={{ display: `flex`, alignItems: `center` }}>
                        {coin + (duration > config.ChannelWindowMins ? ` ✅ ` : ``)}
                        {stateIcon[s2]} {stateIcon[s1]} {stateIcon[s0]}
                      </Typography>
                    }
                    secondary={dataHint}
                  />
                </ListItem>
              )
            })}
          </List>
        </Stack>
      )}
    </>
  )
}

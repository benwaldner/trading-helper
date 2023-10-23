import * as React from "react";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { circularProgress, ScriptApp } from "./Common";
import { type Config, type InitialSetupParams } from "../../lib";

enum Step {
  DbConnect,
  BinanceConnect,
}

export function InitialSetup({
  config,
  onConnect,
  firebaseURL,
}: {
  config: Config;
  onConnect: () => void;
  firebaseURL: string;
}): JSX.Element {
  const [step, setStep] = useState(
    firebaseURL ? Step.BinanceConnect : Step.DbConnect,
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(``);

  const [params, setParams] = useState<InitialSetupParams>({
    dbURL: firebaseURL,
    binanceAPIKey: config.KEY,
    binanceSecretKey: config.SECRET,
    viewOnly: config.ViewOnly,
  });

  function onChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setParams({ ...params, [e.target.name]: e.target.value });
  }

  function onClickConnect(): void {
    setIsConnecting(true);
    ScriptApp?.withSuccessHandler(() => {
      setIsConnecting(false);
      onConnect();
    })
      .withFailureHandler((resp) => {
        setIsConnecting(false);
        setError(resp.message);
      })
      .initialSetup(params as any);
  }

  // Step to a map of displayed elements
  const stepToElements = {
    [Step.DbConnect]: (
      <>
        <Typography variant="h5" component="h3" textAlign={`center`}>
          Welcome to Trading Helper!
        </Typography>
        <Typography variant="body1" component="p" textAlign={`center`}>
          You can connect to the Firebase Realtime Database as permanent storage
          now, or choose to do so later in the settings. This option is useful
          if your data cannot fit into the standard Google Apps Script storage,
          if you need to migrate your data to another account, or if you
          anticipate requiring Firebase for other purposes.
        </Typography>
        <TextField
          value={params.dbURL}
          label={`Firebase Database URL`}
          onChange={onChange}
          name="dbURL"
        />
        <Stack direction={`row`} spacing={2}>
          <Button
            color="primary"
            onClick={() => {
              setParams({ ...params, dbURL: `` });
              setStep(Step.BinanceConnect);
            }}
          >
            Skip
          </Button>
          <Box sx={{ position: `relative` }}>
            <Button
              variant="contained"
              color="primary"
              onClick={onClickConnect}
              disabled={isConnecting}
            >
              Connect
            </Button>
            {isConnecting && circularProgress}
          </Box>
        </Stack>
      </>
    ),
    [Step.BinanceConnect]: (
      <>
        <Typography variant="h5" component="h3" textAlign={`center`}>
          Almost done!
        </Typography>
        <Typography variant="body1" component="p" textAlign={`center`}>
          To connect to Binance, you need to set up an API key and secret. This
          connection is necessary only if you plan to enable autonomous trading.
          If you prefer to view only the candidates without connecting to
          Binance, simply choose the "View-only" mode below.
        </Typography>
        <TextField
          type={`password`}
          value={params.binanceAPIKey}
          label={`Binance API Key`}
          onChange={onChange}
          name="binanceAPIKey"
        />
        <TextField
          type={`password`}
          value={params.binanceSecretKey}
          label={`Binance Secret Key`}
          onChange={onChange}
          name="binanceSecretKey"
        />
        <Stack direction={`row`} spacing={2}>
          <Box sx={{ position: `relative` }}>
            <Button
              color="primary"
              onClick={() => {
                params.viewOnly = true;
                setParams(params);
                onClickConnect();
              }}
              disabled={isConnecting}
            >
              View-only
            </Button>
            {params.viewOnly && isConnecting && circularProgress}
          </Box>
          <Box sx={{ position: `relative` }}>
            <Button
              variant="contained"
              color="primary"
              onClick={() => {
                params.viewOnly = false;
                setParams(params);
                onClickConnect();
              }}
              disabled={isConnecting}
            >
              Connect
            </Button>
            {!params.viewOnly && isConnecting && circularProgress}
          </Box>
        </Stack>
      </>
    ),
  };

  return (
    <Stack
      spacing={2}
      sx={{
        margin: `10px`,
        alignItems: `center`,
        justifyContent: `center`,
        "& .MuiTextField-root": { width: `90%`, maxWidth: `700px` },
        "& .MuiTypography-root": { width: `90%`, maxWidth: `700px` },
      }}
    >
      <img
        width={200}
        src="https://user-images.githubusercontent.com/7527778/167810306-0b882d1b-64b0-4fab-b647-9c3ef01e46b4.png"
        alt="Trading Helper logo"
      />
      {stepToElements[step]}
      {error && <Alert severity="error">{error.toString()}</Alert>}
    </Stack>
  );
}

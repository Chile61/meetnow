import { AxiosResponse } from 'axios';
import { Api } from '../api';
import { isCancel, Request, RequestResult } from '../api/request';
import { createWorker } from '../utils/worker';
import { ApiError } from '../api/api-error';

export const DEFAULT_INTERVAL = 100;
export const MIN_INTERVAL = 2;
export const MAX_INTERVAL = 30;

export interface PollingConfigs {
  api: Api;
  onInfomation?: (...args: any[]) => void;
  onMessage?: (...args: any[]) => void;
  onRenegotiate?: (...args: any[]) => void;
  onQuit?: (...args: any[]) => void;
  onError?: (...args: any[]) => void;
}

function computeTimeout(upperBound: number) {
  const lowerBound = upperBound * 0.8;
  return 1000 * ((Math.random() * (upperBound - lowerBound)) + lowerBound);
}

function computeNextTimeout(attempts: number) {
  /* eslint-disable-next-line no-restricted-properties */
  let k = Math.floor((Math.random() * Math.pow(2, attempts)) + 1);

  if (k < MIN_INTERVAL) {
    k = MIN_INTERVAL;
  }
  if (k > MAX_INTERVAL) {
    k = MAX_INTERVAL;
  }

  return k * 1000;
}

export function createPolling(config: PollingConfigs) {
  const { api } = config;
  let request: Request;
  let interval: number = DEFAULT_INTERVAL;
  let attempts: number = 0;

  let version: number = 0;

  function analyze(data: any) {
    if (!data) return;

    const { version: newVersion, category, body } = data;

    if (newVersion == null) return;

    if (newVersion <= version) {
      console.warn(`illegal version: ${ newVersion }, current version: ${ version }`);
      return;
    }

    switch (category) {
      case 'conference-info':
        config.onInfomation && config.onInfomation(body);
        break;

      case 'im-record':
        config.onMessage && config.onMessage(body);
        break;

      case 'port-change':
        config.onMessage && config.onRenegotiate(body);
        break;

      case 'quit-conference':
        config.onMessage && config.onQuit(body);
        break;

      default:
        console.warn(`unsupported category: ${ category }`);
        break;
    }

    version = newVersion;
  }

  async function poll() {
    let response: AxiosResponse<RequestResult>;
    let error: ApiError;
    let canceled: boolean = false;
    let timeouted: boolean = false;

    try {
      request = api.request('polling').data({ version });
      response = await request.send();
    } catch (e) {
      error = e;
      canceled = isCancel(e);

      if (canceled) return;

      // polling timeout
      timeouted = [900408, 901323].includes(error.bizCode);

      if (timeouted) return;

      // if request failed by network or server error,
      // increase next polling timeout
      attempts++;
      interval = computeNextTimeout(attempts);

      config.onError && config.onError(error, attempts);
    }

    if (error) return;

    const { bizCode, data } = response.data;

    // TODO
    // check bizCode

    try {
      analyze(data);
    } catch (error) {
      console.error('internal error', error);
      debugger;
    }

    attempts = 0;
  }

  const worker = createWorker({
    work     : () => poll(),
    interval : () => interval,
    cancel   : () => request.cancel(),
  });

  return {
    ...worker,
    poll,
    analyze,
  };
}

export type Polling = ReturnType<typeof createPolling>;

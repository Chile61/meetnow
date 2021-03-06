import { AxiosResponse } from 'axios';
import debug from 'debug';
import { Api } from '../api';
import { isCancel, Request, RequestResult } from '../api/request';
import { createWorker, Worker } from '../utils/worker';

const log = debug('MN:Keepalive');

export const DEFAULT_INTERVAL = 30 * 1000;
export const MIN_INTERVAL = 2;
export const MAX_INTERVAL = 30;
export const MAX_ATTEMPTS = 15;

export interface KeepAliveConfigs {
  api: Api;
  interval?: number;
  onError?: (...args: any[]) => void;
}

function computeTimeout(upperBound: number) {
  const lowerBound = upperBound * 0.8;
  return 1000 * ((Math.random() * (upperBound - lowerBound)) + lowerBound);
}

function computeNextTimeout(attempts: number) {
  log(`computeNextTimeout() attempts: ${ attempts }`);

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

export interface KeepAlive extends Worker {
  keepalive: () => Promise<void>;
}

export function createKeepAlive(config: KeepAliveConfigs): KeepAlive {
  const { api } = config;
  let request: Request;
  let canceled: boolean = false;
  let interval: number = config.interval || DEFAULT_INTERVAL;
  let attempts: number = 0;

  async function keepalive() {
    log('keepalive()');

    let response: AxiosResponse<RequestResult> | undefined;
    let error;

    try {
      canceled = false;
      request = api.request('keepalive');
      response = await request.send();
    } catch (e) {
      error = e;
      canceled = isCancel(e);

      if (canceled) return;

      // if request failed by network or server error,
      // increase next request timeout
      attempts++;
      interval = computeNextTimeout(attempts);

      log('keepalive error: %o', error);
      config.onError && config.onError(error, attempts);
    }

    if (attempts > MAX_ATTEMPTS) {
      config.onError && config.onError(new Error('Max Attempts'), attempts);
    }

    if (error) return;

    const {
      bizCode,
      data = {
        interval,
      },
    } = response!.data;

    const {
      interval: expectedInterval, // in seconds
    } = data;

    // TODO
    // check bizCode

    interval = Math.min(expectedInterval * 1000, interval);
  }

  const worker = createWorker({
    work     : () => keepalive(),
    interval : () => interval,
    cancel   : () => request.cancel(),
  });

  return {
    ...worker,
    keepalive,
  };
}

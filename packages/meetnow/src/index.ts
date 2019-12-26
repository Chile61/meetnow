import debug from 'debug';
import { config, setupConfig } from './config';
import { createUA } from './user-agent';

export * from './user-agent';
export * from './conference';
export * from './channel';
export * from './media';
export * from './events';
export * from './reactive';
export * from './sdp-transform';

const version = '1.0.0-alpha';

export interface ConnectOptions {
  authorization?: {
    username: string;
    password: string;
  };
  displayName?: string;
  conference: {
    number: string;
    password?: string;
  };
}

// global setup
function setup() {
  setupConfig();

  debug.enable(config.get('debug', 'Meetnow:*,-Meetnow:Api*,-Meetnow:Information:Item,-Meetnow:Worker'));
}

function connect(options: ConnectOptions) {
  const ua = createUA();
}

export default {
  version,

  createUA,

  setup,
  connect,
};

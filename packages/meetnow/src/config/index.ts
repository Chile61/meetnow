import {
  config,
  configFromSession,
  configFromURL,
  saveConfig,
} from './config';

// export config
export * from './config';

export function setupConfig() {
  const win = window;
  const Meetnow = (win as any).Meetnow = (win as any).Meetnow || {};

  // create the Ionic.config from raw config object (if it exists)
  // and convert Ionic.config into a ConfigApi that has a get() fn
  const configObj = {
    ...configFromSession(win),
    persistent : false,
    ...Meetnow.config,
    ...configFromURL(win),
  };

  config.reset(configObj);

  if (config.getBoolean('persistent')) {
    saveConfig(win, configObj);
  }

  // first see if the mode was set as an attribute on <html>
  // which could have been set by the user, or by pre-rendering
  // otherwise get the mode via config settings, and fallback to md
  Meetnow.config = config;

  if (config.getBoolean('testing')) {
    config.set('debug', 'Meetnow:*');
  }
}
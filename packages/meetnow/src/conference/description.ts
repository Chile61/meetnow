import { createEvents } from '../events';

export function createDescription() {
  const events = createEvents();
  return {
    ...events,
  };
}

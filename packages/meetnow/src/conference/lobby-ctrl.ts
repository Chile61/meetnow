import debug from 'debug';
import { Api } from '../api';

const log = debug('MN:Information:Lobby');

export function createLobbyCtrl(api: Api) {
  async function remove(entity?: string) {
    log('remove()');

    const apiName = entity ? 'deleteUser' : 'rejectLobbyUserAll';
    await api
      .request(apiName)
      .data({ 'user-entity': entity })
      .send();
  }

  async function unhold(entity?: string) {
    log('unhold()');

    const apiName = entity ? 'acceptLobbyUser' : 'acceptLobbyUserAll';
    await api
      .request(apiName)
      .data({ 'user-entity': entity })
      .send();
  }
  async function allow(entity?: string) {
    log('allow()');

    await unhold(entity);
  }

  async function hold(entity?: string) {
    log('hold()');

    const apiName = entity ? 'waitLobbyUser' : 'waitLobbyUserAll';
    await api
      .request(apiName)
      .data({ 'user-entity': entity })
      .send();
  }

  return {
    remove,
    unhold,
    hold,
    allow,
  };
}

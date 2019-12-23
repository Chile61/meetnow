import { Api } from '../api';
import { createChannel } from './channel';

export interface MediaChannelConfigs {
  api: Api;
}

export function createMediaChannel(config: MediaChannelConfigs) {
  const { api } = config;
  let mediaVersion: number;
  let callId: string;

  const channel = createChannel({
    sendOffer : async (offer) => {
      let sdp: string;
      const response = await api
        .request(mediaVersion ? 'renegMedia' : 'joinMedia')
        .data({
          sdp             : offer.sdp,
          'media-version' : mediaVersion,
        })
        .send();

      ({
        sdp,
        'media-version': mediaVersion,
        'mcu-callid': callId,
      } = response.data.data);

      return { sdp };
    },
  });

  return {
    ...channel,
  };
}
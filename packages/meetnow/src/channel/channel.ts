import debug from 'debug';
import { createEvents } from '../events';
import { getUserMedia } from '../media/get-user-media';
import { closeMediaStream } from '../media/close-media-stream';
import { parse, write } from '../sdp-transform';
import { createRTCStats, RTCStats } from './rtc-stats';
import { getBrowser } from '../browser';

const log = debug('Meetnow:Channel');
const browser = getBrowser();

export enum STATUS {
  kNull = 0,
  kProgress = 1,
  kOffered = 2,
  kAccepted = 3,
  kAnswered = 4,
  kCanceled = 5,
  kTerminated = 6,
}

export type Originator = 'local' | 'remote';
export type OfferAnswer = { sdp: string };

export interface ChannelConfigs {
  invite: (offer: OfferAnswer) => OfferAnswer | Promise<OfferAnswer>;
  cancel: () => void | Promise<void>;
  bye: () => void | Promise<void>;
}

export interface ConnectOptions {
  rtcConstraints?: RTCConfiguration;
  rtcOfferConstraints?: RTCOfferOptions;
  mediaStream?: MediaStream;
  mediaConstraints?: MediaStreamConstraints;
}

export interface RenegotiateOptions {
  rtcConstraints?: RTCConfiguration;
  rtcOfferConstraints?: RTCOfferOptions;
  mediaStream?: MediaStream;
  mediaConstraints?: MediaStreamConstraints;
}

/**
 * Local variables.
 */
const holdMediaTypes = ['audio', 'video'];

export function createChannel(config: ChannelConfigs) {
  const {
    invite,
    cancel,
    bye,
  } = config;
  const events = createEvents(log);

  // The RTCPeerConnection instance (public attribute).
  let connection: RTCPeerConnection | undefined;
  let status: STATUS = STATUS.kNull;
  const rtcStats: RTCStats = createRTCStats();

  // Prevent races on serial PeerConnction operations.
  const connectionPromiseQueue = Promise.resolve();

  // Default rtcOfferConstraints(passed in connect()).
  let rtcConstraints: RTCConfiguration | undefined;
  let rtcOfferConstraints: RTCOfferOptions | undefined;

  // Local MediaStream.
  let localMediaStream: MediaStream | undefined;
  let localMediaStreamLocallyGenerated = false;

  // Flag to indicate PeerConnection ready for new actions.
  let rtcReady;
  let startTime: Date | undefined;
  let endTime: Date | undefined;

  // Mute/Hold state.
  let audioMuted = false;
  let videoMuted = false;
  let localHold = false;
  // there is no in dialog sdp offer, so remote hold is alway false
  const remoteHold = false;

  function throwIfStatus(condition: STATUS, message?: string) {
    if (status !== condition) return;
    throw new Error(message || 'Invalid State');
  }
  function throwIfTerminated() {
    throwIfStatus(STATUS.kTerminated, 'terminated');
  }

  function createRTCConnection(rtcConstraints?: RTCConfiguration) {
    log('createRTCConnection()');

    /* tslint:disable */
    connection = new RTCPeerConnection(rtcConstraints);

    connection.addEventListener('iceconnectionstatechange', () => {
      const {
        iceConnectionState: state,
      } = connection;

      if (state === 'failed') {
        events.emit('peerconnection:connectionfailed');
        /* eslint-disable-next-line no-use-before-define */
        close();
      }
    });

    events.emit('peerconnection', connection);
  }

  async function createLocalDescription(type: 'offer' | 'answer', constraints: RTCOfferOptions) {
    log('createLocalDescription()');

    rtcReady = false;
    let desc: RTCSessionDescriptionInit;

    if (type === 'offer') {
      try {
        desc = await connection.createOffer(constraints);
      } catch (error) {
        events.emit('peerconnection:createofferfailed', error);
        throw error;
      }
    } else if (type === 'answer') {
      try {
        desc = await connection.createAnswer(constraints);
      } catch (error) {
        events.emit('peerconnection:createanswerfailed', error);
        throw error;
      }
    } else {
      throw new Error('invalid type');
    }

    try {
      await connection.setLocalDescription(desc);
    } catch (error) {
      rtcReady = true;
      events.emit('peerconnection:setlocaldescriptionfailed', error);
      throw error;
    }

    await new Promise((resolve) => {
      // When remote fingerprint is changed, setRemoteDescription will not restart ice immediately,
      // and iceGatheringState stay complete for a while.
      // We will get a local sdp without ip candidates, if resolve right away.

      // if (type === 'offer' && connection.iceGatheringState === 'complete')

      // Resolve right away if 'pc.iceGatheringState' is 'complete'.

      if (connection.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      let finished = false;
      let listener;

      const ready = () => {
        connection.removeEventListener('icecandidate', listener);
        finished = true;
        resolve();
      };

      connection.addEventListener('icecandidate', listener = (event) => {
        const { candidate } = event;
        if (candidate) {
          events.emit('icecandidate', {
            candidate,
            ready,
          });
        } else if (!finished) {
          ready();
        }
      });
    });

    rtcReady = true;

    const { sdp } = connection.localDescription;

    desc = {
      originator : 'local',
      type,
      sdp,
    } as any;

    events.emit('sdp', desc);

    return desc.sdp;
  }

  async function connect(options: ConnectOptions = {}) {
    log('connect()');

    throwIfStatus(STATUS.kNull);

    if (!window.RTCPeerConnection) {
      throw new Error('WebRTC not supported');
    }

    status = STATUS.kProgress;
    /* eslint-disable-next-line no-use-before-define */
    onProgress('local');
    events.emit('connecting');

    ({
      rtcConstraints = {
        sdpSemantics : 'plan-b', // '' unified-plan plan-b
        iceServers   : [{ urls: 'stun:stun.l.google.com:19302' }],
      } as RTCConfiguration,
      rtcOfferConstraints = {
        offerToReceiveAudio : true,
        offerToReceiveVideo : true,
      },
    } = options);

    const {
      mediaStream,
      mediaConstraints = {
        audio : true,
        video : true,
      },
    } = options;

    throwIfTerminated();

    createRTCConnection(rtcConstraints);

    if (mediaStream) {
      localMediaStream = mediaStream;
      localMediaStreamLocallyGenerated = false;
    } else if (mediaConstraints.audio || mediaConstraints.video) {
      localMediaStream = await getUserMedia(mediaConstraints)
        .catch((error) => {
          if (status === STATUS.kTerminated) {
            throw new Error('terminated');
          }
          /* eslint-disable-next-line no-use-before-define */
          onFailed('local', null, 'User Denied Media Access');

          log('getusermedia failed: %o', error);

          throw error;
        });
      localMediaStreamLocallyGenerated = true;
    }

    throwIfTerminated();

    if (localMediaStream) {
      localMediaStream.getTracks().forEach((track) => {
        connection.addTrack(track, localMediaStream);
      });
    }

    const localSDP = await createLocalDescription('offer', rtcOfferConstraints);

    throwIfTerminated();

    status = STATUS.kOffered;

    const answer = await invite({ sdp: localSDP });

    status = STATUS.kAnswered;

    throwIfTerminated();

    const {
      sdp: remoteSDP,
    } = answer;

    const desc = {
      originator : 'remote',
      type       : 'answer',
      sdp        : remoteSDP,
    };

    events.emit('sdp', desc);

    try {
      connection.setRemoteDescription({
        type : 'answer',
        sdp  : desc.sdp,
      });
    } catch (error) {
      events.emit('peerconnection:setremotedescriptionfailed', error);
      throw error;
    }

    status = STATUS.kAccepted;
    /* eslint-disable-next-line no-use-before-define */
    onAccepted('local');
    events.emit('connected');
  }

  async function terminate() {
    throwIfStatus(STATUS.kTerminated);

    switch (status) {
      case STATUS.kProgress:
      case STATUS.kOffered:
        await cancel();
        status = STATUS.kCanceled;
        /* eslint-disable-next-line no-use-before-define */
        onFailed('local', null, 'Canceled');
        break;
      case STATUS.kAnswered:
      case STATUS.kAccepted:
        await bye();
        /* eslint-disable-next-line no-use-before-define */
        onEnded('local', null, 'Terminated');
        break;
      default:
        break;
    }
  }

  function close() {
    log('close()');

    if (status === STATUS.kTerminated) return;

    if (connection) {
      try {
        connection.close();
        connection = null;
      } catch (error) {
        log('error closing RTCPeerConnection %o', error);
      }
    }

    if (localMediaStream && localMediaStreamLocallyGenerated) {
      closeMediaStream(localMediaStream);
    }

    localMediaStream = null;
    localMediaStreamLocallyGenerated = false;

    rtcStats.clear();

    status = STATUS.kTerminated;
  }

  function toggleMuteAudio(mute: boolean) {
    connection.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === 'audio') {
        sender.track.enabled = !mute;
      }
    });
  }

  function toggleMuteVideo(mute: boolean) {
    connection.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === 'video') {
        sender.track.enabled = !mute;
      }
    });
  }

  function setLocalMediaStatus() {
    let enableAudio = true;
    let enableVideo = true;

    if (localHold || (remoteHold && localMediaStreamLocallyGenerated)) {
      enableAudio = false;
      enableVideo = false;
    }

    if (audioMuted) {
      enableAudio = false;
    }

    if (videoMuted) {
      enableVideo = false;
    }

    toggleMuteAudio(!enableAudio);
    toggleMuteVideo(!enableVideo);
  }

  function onProgress(originator: Originator, message?: string) {
    log('channel progress');

    events.emit('progress', {
      originator,
      message,
    });
  }

  function onAccepted(originator: Originator, message?: string) {
    log('channel accepted');

    events.emit('accepted', {
      originator,
      message,
    });
  }

  function onEnded(originator: Originator, message?: string, cause?: string) {
    log('channel ended');

    close();

    events.emit('ended', {
      originator,
      message,
      cause,
    });
  }

  function onFailed(originator: Originator, message?: string, cause?: string) {
    log('channel failed');

    close();

    events.emit('failed', {
      originator,
      message,
      cause,
    });
  }

  function onMute() {
    setLocalMediaStatus();

    events.emit('mute', {
      audio : audioMuted,
      video : videoMuted,
    });
  }
  function onUnMute() {
    setLocalMediaStatus();

    events.emit('unmute', {
      audio : !audioMuted,
      video : !videoMuted,
    });
  }
  function onHold(originator: 'local' | 'remote') {
    setLocalMediaStatus();

    events.emit('hold', {
      originator,
      localHold,
      remoteHold,
    });
  }
  function onUnHold(originator: 'local' | 'remote') {
    setLocalMediaStatus();

    events.emit('unhold', {
      originator,
      localHold,
      remoteHold,
    });
  }

  function mute(options = { audio: true, video: false }) {
    log('mute()');

    let changed = false;

    if (audioMuted === false && options.audio) {
      changed = true;
      audioMuted = true;
    }

    if (videoMuted === false && options.video) {
      changed = true;
      videoMuted = true;
    }

    if (changed) {
      onMute();
    }
  }

  function unmute(options = { audio: true, video: true }) {
    log('unmute()');

    let changed = false;

    if (audioMuted === true && options.audio) {
      changed = true;
      audioMuted = false;
    }

    if (videoMuted === true && options.video) {
      changed = true;
      videoMuted = false;
    }

    if (changed) {
      onUnMute();
    }
  }

  async function hold() {
    log('unhold()');

    if (localHold) {
      log('Already hold');
      return;
    }

    localHold = true;

    onHold('local');

    /* eslint-disable-next-line no-use-before-define */
    await renegotiate();
  }

  async function unhold() {
    log('unhold()');

    if (!localHold) {
      log('Already unhold');
      return;
    }

    localHold = false;

    onUnHold('local');

    /* eslint-disable-next-line no-use-before-define */
    await renegotiate();
  }

  async function renegotiate(options: RenegotiateOptions = {}) {
    log('renegotiate()');

    if (!rtcReady) {
      log('RTC not ready');
      return;
    }

    const localSDP = await createLocalDescription('offer', rtcOfferConstraints);

    /* eslint-disable-next-line no-use-before-define */
    const answer = await invite({ sdp: mangleOffer(localSDP) });

    const desc = {
      originator : 'remote',
      type       : 'answer',
      sdp        : answer.sdp,
    };

    events.emit('sdp', desc);

    try {
      connection.setRemoteDescription({
        type : 'answer',
        sdp  : desc.sdp,
      });
    } catch (error) {
      events.emit('peerconnection:setremotedescriptionfailed', error);
      throw error;
    }
  }

  function mangleOffer(offer: string) {
    log('mangleOffer()');

    // nothing to do
    if (!localHold && !remoteHold) return offer;

    const sdp = parse(offer);

    // Local hold.
    if (localHold && !remoteHold) {
      for (const m of sdp.media) {
        if (holdMediaTypes.indexOf(m.type) === -1) {
          continue;
        }
        if (!m.direction) {
          m.direction = 'sendonly';
        } else if (m.direction === 'sendrecv') {
          m.direction = 'sendonly';
        } else if (m.direction === 'recvonly') {
          m.direction = 'inactive';
        }
      }
    // Local and remote hold.
    } else if (localHold && remoteHold) {
      for (const m of sdp.media) {
        if (holdMediaTypes.indexOf(m.type) === -1) {
          continue;
        }
        m.direction = 'inactive';
      }
    // Remote hold.
    } else if (remoteHold) {
      for (const m of sdp.media) {
        if (holdMediaTypes.indexOf(m.type) === -1) {
          continue;
        }
        if (!m.direction) {
          m.direction = 'recvonly';
        } else if (m.direction === 'sendrecv') {
          m.direction = 'recvonly';
        } else if (m.direction === 'recvonly') {
          m.direction = 'inactive';
        }
      }
    }

    return write(sdp);
  }

  function getLocalStream() {
    log('getLocalStream()');

    let stream: MediaStream | undefined;

    if (connection.getSenders) {
      stream = new window.MediaStream();

      connection
        .getSenders()
        .forEach((sender) => {
          const { track } = sender;
          if (track) {
            stream.addTrack(track);
          }
        });
    } else if ((connection as any).getLocalStreams) {
      stream = (connection as any).getLocalStreams()[0];
    }

    return stream;
  }
  function getRemoteStream() {
    log('getRemoteStream()');

    let stream: MediaStream | undefined;

    if (connection.getReceivers) {
      stream = new window.MediaStream();

      connection
        .getReceivers()
        .forEach((receiver) => {
          const { track } = receiver;
          if (track) {
            stream.addTrack(track);
          }
        });
    } else if ((connection as any).getRemoteStreams) {
      stream = (connection as any).getRemoteStreams()[0];
    }

    return connection;
  }

  function addLocalStream(stream?: MediaStream) {
    log('addLocalStream()');

    if (!stream) return;

    if (connection.addTrack) {
      stream
        .getTracks()
        .forEach((track) => {
          connection.addTrack(track, stream);
        });
    } else if ((connection as any).addStream) {
      (connection as any).addStream(stream);
    }
  }
  function removeLocalStream() {
    log('removeLocalStream()');

    if (connection.getSenders && connection.removeTrack) {
      connection.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
        connection.removeTrack(sender);
      });
    } else if ((connection as any).getLocalStreams && (connection as any).removeStream) {
      (connection as any)
        .getLocalStreams()
        .forEach((stream) => {
          stream
            .getTracks()
            .forEach((track) => {
              track.stop();
            });

          (connection as any).removeStream(stream);
        });
    }
  }

  async function replaceLocalStream(stream?: MediaStream, renegotiation: boolean = false) {
    log('replaceLocalStream()');

    const audioTrack = stream ? stream.getAudioTracks()[0] : null;
    const videoTrack = stream ? stream.getVideoTracks()[0] : null;

    const queue = [];

    let renegotiationNeeded = false;
    let peerHasAudio = false;
    let peerHasVideo = false;

    if (connection.getSenders) {
      connection.getSenders().forEach((sender) => {
        if (!sender.track) return;
        peerHasAudio = sender.track.kind === 'audio' || peerHasAudio;
        peerHasVideo = sender.track.kind === 'video' || peerHasVideo;
      });

      renegotiationNeeded = (Boolean(audioTrack) !== peerHasAudio)
                             || (Boolean(videoTrack) !== peerHasVideo)
                             || renegotiation;

      if (renegotiationNeeded) {
        removeLocalStream();
        addLocalStream(stream);

        queue.push(renegotiate());
      } else {
        connection.getSenders().forEach((sender) => {
          if (!sender.track) return;

          if (!sender.replaceTrack
            && !((sender as any).prototype && (sender as any).prototype.replaceTrack)
          ) {
            /* eslint-disable-next-line no-use-before-define */
            shimReplaceTrack(sender);
          }

          if (audioTrack && sender.track.kind === 'audio') {
            queue.push(
              sender.replaceTrack(audioTrack)
                .catch((e) => {
                  log('replace audio track error: %o', e);
                }),
            );
          }
          if (videoTrack && sender.track.kind === 'video') {
            queue.push(
              sender.replaceTrack(videoTrack)
                .catch((e) => {
                  log('replace video track error: %o', e);
                }),
            );
          }
        });
      }
    }

    function shimReplaceTrack(sender: RTCRtpSender) {
      sender.replaceTrack = async function replaceTrack(newTrack: MediaStreamTrack) {
        connection.removeTrack(sender);
        connection.addTrack(newTrack, stream);

        const offer = await connection.createOffer();

        offer.type = connection.localDescription.type;
        /* eslint-disable-next-line no-use-before-define */
        offer.sdp = replaceSSRCs(connection.localDescription.sdp, offer.sdp);

        await connection.setLocalDescription(offer);
        await connection.setRemoteDescription(connection.remoteDescription);
      };
    }

    await Promise.all(queue);
  }

  function replaceSSRCs(currentDescription, newDescription) {
    let ssrcs = currentDescription.match(/a=ssrc-group:FID (\d+) (\d+)\r\n/);
    let newssrcs = newDescription.match(/a=ssrc-group:FID (\d+) (\d+)\r\n/);

    if (!ssrcs) { // Firefox offers wont have FID yet
      ssrcs = currentDescription.match(/a=ssrc:(\d+) cname:(.*)\r\n/g)[1]
        .match(/a=ssrc:(\d+)/);
      newssrcs = newDescription.match(/a=ssrc:(\d+) cname:(.*)\r\n/g)[1]
        .match(/a=ssrc:(\d+)/);
    }
    for (let i = 1; i < ssrcs.length; i++) {
      newDescription = newDescription.replace(new RegExp(newssrcs[i], 'g'), ssrcs[i]);
    }

    return newDescription;
  }

  async function adjustBandWith({ audio, video }) {
    log('adjustBandWith()');

    const queue = [];

    if ('RTCRtpSender' in window
    && 'setParameters' in window.RTCRtpSender.prototype) {
      connection.getSenders().forEach((sender) => {
        if (sender.track) return;

        const parameters = sender.getParameters();

        if (typeof audio !== 'undefined' && sender.track.kind === 'audio') {
          if (audio === 0) {
            delete parameters.encodings[0].maxBitrate;
          } else {
            parameters.encodings[0].maxBitrate = audio * 1024;
          }

          queue.push(
            sender.setParameters(parameters)
              .catch((e) => {
                log('apply audio parameters error: %o', e);
              }),
          );
        }

        if (typeof video !== 'undefined' && sender.track.kind === 'video') {
          if (video === 0) {
            delete parameters.encodings[0].maxBitrate;
          } else {
            parameters.encodings[0].maxBitrate = video * 1024;
          }

          queue.push(
            sender.setParameters(parameters)
              .catch((e) => {
                log('apply video parameters error: %o', e);
              }),
          );
        }
      });
    } else {
      // Fallback to the SDP munging with local renegotiation way of limiting
      // the bandwidth.
      queue.push(
        connection.createOffer()
          .then((offer) => connection.setLocalDescription(offer))
          .then(() => {
            const sdp = parse(connection.remoteDescription.sdp);

            for (const m of sdp.media) {
              if (typeof audio !== 'undefined' && m.type === 'audio') {
                if (audio === 0) {
                  m.bandwidth = [];
                } else {
                  m.bandwidth = [
                    {
                      type  : 'TIAS',
                      limit : Math.ceil(audio * 1024),
                    },
                  ];
                }
              }
              if (typeof video !== 'undefined' && m.type === 'video') {
                if (video === 0) {
                  m.bandwidth = [];
                } else {
                  m.bandwidth = [
                    {
                      type  : 'TIAS',
                      limit : Math.ceil(video * 1024),
                    },
                  ];
                }
              }
            }

            const desc = {
              type : connection.remoteDescription.type,
              sdp  : write(sdp),
            };

            return connection.setRemoteDescription(desc);
          })
          .catch((e) => {
            log('applying bandwidth restriction to setRemoteDescription error: %o', e);
          }),
      );
    }

    await Promise.all(queue);
  }

  async function applyConstraints({ audio, video }) {
    log('applyConstraints()');

    const queue = [];

    if (connection.getSenders && window.MediaStreamTrack.prototype.applyConstraints) {
      connection.getSenders().forEach((sender) => {
        if (audio && sender.track && sender.track.kind === 'audio') {
          queue.push(
            sender.track.applyConstraints(audio)
              .catch((e) => {
                log('apply audio constraints error: %o', e);
              }),
          );
        }

        if (video && sender.track && sender.track.kind === 'video') {
          queue.push(
            sender.track.applyConstraints(video)
              .catch((e) => {
                log('apply video constraints error: %o', e);
              }),
          );
        }
      });
    }

    await Promise.all(queue);
  }

  async function getStats() {
    log('getStats()');

    if (connection.signalingState === 'stable') {
      let stats;
      // use legacy getStats()
      // the new getStats() won't report 'packetsLost' in 'outbound-rtp'
      if (browser.chrome) {
        stats = await new Promise((resolve) => {
          (connection as any).getStats((stats) => {
            resolve(stats.result());
          });
        });
      } else {
        stats = await connection.getStats();
      }

      rtcStats.update(stats);
    } else {
      log('update rtc stats failed since connection is unstable.');
    }

    return rtcStats;
  }

  return {
    ...events,

    get status() {
      return status;
    },
    get connection() {
      return connection;
    },

    connect,
    terminate,

    renegotiate,

    mute,
    unmute,

    hold,
    unhold,

    getLocalStream,
    getRemoteStream,

    addLocalStream,
    removeLocalStream,
    replaceLocalStream,

    adjustBandWith,
    applyConstraints,

    getStats,
  };
}

export type Channel = ReturnType<typeof createChannel>;

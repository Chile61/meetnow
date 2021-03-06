const MAX_ARCHIVE_SIZE = 10;

export interface ParsedStats {
  audio?: any;
  video?: any;
}

export interface ParsedStatsReport {
  quality: number;
  inbound: ParsedStats;
  outbound: ParsedStats;
}

export interface RTCStats {
  readonly quality: number;
  readonly inbound: ParsedStats;
  readonly outbound: ParsedStats;

  update: (report: RTCStatsReport) => void;
  clear: () => void;
}

export function createRTCStats(): RTCStats {
  let quality: number = -1;
  let inbound = {} as ParsedStats;
  let outbound = {} as ParsedStats;
  let archives = [] as ParsedStatsReport[];
  const maxArchiveSize = MAX_ARCHIVE_SIZE;

  let rtcstats: any;

  function clear() {
    quality = -1;
    inbound = {} as ParsedStats;
    outbound = {} as ParsedStats;
    archives = [] as ParsedStatsReport[];
  }

  function update(report: RTCStatsReport) {
    const latestInbound = {} as ParsedStats;
    const latestOutbound = {} as ParsedStats;
    let isLegacyStats = false;

    report.forEach((stats) => {
      if (typeof stats.stat === 'function') {
        isLegacyStats = true;
      }

      switch (stats.type) {
        case 'codec':
          break;
        case 'inbound-rtp':
          if (!stats.isRemote || stats.isRemote === false) {
            /* eslint-disable-next-line no-use-before-define */
            latestInbound[stats.mediaType as keyof ParsedStats] = parseRTPStats(report, stats);
          }
          break;
        case 'outbound-rtp':
          if (!stats.isRemote || stats.isRemote === false) {
            /* eslint-disable-next-line no-use-before-define */
            latestOutbound[stats.mediaType as keyof ParsedStats] = parseRTPStats(report, stats);
          }
          break;
        // case 'remote-inbound-rtp':
        //   break;
        // case 'remote-outbound-rtp':
        //   break;
        // case 'csrc':
        //   break;
        // case 'peer-connection':
        //   break;
        // case 'data-channel':
        //   break;
        // case 'stream':
        //   break;
        // case 'track':
        //   break;
        // case 'sender':
        //   break;
        // case 'receiver':
        //   break;
        // case 'transport':
        //   break;
        // case 'candidate-pair':
        //   break;
        // case 'local-candidate':
        //   break;
        // case 'remote-candidate':
        //   break;
        // case 'certificate':
        //   break;
        case 'ssrc':
          /* eslint-disable-next-line no-use-before-define */
          parseSSRCStats(report, stats, isLegacyStats);

          if (/recv/g.test(stats.id)) {
            latestInbound[stats.mediaType as keyof ParsedStats] = stats;
          }
          if (/send/g.test(stats.id)) {
            latestOutbound[stats.mediaType as keyof ParsedStats] = stats;
          }
          break;
        default:
          break;
      }
    });

    /* eslint-disable-next-line no-use-before-define */
    updateRTPStats(latestInbound.audio, 'inbound');
    /* eslint-disable-next-line no-use-before-define */
    updateRTPStats(latestInbound.video, 'inbound');
    /* eslint-disable-next-line no-use-before-define */
    updateRTPStats(latestOutbound.audio, 'outbound');
    /* eslint-disable-next-line no-use-before-define */
    updateRTPStats(latestOutbound.video, 'outbound');

    let totalPacketsLostRate = 0;
    let totalChannel = 0;

    if (inbound.audio) {
      totalChannel++;
      totalPacketsLostRate += inbound.audio.packetsLostRate || 0;
    }
    if (inbound.video) {
      totalChannel++;
      totalPacketsLostRate += inbound.video.packetsLostRate || 0;
    }

    if (totalChannel) {
      const average = totalPacketsLostRate / totalChannel;

      quality = average >= 12 ? 0
        : average >= 5 ? 1
          : average >= 3 ? 2
            : average >= 2 ? 3
              : 4;
    }
    /* eslint-disable-next-line no-use-before-define */
    archive();
  }

  function parseRTPStats(report: RTCStatsReport, stats: any) {
    const codec = report.get(stats.codecId);
    const track = report.get(stats.trackId);
    const transport = report.get(stats.transportId);
    const remote = report.get(stats.remoteId);

    if (codec) {
      codec.name = codec.mimeType.split('/')[1];
    }

    if (!stats.codecId || !stats.trackId || !stats.transportId) {
      // TODO
    }

    if (transport) {
      const localCertificate = report.get(transport.localCertificateId);
      const remoteCertificate = report.get(transport.remoteCertificateId);
      const selectedCandidatePair = report.get(transport.selectedCandidatePairId);

      transport.localCertificate = localCertificate;
      transport.remoteCertificate = remoteCertificate;
      transport.selectedCandidatePair = selectedCandidatePair;
    }

    if (remote) {
      stats.packetsLost = remote.packetsLost || stats.packetsLost;
    }

    stats.codec = codec;
    stats.track = track;
    stats.transport = transport;

    return stats;
  }

  function parseSSRCStats(report: RTCStatsReport, stats: any, isLegacyStats: boolean = false) {
    if (isLegacyStats) {
      stats.mediaType = stats.stat('mediaType');
      stats.googCodecName = stats.stat('googCodecName');
      stats.codecImplementationName = stats.stat('codecImplementationName');
      stats.googFrameHeightReceived = stats.stat('googFrameHeightReceived');
      stats.googFrameHeightSent = stats.stat('googFrameHeightSent');
      stats.googFrameWidthReceived = stats.stat('googFrameWidthReceived');
      stats.googFrameWidthSent = stats.stat('googFrameWidthSent');
      stats.googFrameRateReceived = stats.stat('googFrameRateReceived');
      stats.googFrameRateSent = stats.stat('googFrameRateSent');
      stats.packetsLost = stats.stat('packetsLost');
      stats.packetsSent = stats.stat('packetsSent');
      stats.packetsReceived = stats.stat('packetsReceived');
      stats.bytesSent = stats.stat('bytesSent');
      stats.bytesReceived = stats.stat('bytesReceived');
    }

    const codec = {
      name               : stats.googCodecName,
      implementationName : stats.codecImplementationName,
    };

    const track = {
      frameHeight : stats.googFrameHeightReceived || stats.googFrameHeightSent,
      frameWidth  : stats.googFrameWidthReceived || stats.googFrameWidthSent,
      frameRate   : stats.googFrameRateReceived || stats.googFrameRateSent,
    };

    stats.codec = codec;
    stats.track = track;

    return stats;
  }

  function updateRTPStats(stats: any, direction: 'inbound' | 'outbound') {
    if (!stats) {
      return;
    }

    const prestats = rtcstats[direction][stats.mediaType];

    const diff = (x: any = {}, y: any = {}, key: string) => {
      if (typeof x[key] !== 'undefined' && typeof y[key] !== 'undefined') {
        return Math.abs(x[key] - y[key]);
      }
      return 0;
    };

    const safe = (x: number) => {
      if (!Number.isFinite(x)) { return 0; }
      if (Number.isNaN(x)) { return 0; }
      return x;
    };

    if (prestats) {
      if (prestats.trackId ? Boolean(stats.trackId) : true) {
        const timeDiff = diff(stats, prestats, 'timestamp');
        let valueDiff;

        // calc packetsLostRate
        if (direction === 'outbound' && !stats.packetsLostRate) {
          /* eslint-disable-next-line no-use-before-define */
          const archived = getArchive()[direction][stats.mediaType as keyof ParsedStats];

          const lostDiff = diff(stats, archived, 'packetsLost');
          const sentDiff = diff(stats, archived, 'packetsSent');
          const totalPackets = lostDiff + sentDiff;

          stats.packetsLostRate = totalPackets === 0 ? 0 : safe(lostDiff / totalPackets);
          stats.packetsLostRate *= 100;
        }
        if (direction === 'inbound' && !stats.packetsLostRate) {
          /* eslint-disable-next-line no-use-before-define */
          const archived = getArchive()[direction][stats.mediaType as keyof ParsedStats];

          const lostDiff = diff(stats, archived, 'packetsLost');
          const receivedDiff = diff(stats, archived, 'packetsReceived');
          const totalPackets = lostDiff + receivedDiff;

          stats.packetsLostRate = totalPackets === 0 ? 0 : safe(lostDiff / totalPackets);
          stats.packetsLostRate *= 100;
        }

        // calc outgoingBitrate
        if (direction === 'outbound' && !stats.outgoingBitrate) {
          valueDiff = diff(stats, prestats, 'bytesSent');

          stats.outgoingBitrate = safe(valueDiff * 8 / timeDiff);
        }
        // calc incomingBitrate
        if (direction === 'inbound' && !stats.incomingBitrate) {
          valueDiff = diff(stats, prestats, 'bytesReceived');

          stats.incomingBitrate = safe(valueDiff * 8 / timeDiff);
        }

        // calc transport outgoingBitrate
        if (stats.transport && prestats.transport && !stats.transport.outgoingBitrate) {
          valueDiff = diff(stats.transport, prestats.transport, 'bytesSent');

          stats.transport.outgoingBitrate = safe(valueDiff * 8 / timeDiff);
        }
        // calc transport incomingBitrate
        if (stats.transport && prestats.transport && !stats.transport.incomingBitrate) {
          valueDiff = diff(stats.transport, prestats.transport, 'bytesReceived');

          stats.transport.incomingBitrate = safe(valueDiff * 8 / timeDiff);
        }

        // calc frameRate
        if (stats.mediaType === 'video' && stats.track && prestats.track && !stats.track.frameRate) {
          if (direction === 'inbound') {
            valueDiff = diff(stats.track, prestats.track, 'framesReceived');
          }
          if (direction === 'outbound') {
            valueDiff = diff(stats.track, prestats.track, 'framesSent');
          }

          stats.track.frameRate = valueDiff ? safe(valueDiff / timeDiff * 1000) : 0;
        }

        rtcstats[direction][stats.mediaType] = stats;
      }
    } else {
      rtcstats[direction][stats.mediaType] = stats;
    }
  }

  function archive() {
    if (archives.length === maxArchiveSize) {
      archives.shift();
    }
    archives.push({
      quality,
      inbound,
      outbound,
    });
  }
  function getArchive(index = 0) {
    const { length } = archives;
    index = Math.max(index, 0);
    index = Math.min(index, length - 1);
    return archives[index];
  }

  return rtcstats = {
    get quality() {
      return quality;
    },
    get inbound() {
      return inbound;
    },
    get outbound() {
      return outbound;
    },

    update,
    clear,
  };
}

import SDPTransform from '../sdp-transform';

export interface Options {
  width?: number;
  height?: number;
  frameRate?: number;
  highFrameRate?: boolean;
}

export interface Data {
  originator: 'local' | 'remote';
  type: 'offer' | 'answer';
  sdp: string;
}

export function modify(data: Data, options?: Options) {
  const {
    width = 1920,
    height = 1080,
    frameRate = 30,
    highFrameRate = false,
  } = options || {};
  const sdp = SDPTransform.parse(data.sdp);

  const maxWidth = width || 1920;
  const maxHeight = height || 1080;
  const maxFrameRate = frameRate || 30;

  const maxFrameSize = Math.ceil(maxWidth * maxHeight / 255);
  const maxMbps = Math.ceil(maxFrameRate * maxFrameSize);

  let bandwidth = maxHeight >= 1080
    ? 2048
    : maxHeight >= 720
      ? 1280
      : maxHeight >= 360
        ? 512
        : 512;

  bandwidth = Math.ceil(bandwidth * maxFrameRate / 30); // calc frameRate ratio

  // process sdp
  for (const m of sdp.media) {
    /*
      m.candidates = m.candidates.filter((c) =>
      {
        return c.component === 1;
      });
      */

    if (m.type === 'video') {
      m.content = this.type;
      m.bandwidth = [
        {
          type  : 'TIAS',
          limit : Math.ceil(bandwidth * 1024),
        },
      ];

      const vp8Payloads = new Set<number>();
      const h264Payloads = new Set<number>();

      const vp8Config = [`max-fr=${ maxFrameRate }`, `max-fs=${ maxFrameSize }`];
      const h264Config = [`max-mbps=${ maxMbps }`, `max-fs=${ maxFrameSize }`];

      // find codec payload
      for (const r of m.rtp) {
        const codec = r.codec.toUpperCase();
        let fmtp = null;

        switch (codec) {
          case 'VP8':
          case 'VP9':
            vp8Payloads.add(Number(r.payload));
            fmtp = m.fmtp.find((f) => (f.payload === r.payload));
            if (fmtp) {
              fmtp.config = fmtp.config.split(';')
                .filter((p) => { return !(/^max-fr/.test(p) || /^max-fs/.test(p)); })
                .concat(vp8Config)
                .join(';');
            } else {
              m.fmtp.push({
                payload : r.payload,
                config  : vp8Config.join(';'),
              });
            }
            break;
          case 'H264':
            h264Payloads.add(Number(r.payload));
            fmtp = m.fmtp.find((f) => (f.payload === r.payload));
            if (fmtp) {
              if (highFrameRate
                  && fmtp.config.indexOf('profile-level-id=42e01f') !== -1
                  && data.originator === 'local'
                  && data.type === 'offer') {
                fmtp.config = fmtp.config.split(';')
                  .filter((p) => { return !(/^max-mbps/.test(p) || /^max-fs/.test(p) || /^profile-level-id/.test(p)); })
                  .concat(['profile-level-id=64001f'])
                  .concat(h264Config)
                  .join(';');
              } else if (highFrameRate
                  && fmtp.config.indexOf('profile-level-id=64001f') !== -1
                  && data.originator === 'remote'
                  && data.type === 'answer') {
                fmtp.config = fmtp.config.split(';')
                  .filter((p) => { return !(/^max-mbps/.test(p) || /^max-fs/.test(p) || /^profile-level-id/.test(p)); })
                  .concat(['profile-level-id=42e01f'])
                  .concat(h264Config)
                  .join(';');
              } else {
                fmtp.config = fmtp.config.split(';')
                  .filter((p) => { return !(/^max-mbps/.test(p) || /^max-fs/.test(p)); })
                  .concat(h264Config)
                  .join(';');
              }
            } else {
              m.fmtp.push({
                payload : r.payload,
                config  : h264Config.join(';'),
              });
            }
            break;
          default:
            break;
        }
      }

      for (const f of m.fmtp) {
        const aptConfig = f.config
          .split(';')
          .find((p) => { return /^apt=/.test(p); });

        if (!aptConfig) { continue; }

        const apt = aptConfig.split('=')[1];

        if (vp8Payloads.has(Number(apt))) {
          vp8Payloads.add(Number(f.payload));
        } else
        if (h264Payloads.has(Number(apt))) {
          h264Payloads.add(Number(f.payload));
        }
      }

      let preferCodec = h264Payloads;
      const unsupportCodec = new Set<number>();

      // firefox do not support multiple h264 codec/decode insts
      // when content sharing or using multiple tab, codec/decode might be error.
      // and chrome ver58 has a really low resolution in h264 codec when content sharing.
      // use VP8/VP9 first
      if (
        firefox
          || (chrome && parseInt(version) < 63 && this.type === TYPE.SLIDES)
      ) {
        preferCodec = vp8Payloads;
      }

      // if (data.originator === 'local')
      {
        let payloads: (string | number)[] = String(m.payloads).split(' ');

        payloads = payloads.filter((p) => { return !preferCodec.has(Number(p)); });
        payloads = payloads.filter((p) => { return !unsupportCodec.has(Number(p)); });
        payloads = Array.from(preferCodec)
          .sort((x, y) => (x - y))
          .concat(payloads as any);

        m.rtp = m.rtp.filter((r) => !unsupportCodec.has(Number(r.payload)));
        m.fmtp = m.fmtp.filter((r) => !unsupportCodec.has(Number(r.payload)));

        const rtps = []; const
          fmtps = [];

        payloads.forEach((p) => {
          const rtp = m.rtp.find((r) => r.payload === Number(p));
          const fmtp = m.fmtp.find((f) => f.payload === Number(p));

          if (rtp) rtps.push(rtp);
          if (fmtp) fmtps.push(fmtp);
        });

        m.rtp = rtps;
        m.fmtp = fmtps;

        m.payloads = payloads.join(' ');
      }
    }

    if (m.type === 'audio') {
      m.bandwidth = [
        {
          type  : 'TIAS',
          limit : Math.ceil(128 * 1024),
        },
      ];
    }
  }

  // filter out unsupported application media
  sdp.media = sdp.media.filter((m) => m.type !== 'application' || /TLS/.test(m.protocol));

  if (data.originator === 'local') {
    if (this._iceTimeOut) {
      clearTimeout(this._iceTimeOut);
      this._iceTimeOut = null;
    }
  }

  if (data.originator === 'remote') {
    sdp.media.forEach((m) => {
      const payloads = String(m.payloads).split(' ');

      if (m.rtcpFb) {
        const rtcpFb = [];

        m.rtcpFb.forEach((fb) => {
          if (fb.payload === '*' || payloads.includes(`${ fb.payload }`)) {
            rtcpFb.push(fb);
          }
        });

        m.rtcpFb = rtcpFb;
      }

      if (m.fmtp) {
        const fmtp = [];

        m.fmtp.forEach((fm) => {
          if (fm.payload === '*' || payloads.includes(`${ fm.payload }`)) {
            fmtp.push(fm);
          }
        });

        m.fmtp = fmtp;
      }

      if (m.rtp) {
        const rtp = [];

        m.rtp.forEach((r) => {
          if (r.payload === '*' || payloads.includes(`${ r.payload }`)) {
            rtp.push(r);
          }
        });

        m.rtp = rtp;
      }
    });

    if (data.type === 'offer' && firefox) {
      sdp.media.forEach((ele) => {
        if (ele.type === 'audio' && ele.mid === undefined) {
          ele.mid = 0;
        } else if (ele.type === 'video' && ele.mid === undefined) {
          ele.mid = 1;
        }
      });
    }
  }

  data.sdp = SDPTransform.write(sdp);
}
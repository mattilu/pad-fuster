const { EventEmitter } = require('events');
const { sprintf } = require('sprintf-js');
const { NullLog, toHex, xor } = require('./utils');

class Cracker {
  constructor(args) {
    this.oracle = args.oracle;
    this.concurrency = args.concurrency || 64;
    this.log = args.log || new NullLog();
  }

  async crack(block) {
    const intermediate = [];
    while (intermediate.length < block.length) {
      // eslint-disable-next-line no-await-in-loop
      const byte = await this.crackByte(block, intermediate);
      intermediate.unshift(byte);
    }
    return Buffer.from(intermediate);
  }

  async crackByte(block, intermediate) {
    const log = this.log;

    const pad = intermediate.length + 1;
    const index = block.length - pad;
    const plain = Buffer.alloc(pad).fill(pad);
    const ivHead = Buffer.alloc(index, 0);
    const ivTail = xor(plain, intermediate);

    log.debug(`IV: ${toHex(ivHead)}??${toHex(ivTail)}`);

    const probes = Array.from({ length: 256 }, (_, byte) => {
      const iv = Buffer.allocUnsafe(block.length);
      ivHead.copy(iv);
      iv[index] = byte;
      ivTail.copy(iv, index + 1);
      const payload = Buffer.concat([iv, block], block.length * 2);
      return {
        byte,
        iv,
        block,
        payload,
      };
    });

    const result = await new Promise((resolve, reject) => {
      let count = 0;
      let pending = 0;

      const emitter = new EventEmitter();
      emitter.on('probe-next', () => {
        if (probes.length === 0) {
          if (pending === 0) {
            emitter.emit('done', null);
          }
          return;
        }

        const probe = probes.pop();
        pending += 1;
        emitter.emit('probe-start', probe);
      });
      emitter.on('probe-start', (probe) => {
        this.oracle.test(probe, (err, res) => {
          emitter.emit('probe-complete', probe, err, res);
        });
      });
      emitter.on('probe-complete', (probe, err, res) => {
        count += 1;
        pending -= 1;

        if (err) {
          emitter.emit('probe-next');
          return;
        }

        if (res.debugData) {
          log.trace(`IV: ${toHex(res.probe.iv)} | ${res.debugData} [${count}/256]`);
        }

        if (res.result) {
          emitter.emit('done', {
            probe: res.probe,
            count,
          });
        } else {
          emitter.emit('probe-next');
        }
      });
      emitter.on('done', (res) => {
        emitter.removeAllListeners();
        if (res) {
          resolve(res);
        } else {
          reject(new Error('Oracle returned false for all probes :('));
        }
      });

      for (let i = 0; i < this.concurrency; ++i) {
        emitter.emit('probe-next');
      }
    });

    const count = result.count;
    const byte = result.probe.byte;
    const r = byte ^ pad; // eslint-disable-line no-bitwise

    log.info(`Found byte ${index} after ${count} requests`);
    log.debug(sprintf(' Probe=%02x, Plain=%02x -> Intermediate=%02x', byte, pad, r));

    return r;
  }
}

module.exports = {
  Cracker,
};

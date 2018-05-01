const { pseudoRandomBytes } = require('crypto');


function makeBlocks(data, blockSize) {
  const blocks = [];
  for (let i = 0; i < data.length; i += blockSize) {
    blocks.push(data.slice(i, i + blockSize));
  }
  return blocks;
}

function getRandomBytes(n) {
  return pseudoRandomBytes(n);
}

function xor(bufA, bufB) {
  const n = Math.min(bufA.length, bufB.length);
  const r = Buffer.allocUnsafe(n);
  for (let i = 0; i < n; ++i) {
    r[i] = bufA[i] ^ bufB[i]; // eslint-disable-line no-bitwise
  }
  return r;
}

function pad(buf, blockSize) {
  const n = blockSize - (buf.length % blockSize);
  return Buffer.concat([buf, Buffer.alloc(n, n)]);
}

function unpad(buf, blockSize) {
  const n = buf[buf.length - 1];
  if (n <= 0 || n > blockSize || n > buf.length) {
    throw new Error('Invalid Padding');
  }

  for (let i = 2; i <= n; ++i) {
    if (buf[buf.length - i] !== n) {
      throw new Error('Invalid Padding');
    }
  }

  return buf.slice(0, buf.length - n);
}

function toBase64(buf) {
  return buf.toString('base64');
}

function toHex(buf) {
  return buf.toString('hex');
}

function toUtf8(buf) {
  return buf.toString('utf-8');
}

function encode(buf, encoding) {
  switch (encoding) {
    case 'base64':
      return toBase64(buf);
    case 'hex':
      return toHex(buf);
    case 'utf-8':
    case 'utf8':
    case 'raw':
      return toUtf8(buf);

    default:
      throw new Error(`Invalid encoding: ${encoding}`);
  }
}

function urlEncode(s) {
  return encodeURIComponent(s);
}

class NullLog {
  log() { } // eslint-disable-line class-methods-use-this
  err() { } // eslint-disable-line class-methods-use-this
  warn() { } // eslint-disable-line class-methods-use-this
  info() { } // eslint-disable-line class-methods-use-this
  debug() { } // eslint-disable-line class-methods-use-this
  trace() { } // eslint-disable-line class-methods-use-this
}


const ERR = 0;
const WARN = 1;
const INFO = 2;
const DEBUG = 3;
const TRACE = 4;

class ConsoleLog {
  constructor(level = INFO) {
    this.level = level;
  }

  log(level, ...args) {
    if (this.level >= level) {
      // eslint-disable-next-line no-console
      console.error(...args);
    }
  }

  err(...args) {
    this.log(ERR, '[x]', ...args);
  }
  warn(...args) {
    this.log(WARN, '[!]', ...args);
  }
  info(...args) {
    this.log(INFO, '[*]', ...args);
  }
  debug(...args) {
    this.log(DEBUG, '[~]', ...args);
  }
  trace(...args) {
    this.log(TRACE, '[#]', ...args);
  }
}

module.exports = {
  ConsoleLog,
  NullLog,
  encode,
  getRandomBytes,
  makeBlocks,
  pad,
  toBase64,
  toHex,
  toUtf8,
  unpad,
  urlEncode,
  xor,
};

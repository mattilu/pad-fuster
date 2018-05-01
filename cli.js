#!/usr/bin/env node
/* eslint-disable no-console */

const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const { Cracker } = require('./lib/crack');
const { Decrypter } = require('./lib/decrypt');
const { Encrypter } = require('./lib/encrypt');
const { HttpOracle } = require('./lib/oracle');
const { ConsoleLog, encode } = require('./lib/utils');


const log = new ConsoleLog();

function die(s) {
  log.err('Error:', s);
  process.exit(1);
}

function decode(encoded, encoding) {
  let enc = encoding;
  if (!enc || enc === 'auto') {
    const hex = /^(?:[0-9a-fA-F]{2})+$/;
    const b64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

    if (hex.test(encoded)) {
      enc = 'hex';
    } else if (b64.test(encoded)) {
      enc = 'base64';
    } else {
      die('Cannot auto-detect sample encoding. Use the -E option to set a value');
    }

    log.warn(`Detected encoding: ${enc}. Use the -E option to set a different value`);
  }

  switch (enc) {
    case 'base64':
      return [Buffer.from(encoded, 'base64'), enc];
    case 'hex':
      return [Buffer.from(encoded, 'hex'), enc];
    case 'raw':
      return [Buffer.from(encoded, 'utf-8'), enc];
    default:
      return die(`Invalid encoding: ${enc}`);
  }
}

function detectBlockSize(sampleSize) {
  const minBlockSize = 4;
  const maxBlockSize = 64;

  if (sampleSize % minBlockSize !== 0) {
    die('Encrypted sample is not a multiple of the minimum block size');
  }

  let blockSize = minBlockSize;
  while (blockSize <= maxBlockSize) {
    if (sampleSize % (blockSize * 2) !== 0) {
      break;
    }
    blockSize *= 2;
  }

  return blockSize;
}

async function main(args) {
  const sample = args.sample;
  const [sampleDecoded, encoding] = decode(sample, args.encoding);
  const sampleSize = sampleDecoded.length;

  let blockSize = args.blockSize;
  if (blockSize === 0) {
    blockSize = detectBlockSize(sampleSize);
    log.warn(`Detected block size: ${blockSize}. Use the -s option to set a different value`);
  } else if (sampleSize % blockSize !== 0) {
    die('Encrypted sample is not a multiple of the block size');
  }

  const url = args.url;
  const cookies = args.cookie;
  const data = args.data;
  const oracle = new HttpOracle({
    url, data, cookies, sample, encoding,
  });
  const cracker = new Cracker({ oracle, log });

  if (args.encrypt) {
    const plain = Buffer.from(args.encrypt, 'utf-8');
    let ciphertext = args.ciphertext;
    if (ciphertext) {
      ciphertext = Buffer.from(ciphertext, 'hex');
      if (ciphertext.length !== blockSize) {
        die('Size of ciphertext parameter must match block size');
      }
    }
    let intermediate = args.intermediate;
    if (intermediate) {
      intermediate = Buffer.from(intermediate, 'hex');
      if (ciphertext.length !== blockSize) {
        die('Size of intermediate parameter must match block size');
      }
    }

    const encrypter = new Encrypter({
      cracker, blockSize, ciphertext, intermediate, log,
    });
    const encrypted = await encrypter.encrypt(plain);
    log.info('Resulting Encrypted Text:');
    console.log(encode(encrypted, encoding));
  } else {
    const decrypter = new Decrypter({ cracker, blockSize, log });
    const plain = await decrypter.decrypt(sampleDecoded);
    log.info('Resulting Plain Text:');
    console.log(encode(plain, 'raw'));
  }
}

function parseArgs() {
  const optionsDefinitions = [{
    name: 'url',
    alias: 'u',
    type: String,
    defaultOption: true,
    description: 'The target URL, including the query string if applicable',
  }, {
    name: 'sample',
    alias: 'S',
    type: String,
    description: 'The encrypted value to test. Must be present in the URL, POST data or a Cookie',
  }, {
    name: 'data',
    alias: 'd',
    type: String,
    description: 'The POST data to send',
  }, {
    name: 'cookie',
    alias: 'c',
    type: String,
    typeLabel: '<NAME=VALUE>',
    lazyMultiple: true,
    description: 'The cookie to pass; can be used multiple times',
  }, {
    name: 'block-size',
    alias: 's',
    type: Number,
    defaultValue: 0,
    description: 'The block size used by the algorithm',
  }, {
    name: 'encoding',
    alias: 'E',
    type: String,
    defaultValue: 'auto',
    description: 'The encoding of the sample data [base64, hex, raw, auto]',
  }, {
    name: 'encrypt',
    alias: 'e',
    type: String,
    description: 'Some plaintext to encrypt',
  }, {
    name: 'ciphertext',
    alias: 'C',
    type: String,
    description: 'Initial value for the ciphertext to use for encryption',
  }, {
    name: 'intermediate',
    alias: 'I',
    type: String,
    description: 'Initial intermediate value for the ciphertext to use for encryption',
  }, {
    name: 'verbose',
    alias: 'v',
    type: Boolean,
    lazyMultiple: true,
    description: 'Increase output verbosity (can be used multiple times)',
  }, {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Display this help message',
  }];

  function printUsage(err) {
    const usageOpts = [{
      header: 'pad-fuster',
      content: [
        'A Padding Oracle Attack Tool\n',
        'Usage: pad-fuster -u <URL> -S <SAMPLE> [OPTS...]',
      ],
    }, {
      header: 'Options',
      optionList: optionsDefinitions,
    }];
    if (err) {
      usageOpts.splice(1, 0, {
        header: 'Error',
        content: err,
      });
    }

    const usage = commandLineUsage(usageOpts);
    console.log(usage);
  }

  let args = null;
  let valid = false;
  let error = null;
  try {
    args = commandLineArgs(optionsDefinitions, { camelCase: true });
    if (!args.url) {
      error = 'Missing --url parameter';
    } else if (!args.sample) {
      error = 'Missing --sample parameter';
    } else {
      valid = true;
    }
  } catch (e) {
    error = e.message;
  }

  if (!valid || args.help) {
    printUsage(error);
    process.exit(args && args.help ? 0 : 1);
  }

  if (args.verbose) {
    log.level += args.verbose.length;
  }

  return args;
}

main(parseArgs()).catch((e) => { die(e.message); });

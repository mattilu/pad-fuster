const {
  NullLog, getRandomBytes, makeBlocks, pad, toHex, toUtf8, xor,
} = require('./utils');

class Encrypter {
  constructor(args) {
    this.blockSize = args.blockSize;
    this.cracker = args.cracker;
    this.log = args.log || new NullLog();
    this.ciphertext = args.ciphertext || null;
    this.intermediate = args.intermediate || null;
  }

  async encrypt(data) {
    const log = this.log;
    const blocks = makeBlocks(pad(data, this.blockSize), this.blockSize);
    let result = Buffer.alloc(0);
    let ciphertext = this.ciphertext;
    let intermediate = this.intermediate;
    let iv = null;

    if (ciphertext && intermediate) {
      const plain = blocks[blocks.length - 1];

      log.info(`Processing block ${blocks.length}`);
      log.info('       Note: using pre-computed CipherText and Intermediate values');
      log.info(`  PlainText: ${toHex(plain)} | ${toUtf8(plain)}`);
      log.info(` CipherText: ${toHex(ciphertext)}`);

      iv = xor(plain, intermediate);

      log.info(`Block ${blocks.length} results:`);
      log.info(` Intermediate: ${toHex(intermediate)}`);
      log.info(`           IV: ${toHex(iv)}`);

      result = ciphertext;
      blocks.pop();
    } else if (ciphertext) {
      iv = ciphertext;
    } else {
      iv = getRandomBytes(this.blockSize);
    }

    while (blocks.length > 0) {
      const plain = blocks[blocks.length - 1];
      ciphertext = iv;

      log.info(`Processing block ${blocks.length}`);
      log.info(`  PlainText: ${toHex(plain)} | ${toUtf8(plain)}`);
      log.info(` CipherText: ${toHex(ciphertext)}`);

      // eslint-disable-next-line no-await-in-loop
      [iv, intermediate] = await this.encryptBlock(plain, ciphertext);

      log.info(`Block ${blocks.length} results:`);
      log.info(` Intermediate: ${toHex(intermediate)}`);
      log.info(`           IV: ${toHex(iv)}`);

      result = Buffer.concat([ciphertext, result]);
      blocks.pop();
    }

    return Buffer.concat([iv, result]);
  }

  async encryptBlock(plain, ciphertext) {
    const intermediate = await this.cracker.crack(ciphertext);
    const iv = xor(plain, intermediate);
    return [iv, intermediate];
  }
}

module.exports = {
  Encrypter,
};

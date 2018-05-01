const {
  NullLog, makeBlocks, toHex, toUtf8, unpad, xor,
} = require('./utils');

class Decrypter {
  constructor(args) {
    this.blockSize = args.blockSize;
    this.cracker = args.cracker;
    this.log = args.log || new NullLog();
  }

  async decrypt(data) {
    const log = this.log;
    const blocks = makeBlocks(data, this.blockSize);
    const nBlocks = blocks.length;

    let result = Buffer.alloc(0);
    for (let i = 1; i < nBlocks; ++i) {
      const ciphertext = blocks[i];
      const iv = blocks[i - 1];

      log.info(`Processing block ${i}/${nBlocks - 1}`);
      log.info(` CipherText: ${toHex(ciphertext)}`);
      log.info(`         IV: ${toHex(iv)}`);

      // eslint-disable-next-line no-await-in-loop
      const [plain, intermediate] = await this.decryptBlock(iv, ciphertext);

      log.info(`Block ${i} results:`);
      log.info(` Intermediate: ${toHex(intermediate)}`);
      log.info(`    Decrypted: ${toHex(plain)}`);
      log.info(`    PlainText: ${toUtf8(plain)}`);

      result = Buffer.concat([result, plain]);
    }

    return unpad(result, this.blockSize);
  }

  async decryptBlock(iv, ciphertext) {
    const intermediate = await this.cracker.crack(ciphertext);
    const plain = xor(iv, intermediate);
    return [plain, intermediate];
  }
}

module.exports = {
  Decrypter,
};

import { Buffer } from 'buffer';
function littleEndianUInt32(x) {
  const tmp = ((x >> 24) & 0xff) | ((x << 8) & 0xff0000) | ((x >> 8) & 0xff00) | ((x << 24) & 0xff000000)
  return tmp >>> 0; // Preserve unsigned.
}

function littleEndianUint8Array(x) {
  const tmp = (x[3] << 24) | (x[2] << 16) | (x[1]<<8) | x[0]  
  return tmp >>> 0; ; // Preserve unsigned.
}

// Note, this is currently converting converting to little endian and returning a Uint8 Array.
// TODO: BUG? Is nrf52832_xxaa.dat already LE?
function littleEndian(src) {
  const buffer = new Buffer(src.length);

  for (let i = 0, j = src.length - 1; i <= j; ++i, --j) {
    buffer[i] = src[j];
    buffer[j] = src[i];
  }

  return new Uint8Array(src);
}


exports.littleEndianUInt32 = littleEndianUInt32;
exports.littleEndianUint8Array = littleEndianUint8Array;
exports.littleEndian = littleEndian;

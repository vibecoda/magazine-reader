import { endianness } from "node:os";

export const MAX_INPUT = 32 * 1024 * 1024;
export const MAX_OUTPUT = 900 * 1024;
const little = endianness() === "LE";

export function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (body.length > MAX_OUTPUT) throw new Error("Response is too large for Chrome.");
  const header = Buffer.alloc(4);
  if (little) header.writeUInt32LE(body.length); else header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

export function decodeMessages(buffer) {
  const messages = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const length = little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
    if (!length || length > MAX_INPUT) throw new Error("Invalid native message size.");
    if (buffer.length - offset - 4 < length) break;
    messages.push(JSON.parse(buffer.subarray(offset + 4, offset + 4 + length).toString("utf8")));
    offset += 4 + length;
  }
  return { messages, rest: buffer.subarray(offset) };
}

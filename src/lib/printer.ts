// ESC/POS Protocol constants (byte values)
const ESC = 0x1b;
const GS = 0x29;
const FS = 0x1c;
const LF = 0x0a;

// Alignment codes
const ALIGN_LEFT = 0;
const ALIGN_CENTER = 1;
const ALIGN_RIGHT = 2;

export class ReceiptPrinterEncoder {
  private buffer: Buffer;
  private _bold: boolean;
  private _align: number;
  private _fontSize: number;

  constructor() {
    this.buffer = Buffer.alloc(0);
    this._bold = false;
    this._align = ALIGN_LEFT;
    this._fontSize = 1;
  }

  initialize(): ReceiptPrinterEncoder {
    this.buffer = Buffer.alloc(0);
    this._bold = false;
    this._align = ALIGN_LEFT;
    this._fontSize = 1;
    this.buffer = Buffer.concat([this.buffer, Buffer.from([ESC, 0x40])]);
    return this;
  }

  align(mode: 'left' | 'center' | 'right'): ReceiptPrinterEncoder {
    const modes = { left: ALIGN_LEFT, center: ALIGN_CENTER, right: ALIGN_RIGHT };
    this._align = modes[mode] ?? ALIGN_LEFT;
    this.buffer = Buffer.concat([this.buffer, Buffer.from([ESC, 0x61, modes[mode] ?? ALIGN_LEFT])]);
    return this;
  }

  line(text: string): ReceiptPrinterEncoder {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(text), Buffer.from([LF])]);
    return this;
  }

  bold(enabled: boolean): ReceiptPrinterEncoder {
    this._bold = enabled;
    this.buffer = Buffer.concat([this.buffer, Buffer.from([ESC, 0x45, enabled ? 1 : 0])]);
    return this;
  }

  size(width: number, height: number): ReceiptPrinterEncoder {
    const sizeByte = ((width - 1) << 4) | (height - 1);
    this.buffer = Buffer.concat([this.buffer, Buffer.from([FS, 0x21, sizeByte])]);
    return this;
  }

  newline(): ReceiptPrinterEncoder {
    this.buffer = Buffer.concat([this.buffer, Buffer.from([LF])]);
    return this;
  }

  qrcode(data: string, moduleSize: number, level: number, mode: string): ReceiptPrinterEncoder {
    const dataBytes = Buffer.from(data);
    const cmd = Buffer.alloc(8 + dataBytes.length);
    cmd[0] = FS;
    cmd[1] = 0x28;
    cmd[2] = 0x4b;
    cmd[3] = 0;
    cmd[4] = dataBytes.length + 3;
    cmd[5] = 48;
    cmd[6] = 0;
    cmd[7] = 3;
    dataBytes.copy(cmd, 8);
    this.buffer = Buffer.concat([this.buffer, cmd]);
    return this;
  }

  cut(): ReceiptPrinterEncoder {
    this.buffer = Buffer.concat([this.buffer, Buffer.from([ESC, 0x69])]);
    return this;
  }

  encode(): Buffer {
    return Buffer.concat([this.buffer, Buffer.from([ESC, 0x69])]);
  }
}

export interface WebUSBDevice {
  vendorId: number;
  productId: number;
  open(): Promise<void>;
  selectConfiguration(config: number): Promise<void>;
  claimInterface(iface: number): Promise<void>;
  transferOut(endpoint: number, data: Buffer): Promise<void>;
}

export async function requestUSBDevice(vendorId = 0x04b8): Promise<WebUSBDevice | null> {
  if (typeof navigator === 'undefined' || !(navigator as any).usb) {
    return null;
  }
  try {
    const device = await (navigator as any).usb.requestDevice({ filters: [{ vendorId }] });
    await device.open();
    await device.selectConfiguration(1);
    await device.claimInterface(0);
    return device as unknown as WebUSBDevice;
  } catch (err) {
    console.error('USB device selection failed:', err);
    return null;
  }
}

export async function sendToPrinter(data: Buffer, device?: WebUSBDevice | null): Promise<void> {
  let targetDevice = device;
  if (!targetDevice) {
    targetDevice = await requestUSBDevice();
  }
  if (!targetDevice) {
    throw new Error('No printer device available');
  }
  await targetDevice.transferOut(1, data);
}

export interface PrintTicketOptions {
  visitorName: string;
  balance: number;
  cashierName?: string;
  topUpAmount?: number;
  oldWalletId?: string;
  newWalletId?: string;
  transferredBalance?: number;
}

export async function printQRWalletTicket(
  walletId: string,
  balance: number,
  visitorName: string,
  device?: WebUSBDevice
): Promise<boolean> {
  try {
    const encoder = new ReceiptPrinterEncoder();
    const result = encoder
      .initialize()
      .align('center')
      .line('================================')
      .bold(true)
      .size(2, 2)
      .line('EVENT DIGITAL WALLET')
      .size(1, 1)
      .bold(false)
      .line(`ATTENDEE: ${visitorName.toUpperCase()}`)
      .line('Keep this ticket for all purchases')
      .line('================================')
      .newline()
      .qrcode(walletId, 1, 6, 'm')
      .newline()
      .bold(true)
      .line(`INITIAL BALANCE: $${balance.toFixed(2)}`)
      .bold(false)
      .line(`Issued: ${new Date().toLocaleTimeString()}`)
      .line('================================')
      .cut()
      .encode();

    await sendToPrinter(result, device);
    return true;
  } catch (err) {
    console.error('Thermal print failed:', err);
    return false;
  }
}

export async function printTopUpReceipt(
  walletId: string,
  balance: number,
  topUpAmount: number,
  cashierName: string,
  device?: WebUSBDevice
): Promise<boolean> {
  try {
    const encoder = new ReceiptPrinterEncoder();
    const result = encoder
      .initialize()
      .align('center')
      .line('================================')
      .bold(true)
      .size(2, 2)
      .line('TOP-UP RECEIPT')
      .size(1, 1)
      .bold(false)
      .line('================================')
      .newline()
      .line(`WALLET: ${walletId}`)
      .line(`CASHIER: ${cashierName}`)
      .line(`TOP-UP: $${topUpAmount.toFixed(2)}`)
      .line(`NEW BALANCE: $${balance.toFixed(2)}`)
      .newline()
      .line(`Time: ${new Date().toLocaleTimeString()}`)
      .line('================================')
      .cut()
      .encode();

    await sendToPrinter(result, device);
    return true;
  } catch (err) {
    console.error('Top-up print failed:', err);
    return false;
  }
}

export async function printReplacementReceipt(
  oldWalletId: string,
  newWalletId: string,
  transferredBalance: number,
  visitorName: string,
  device?: WebUSBDevice
): Promise<boolean> {
  try {
    const encoder = new ReceiptPrinterEncoder();
    const result = encoder
      .initialize()
      .align('center')
      .line('================================')
      .bold(true)
      .size(2, 2)
      .line('TICKET REPLACEMENT')
      .size(1, 1)
      .bold(false)
      .line('================================')
      .newline()
      .line(`ATTENDEE: ${visitorName.toUpperCase()}`)
      .newline()
      .line(`OLD TICKET: ${oldWalletId}`)
      .line(`NEW TICKET: ${newWalletId}`)
      .newline()
      .bold(true)
      .line(`TRANSFERRED: $${transferredBalance.toFixed(2)}`)
      .bold(false)
      .line('================================')
      .newline()
      .line(`Date: ${new Date().toLocaleString()}`)
      .line('================================')
      .cut()
      .encode();

    await sendToPrinter(result, device);
    return true;
  } catch (err) {
    console.error('Replacement print failed:', err);
    return false;
  }
}

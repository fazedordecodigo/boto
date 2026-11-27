/** Google Chrome by default; `CHROME_PATH` selects another build (Linux ARM64 has no Chrome channel). */
export const chrome = process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH }
  : { channel: "chrome" };

const config = {
  env: import.meta.env.MODE,
  appName: import.meta.env.VITE_APP_NAME,
  apiBaseUrl: `${import.meta.env.VITE_APP_BASE_URL}${import.meta.env.VITE_APP_API_VERSION}`,
  // What the booth RFID reader types for a card UID (digits only, then
  // Enter). Anything else the keyboard-wedge scanners type is a barcode.
  rfidUidPattern: new RegExp(import.meta.env.VITE_RFID_UID_PATTERN || '^\\d{8,10}$'),
};

export default config;

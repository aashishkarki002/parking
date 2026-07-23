const config = {
  env: import.meta.env.MODE,
  appName: import.meta.env.VITE_APP_NAME,
  apiBaseUrl: `${import.meta.env.VITE_APP_BASE_URL}${import.meta.env.VITE_APP_API_VERSION}`,
};

export default config;

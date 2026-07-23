// _redux/store.ts
import { configureStore } from '@reduxjs/toolkit';
import { FLUSH, PAUSE, PERSIST, PURGE, REGISTER, REHYDRATE, persistStore } from 'redux-persist';
import persistReducer from 'redux-persist/es/persistReducer';
import storage from 'redux-persist/lib/storage';
import { baseApiSlice } from './baseApiSlice';
import config from './config';
import { APP_ENVIRONMENT_PRODUCTION } from './pEnvConstants';
import { rootReducer } from './reducer';

export const whitelistedKeys = ['publicLogin'];
const persistConfig = {
  key: 'root',
  storage,
  whitelist: whitelistedKeys,
};

// Purge persisted state when user logs out so next load doesn't rehydrate stale login
// (avoids needing to "clear browser" when session expires or after logout)
const purgeOnLogoutMiddleware =
  () => (next: (action: any) => any) => (action: any) => {
    const result = next(action);
    if (action?.type === 'publicLogin/logoutRequest') {
      persistor.purge().then(() => {
        // Persisted state cleared; next full load will show login
      });
    }
    return result;
  };

const combinedMiddleware = (getDefaultMiddleware: any) =>
  getDefaultMiddleware({
    serializableCheck: {
      ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
    },
  })
    .concat(purgeOnLogoutMiddleware)
    .concat(baseApiSlice.middleware);

const persistedReducers = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducers,
  devTools: config.env !== APP_ENVIRONMENT_PRODUCTION,
  middleware: combinedMiddleware,
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export function purgePersistedReducer() {
  persistor.purge().then(() => {
    // eslint-disable-next-line no-console
    console.log('Purged persisted state');
  });
}


import * as SecureStore from 'expo-secure-store';

// Los tokens viven SOLO en el almacén seguro del sistema (Keychain / Keystore).
// Nunca en AsyncStorage.
const ACCESS_KEY = 'senavoz.access_token';
const REFRESH_KEY = 'senavoz.refresh_token';

export type Tokens = { accessToken: string; refreshToken: string };

export const tokenStorage = {
  getAccessToken: () => SecureStore.getItemAsync(ACCESS_KEY),
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),

  async save({ accessToken, refreshToken }: Tokens): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  },

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

import { Platform } from 'react-native';

// En el emulador de Android, "localhost" es el propio emulador; el host es 10.0.2.2.
const defaultUrl = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';

export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? defaultUrl;

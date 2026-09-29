import { Redirect } from 'expo-router';

import { useSession } from '@/store/session';

export default function Index() {
  const status = useSession((s) => s.status);
  return <Redirect href={status === 'authenticated' ? '/home' : '/login'} />;
}

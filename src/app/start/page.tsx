import type { Metadata } from 'next';
import { StartFlow } from './StartFlow';

export const metadata: Metadata = { title: 'Get started' };

export default function StartPage() {
  return <StartFlow />;
}

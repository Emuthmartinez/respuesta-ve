import type { Metadata } from 'next';
import { AccountAccessForm } from '@/components/AccountAccessForm';

export const metadata: Metadata = {
  title: 'Cuenta de desarrollador · Respuesta VE',
  alternates: { canonical: '/desarrolladores/acceder' },
};

export default function DeveloperAccessPage() {
  return <AccountAccessForm variant="developer" nextPath="/desarrolladores/claves" backHref="/desarrolladores" />;
}

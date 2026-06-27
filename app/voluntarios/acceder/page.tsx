import { AccountAccessForm } from '@/components/AccountAccessForm';

export default function AccederPage() {
  return <AccountAccessForm variant="volunteer" nextPath="/voluntarios" backHref="/" />;
}

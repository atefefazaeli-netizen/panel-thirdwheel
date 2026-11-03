import { ShieldOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NoAccess({ email, onBack }: { email: string | null; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center" role="alert">
      <div className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-destructive">
        <ShieldOffIcon className="size-6" aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">This account has no panel access</h2>
        <p className="text-sm text-muted-foreground">
          {email ? <span className="font-medium text-foreground">{email}</span> : 'This account'} is not on the staff
          list. Ask an admin to add it to ADMIN_EMAILS or CLINICIAN_EMAILS on the API, then sign in again.
        </p>
      </div>
      <Button variant="outline" onClick={onBack}>
        Use another email
      </Button>
    </div>
  );
}

import { EyeIcon, EyeOffIcon, KeyRoundIcon } from 'lucide-react';
import * as React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CopyButton } from './copy-button';

export interface SecretRevealProps {
  label: string;
  secret: string;
  /** Called when the person confirms they saved it; the secret is then gone from the screen. */
  onDone?: () => void;
  doneLabel?: string;
}

/** Shows a secret exactly once (webhook signing secret, API key) with copy and a clear warning. */
export function SecretReveal({ label, secret, onDone, doneLabel = 'I saved it' }: SecretRevealProps) {
  const [visible, setVisible] = React.useState(true);
  const id = React.useId();
  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <KeyRoundIcon />
        <AlertTitle>Copy it now</AlertTitle>
        <AlertDescription>
          This is the only time the panel shows it. The server keeps only a hash, so it cannot be shown again.
        </AlertDescription>
      </Alert>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          readOnly
          value={visible ? secret : '•'.repeat(Math.min(secret.length, 40))}
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide' : 'Show'}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
        <CopyButton value={secret} iconOnly label={`Copy ${label}`} />
      </div>
      {onDone && (
        <Button type="button" onClick={onDone} className="self-end">
          {doneLabel}
        </Button>
      )}
    </div>
  );
}

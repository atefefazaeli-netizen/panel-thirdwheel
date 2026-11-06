import { DownloadIcon, ShieldCheckIcon } from 'lucide-react';
import * as React from 'react';
import { CopyButton } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/**
 * The 10 recovery codes, shown exactly once (the server keeps only hashes). Copy, download, and an
 * explicit "I saved them" before the person can go on.
 */
export function RecoveryCodes({
  codes,
  username,
  onDone,
  doneLabel = 'Continue',
}: {
  codes: string[];
  username: string;
  onDone: () => void;
  doneLabel?: string;
}) {
  const [saved, setSaved] = React.useState(false);
  const id = React.useId();
  const text = codes.join('\n');
  const download = () => {
    const blob = new Blob([`Thirdwheel panel recovery codes for ${username}\nEach code works once.\n\n${text}\n`], {
      type: 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thirdwheel-recovery-codes-${username}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <ShieldCheckIcon />
        <AlertTitle>Save your recovery codes</AlertTitle>
        <AlertDescription>
          If you lose your phone, each code signs you in once instead of an authenticator code. This is the only time
          the panel shows them.
        </AlertDescription>
      </Alert>
      <ol
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3 font-mono text-sm"
      >
        {codes.map((c) => (
          <li key={c} className="tabular-nums">
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={text} label="Copy all codes" />
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <DownloadIcon />
          Download as text
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
        <Label htmlFor={id}>I saved them somewhere safe</Label>
      </div>
      <Button type="button" onClick={onDone} disabled={!saved}>
        {doneLabel}
      </Button>
    </div>
  );
}

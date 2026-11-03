import { CheckCircle2Icon, CircleAlertIcon, WandSparklesIcon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseJson } from '@/lib/json';
import { cn } from '@/lib/utils';

export interface JsonEditorProps {
  id?: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  /** Extra validation of the parsed value (Zod issues as text). Return [] when valid. */
  validate?: (value: unknown) => string[];
  /** Called with the parsed value whenever the text is valid. */
  onValidChange?: (value: unknown) => void;
  readOnly?: boolean;
  rows?: number;
  description?: React.ReactNode;
  className?: string;
}

/** A plain textarea JSON editor with validation, error position and Format. */
export function JsonEditor({
  id,
  label,
  value,
  onChange,
  validate,
  onValidChange,
  readOnly,
  rows = 16,
  description,
  className,
}: JsonEditorProps) {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  const parsed = React.useMemo(() => parseJson(value), [value]);
  const issues = React.useMemo(() => (parsed.ok && validate ? validate(parsed.value) : []), [parsed, validate]);
  const valid = parsed.ok && issues.length === 0;

  const onValidRef = React.useRef(onValidChange);
  React.useEffect(() => {
    onValidRef.current = onValidChange;
  }, [onValidChange]);
  React.useEffect(() => {
    if (valid) onValidRef.current?.(parsed.value);
  }, [valid, parsed]);

  const format = () => {
    if (parsed.ok) onChange(JSON.stringify(parsed.value, null, 2));
  };

  const statusId = `${fieldId}-status`;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={fieldId}>{label}</Label>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={format} disabled={!parsed.ok}>
            <WandSparklesIcon />
            Format
          </Button>
        )}
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <Textarea
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        rows={rows}
        spellCheck={false}
        aria-invalid={!valid || undefined}
        aria-describedby={statusId}
        className="field-sizing-fixed min-h-40 font-mono text-xs leading-relaxed"
        onKeyDown={(e) => {
          if (e.key === 'Tab' && !e.shiftKey && !readOnly) {
            e.preventDefault();
            const t = e.currentTarget;
            const { selectionStart: s, selectionEnd: end } = t;
            const next = `${value.slice(0, s)}  ${value.slice(end)}`;
            onChange(next);
            requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
          }
        }}
      />
      <div id={statusId} aria-live="polite" className="text-sm">
        {valid ? (
          <p className="flex items-center gap-1.5 text-success">
            <CheckCircle2Icon className="size-4" aria-hidden />
            Valid JSON
          </p>
        ) : !parsed.ok ? (
          <p className="flex items-start gap-1.5 text-destructive">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {parsed.line ? `Line ${parsed.line}, column ${parsed.column}: ` : ''}
            {parsed.error}
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-destructive">
            {issues.slice(0, 8).map((m) => (
              <li key={m} className="flex items-start gap-1.5">
                <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {m}
              </li>
            ))}
            {issues.length > 8 && <li>{issues.length - 8} more</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

import { GitCompareIcon, RotateCcwIcon } from 'lucide-react';
import * as React from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { wordDiff } from '../lib/word-diff';
import { PROMPT_MAX, type AiSettingsForm } from '../schemas/ai';

/**
 * One editable prompt part. `null` means the built-in default, which the box shows; typing makes
 * it custom, "Default" puts it back, and the diff shows what changed against the default.
 */
export function PromptField({
  name,
  label,
  defaultText,
  readOnly,
}: {
  name: `prompts.modes.${string}` | 'prompts.quizStyle';
  label: string;
  defaultText: string;
  readOnly?: boolean;
}) {
  const { control, setValue, getFieldState, formState } = useFormContext<AiSettingsForm>();
  const [showDiff, setShowDiff] = React.useState(false);
  const id = React.useId();
  const value = (useWatch({ control, name }) as string | null | undefined) ?? null;
  const error = getFieldState(name, formState).error;
  const reset = () => setValue(name, null, { shouldDirty: true, shouldValidate: true });
  const custom = value !== null && value.trim() !== '' && value.trim() !== defaultText;
  const shown = value ?? defaultText;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={id} className="font-semibold">
            {label}
          </Label>
          <Badge variant={custom ? 'default' : 'secondary'}>{custom ? 'Custom' : 'Default'}</Badge>
        </div>
        <div className="flex gap-1">
          {custom && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowDiff((v) => !v)}
              aria-pressed={showDiff}
            >
              <GitCompareIcon />
              {showDiff ? 'Hide diff' : 'Diff'}
            </Button>
          )}
          {custom && !readOnly && (
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              <RotateCcwIcon />
              Default
            </Button>
          )}
        </div>
      </div>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Textarea
            {...field}
            id={id}
            value={shown}
            onChange={(e) => field.onChange(e.target.value.trim() === defaultText ? null : e.target.value)}
            readOnly={readOnly}
            rows={3}
            maxLength={PROMPT_MAX}
            aria-invalid={!!error}
            className={cn('text-sm', !custom && 'text-muted-foreground')}
          />
        )}
      />
      <div className="flex justify-between text-xs">
        <span className="text-destructive">{error?.message}</span>
        <span className="text-muted-foreground tabular-nums">
          {shown.length}/{PROMPT_MAX}
        </span>
      </div>
      {custom && showDiff && (
        <p className="rounded-md bg-muted/50 p-2 text-sm leading-relaxed" aria-label="Changes against the default">
          {wordDiff(defaultText, value ?? '').map((part, i) =>
            part.kind === 'same' ? (
              <span key={i}>{part.text}</span>
            ) : part.kind === 'removed' ? (
              <del key={i} className="rounded-sm bg-brand-soft text-destructive decoration-destructive/60">
                {part.text}
              </del>
            ) : (
              <ins key={i} className="rounded-sm bg-success-soft text-success no-underline">
                {part.text}
              </ins>
            ),
          )}
        </p>
      )}
    </div>
  );
}

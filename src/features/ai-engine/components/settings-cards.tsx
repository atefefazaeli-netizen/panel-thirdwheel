import { CheckIcon, KeyRoundIcon } from 'lucide-react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { FormFieldNumber, FormFieldSelect, FormFieldSwitch, FormFieldText } from '@/components/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { EFFORTS, PROVIDERS, type AiProviderName, type AiSettingsView } from '../api/types';
import type { AiSettingsForm } from '../schemas/ai';

const PROVIDER_COPY: Record<AiProviderName, { title: string; line: string }> = {
  anthropic: { title: 'Anthropic', line: 'Effort controls depth; no temperature.' },
  openai: { title: 'OpenAI', line: 'Temperature is optional.' },
  none: { title: 'None', line: 'AI off: the app uses its built-in copy.' },
};

export function ProviderCard({ view, readOnly }: { view: AiSettingsView; readOnly: boolean }) {
  const { control } = useFormContext<AiSettingsForm>();
  const { field, fieldState } = useController({ control, name: 'provider' });
  const hasKey = (p: AiProviderName) => p === 'none' || view.keys[p];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider</CardTitle>
        <CardDescription>
          Which model answers Third Ear and writes quiz results. API keys stay on the server and are never shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Provider" className="grid gap-2 sm:grid-cols-3">
          {PROVIDERS.map((p) => {
            const selected = field.value === p;
            const disabled = readOnly || !hasKey(p);
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => field.onChange(p)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted/60',
                  !hasKey(p) && 'opacity-60',
                )}
              >
                <span className="flex w-full items-center justify-between font-semibold">
                  {PROVIDER_COPY[p].title}
                  {selected && <CheckIcon className="size-4" aria-hidden />}
                </span>
                <span className={cn('text-xs', selected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                  {PROVIDER_COPY[p].line}
                </span>
                {!hasKey(p) && (
                  <span className="flex items-center gap-1 text-xs font-medium">
                    <KeyRoundIcon className="size-3" aria-hidden />
                    Set {p.toUpperCase()}_API_KEY on the API to use this
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {fieldState.error && <FormMessage className="text-destructive">{fieldState.error.message}</FormMessage>}
        <FormFieldSwitch
          control={control}
          name="fallbackOnly"
          label="Fallback only"
          description="Skip the model everywhere and answer with the built-in copy. Safety checks still run."
          disabled={readOnly}
        />
      </CardContent>
    </Card>
  );
}

export function ModelCards({ view, readOnly }: { view: AiSettingsView; readOnly: boolean }) {
  const { control } = useFormContext<AiSettingsForm>();
  const provider = useWatch({ control, name: 'provider' });
  const temp = view.defaults.supports?.temperature ?? { anthropic: false, openai: true };
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className={cn(provider !== 'anthropic' && 'opacity-80')}>
        <CardHeader>
          <CardTitle>Anthropic</CardTitle>
          <CardDescription>
            {provider === 'anthropic' ? 'In use.' : 'Kept for when you switch back.'} Default model comes from
            ANTHROPIC_MODEL.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid items-start gap-4 sm:grid-cols-2">
          <FormFieldText
            control={control}
            name="anthropic.model"
            label="Model"
            description={`Default: ${view.defaults.anthropic.model}`}
            disabled={readOnly}
          />
          <FormFieldSelect
            control={control}
            name="anthropic.effort"
            label="Effort"
            options={EFFORTS.map((e) => ({ value: e, label: e }))}
            disabled={readOnly}
          />
          <FormFieldSwitch
            control={control}
            name="anthropic.refusalFallback"
            label="Refusal fallback"
            description="If the model refuses, answer with the built-in copy."
            disabled={readOnly}
            className="sm:col-span-2"
          />
          {!temp.anthropic && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              This client takes no temperature; effort is its control.
            </p>
          )}
        </CardContent>
      </Card>
      <Card className={cn(provider !== 'openai' && 'opacity-80')}>
        <CardHeader>
          <CardTitle>OpenAI</CardTitle>
          <CardDescription>
            {provider === 'openai' ? 'In use.' : 'Kept for when you switch.'} Default model comes from OPENAI_MODEL.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid items-start gap-4 sm:grid-cols-2">
          <FormFieldText
            control={control}
            name="openai.model"
            label="Model"
            description={`Default: ${view.defaults.openai.model}`}
            disabled={readOnly}
          />
          <FormFieldNumber
            control={control}
            name="openai.temperature"
            label="Temperature"
            min={0}
            max={2}
            step={0.1}
            description="0 to 2. Empty = provider default."
            disabled={readOnly || !temp.openai}
          />
        </CardContent>
      </Card>
    </div>
  );
}

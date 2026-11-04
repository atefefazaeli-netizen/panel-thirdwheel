import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { JsonEditor } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { emptyQuestion, parseStructuredDeck, structuredDeckText, structuredIssues, type DeckQuestion, type StructuredDeck } from '../lib/deck';
import { deckIssues, type EditorValues } from '../schemas/editor';

export function DeckTab({ readOnly, required }: { readOnly: boolean; required: boolean }) {
  const { control } = useFormContext<EditorValues>();
  const deckText = useWatch({ control, name: 'body.deckText' });
  const structured = React.useMemo(() => parseStructuredDeck(deckText), [deckText]);
  const [view, setView] = React.useState<'questions' | 'json'>(structured ? 'questions' : 'json');

  const json = (
    <Controller
      control={control}
      name="body.deckText"
      render={({ field }) => (
        <JsonEditor
          label="Deck (advanced)"
          description={
            required
              ? 'Type items play this deck: an object with a "type" (V-YNM, L-PP…) and its rounds or questions. Edit with care; the app reads it as is.'
              : 'Optional for this kind. Leave empty for no deck.'
          }
          value={field.value}
          onChange={field.onChange}
          readOnly={readOnly}
          allowEmpty={!required}
          rows={22}
          validate={(v) => {
            const issue = deckIssues(JSON.stringify(v), required);
            return issue ? [issue] : [];
          }}
        />
      )}
    />
  );
  if (!structured) return json;
  return (
    <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
      <TabsList aria-label="Deck editor">
        <TabsTrigger value="questions">Questions</TabsTrigger>
        <TabsTrigger value="json">JSON</TabsTrigger>
      </TabsList>
      <TabsContent value="questions" className="mt-2">
        <QuestionsEditor deck={structured} readOnly={readOnly} />
      </TabsContent>
      <TabsContent value="json" className="mt-2">
        {json}
      </TabsContent>
    </Tabs>
  );
}

/**
 * Question text, intro line, follow-up chip and options for decks that play a list of questions
 * (lib/deck.ts lists the types). Scales, rank items and other keys are kept as they are; edit them in
 * JSON.
 */
function QuestionsEditor({ deck, readOnly }: { deck: StructuredDeck; readOnly: boolean }) {
  const { setValue } = useFormContext<EditorValues>();
  const write = (entries: DeckQuestion[]) =>
    setValue('body.deckText', structuredDeckText({ ...deck, entries }), { shouldDirty: true, shouldValidate: true });
  const patch = (i: number, p: Partial<DeckQuestion>) => write(deck.entries.map((e, k) => (k === i ? { ...e, ...p } : e)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...deck.entries];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    write(next);
  };
  const issue = structuredIssues(deck);
  const label = deck.listKey === 'statements' ? 'Statement' : 'Question';

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {deck.type} deck, {deck.entries.length} {deck.listKey}. Card text from the workbook is clinician-cleared:
        change it only with a clinician. Scales, rank items and other settings stay as they are (JSON tab).
      </p>
      {issue && (
        <p role="alert" className="text-sm text-destructive">
          {issue}
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {deck.entries.map((e, i) => {
          const keep = Object.keys(e.orig).filter((k) => !['q', 'intro', 'followUp', 'pick'].includes(k));
          return (
            <li key={i} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {label} {i + 1}
                </span>
                {!readOnly && (
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${label.toLowerCase()} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${label.toLowerCase()} ${i + 1} down`}
                      disabled={i === deck.entries.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDownIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
                      onClick={() => write(deck.entries.filter((_, k) => k !== i))}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                )}
              </div>
              <Label htmlFor={`deck-q-${i}`}>{label} text</Label>
              <Textarea
                id={`deck-q-${i}`}
                value={e.q}
                readOnly={readOnly}
                rows={2}
                maxLength={1000}
                aria-invalid={!e.q.trim()}
                onChange={(ev) => patch(i, { q: ev.target.value })}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`deck-intro-${i}`}>Intro line</Label>
                  <Input id={`deck-intro-${i}`} value={e.intro} readOnly={readOnly} maxLength={1000} onChange={(ev) => patch(i, { intro: ev.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`deck-follow-${i}`}>Follow-up chip</Label>
                  <Input id={`deck-follow-${i}`} value={e.followUp} readOnly={readOnly} maxLength={1000} onChange={(ev) => patch(i, { followUp: ev.target.value })} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`deck-pick-${i}`}>Options (one per line; empty = typed answer or its scale)</Label>
                {/* Committed on blur, so typing a new line is not trimmed away mid-edit. */}
                <Textarea
                  key={`${i}|${e.pick.join('|')}`}
                  id={`deck-pick-${i}`}
                  defaultValue={e.pick.join('\n')}
                  readOnly={readOnly}
                  rows={Math.max(2, e.pick.length)}
                  onBlur={(ev) => {
                    const pick = ev.target.value
                      .split('\n')
                      .map((x) => x.trim())
                      .filter(Boolean);
                    if (pick.join('|') !== e.pick.join('|')) patch(i, { pick });
                  }}
                />
              </div>
              {keep.length > 0 && <p className="text-xs text-muted-foreground">Kept as is: {keep.join(', ')}</p>}
            </li>
          );
        })}
      </ol>
      {!readOnly && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => write([...deck.entries, emptyQuestion()])}>
          <PlusIcon />
          Add {label.toLowerCase()}
        </Button>
      )}
    </div>
  );
}

import { AlertTriangleIcon, ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  BOARD_FIELDS,
  BOARD_LABEL,
  boardIssues,
  BOARDS_WITH_BODY_CARDS,
  emptyItem,
  getAt,
  goLiveShortfall,
  sessionShortfalls,
  setAt,
  shortfallText,
  type BoardDeck,
  type BoardProblem,
  type FieldSpec,
  type ObjectsSpec,
  type StringsSpec,
} from '../lib/boards';

type Path = (string | number)[];
type Json = Record<string, unknown>;

interface Ctx {
  deck: Json;
  readOnly: boolean;
  problems: Map<string, string>;
  set: (path: Path, value: unknown) => void;
}

const idFor = (path: Path) => `board-${path.join('-')}`;

/**
 * Typed editor for a Round 4 board deck (app v2.3.0). Every change is written back into the deck
 * object as loaded, so fields the panel doesn't know keep their value and position. Problems that
 * block saving show under their field; decks shorter than their session show as warnings.
 */
export function BoardDeckEditor({
  board,
  cards,
  readOnly,
  onChange,
  onOpenCards,
}: {
  board: BoardDeck;
  /** The item's card texts (Fill the blank and You or Me play them). */
  cards: string[];
  readOnly: boolean;
  onChange: (deck: Json) => void;
  onOpenCards?: () => void;
}) {
  const problems = React.useMemo(() => {
    const list: BoardProblem[] = boardIssues(board, cards);
    const m = new Map<string, string>();
    for (const p of list) if (!m.has(p.path)) m.set(p.path, p.message);
    return { list, byPath: m };
  }, [board, cards]);
  const shortfalls = sessionShortfalls(board, cards.length);
  const goLive = goLiveShortfall({ deck: board.deck, cards: cards.map((text) => ({ text })) });
  const ctx: Ctx = {
    deck: board.deck,
    readOnly,
    problems: problems.byPath,
    set: (path, value) => onChange(setAt(board.deck, path, value)),
  };
  const usesCards = BOARDS_WITH_BODY_CARDS.includes(board.type);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {BOARD_LABEL[board.type]} board ({board.type}).{' '}
        {usesCards ? 'The questions are the Cards tab; this sets how the board plays them. ' : ''}
        Text from the Figma board is not clinician-cleared yet: a clinician approves it in the review queue.
      </p>
      {goLive && (
        <Alert variant="warning">
          <AlertTriangleIcon />
          <AlertTitle>Too short to go live</AlertTitle>
          <AlertDescription>
            <p>{goLive.text}</p>
            <p>You can save it; approving it waits for the cards.</p>
          </AlertDescription>
        </Alert>
      )}
      {shortfalls.map((s) => (
        <Alert key={`${s.field}-${s.deckName ?? ''}`} variant="warning">
          <AlertTriangleIcon />
          <AlertTitle>Deck shorter than the session</AlertTitle>
          <AlertDescription>
            <p>{shortfallText(s)}</p>
            {!readOnly &&
              (s.field === 'cards' ? (
                onOpenCards && (
                  <Button type="button" variant="outline" size="sm" className="mt-1 w-fit" onClick={onOpenCards}>
                    <PlusIcon />
                    Add questions in the Cards tab
                  </Button>
                )
              ) : s.field !== 'decks' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1 w-fit"
                  onClick={() => {
                    const spec = BOARD_FIELDS[board.type].find((f) => f.key === s.field) as StringsSpec | ObjectsSpec;
                    const list = Array.isArray(board.deck[s.field]) ? (board.deck[s.field] as unknown[]) : [];
                    ctx.set([s.field], [...list, emptyItem(spec)]);
                  }}
                >
                  <PlusIcon />
                  Add one
                </Button>
              ) : null)}
          </AlertDescription>
        </Alert>
      ))}
      {problems.list.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Fix before saving</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4" aria-label="Board problems">
              {problems.list.slice(0, 8).map((p) => (
                <li key={`${p.path}-${p.message}`}>{p.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-4">
        {BOARD_FIELDS[board.type].map((f) => (
          <Field key={f.key} spec={f} path={[f.key]} ctx={ctx} />
        ))}
      </div>
    </div>
  );
}

function Help({ spec, error, id }: { spec: FieldSpec; error?: string; id: string }) {
  return (
    <>
      {(spec.hint || spec.tokens) && (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {spec.hint}
          {spec.tokens && (
            <>
              {spec.hint ? ' ' : ''}Placeholders: <span className="font-mono">{spec.tokens.join(' ')}</span>
            </>
          )}
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function Field({ spec, path, ctx }: { spec: FieldSpec; path: Path; ctx: Ctx }) {
  const value = getAt(ctx.deck, path);
  const id = idFor(path);
  const error = ctx.problems.get(path.join('.'));
  switch (spec.kind) {
    case 'text': {
      const Comp = spec.multiline ? Textarea : Input;
      return (
        <div className="flex flex-col gap-1">
          <Label htmlFor={id}>
            {spec.label}
            {!spec.required && <span className="font-normal text-muted-foreground"> (optional)</span>}
          </Label>
          <Comp
            id={id}
            value={typeof value === 'string' ? value : ''}
            readOnly={ctx.readOnly}
            maxLength={spec.max}
            aria-invalid={!!error}
            aria-describedby={spec.hint || spec.tokens ? `${id}-help` : undefined}
            onChange={(e) => {
              const v = e.target.value;
              // Optional text left empty is removed, like it never was there.
              ctx.set(path, !v && !spec.required ? undefined : v);
            }}
          />
          <Help spec={spec} error={error} id={id} />
        </div>
      );
    }
    case 'int': {
      const isNull = value === null;
      return (
        <div className="flex flex-col gap-1">
          <Label htmlFor={id}>
            {spec.label}
            <span className="font-normal text-muted-foreground">
              {' '}
              ({spec.min} to {spec.max}
              {spec.optional ? ', optional' : ''})
            </span>
          </Label>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              className="w-28"
              min={spec.min}
              max={spec.max}
              step={1}
              disabled={isNull}
              readOnly={ctx.readOnly}
              aria-invalid={!!error}
              value={typeof value === 'number' ? String(value) : ''}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') ctx.set(path, spec.optional ? undefined : '');
                else ctx.set(path, Number(raw));
              }}
            />
            {spec.nullable && (
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={isNull}
                  disabled={ctx.readOnly}
                  onCheckedChange={(on) => ctx.set(path, on ? null : spec.min)}
                  aria-label={spec.nullable}
                />
                {spec.nullable}
              </label>
            )}
          </div>
          <Help spec={spec} error={error} id={id} />
        </div>
      );
    }
    case 'bool': {
      if (spec.onlyIfPresent && value === undefined) return null;
      return (
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={value === true}
            disabled={ctx.readOnly}
            onCheckedChange={(on) => ctx.set(path, on)}
            aria-label={spec.label}
          />
          {spec.label}
        </label>
      );
    }
    case 'enum':
      return (
        <div className="flex flex-col gap-1">
          <Label htmlFor={id}>{spec.label}</Label>
          <NativeSelect
            id={id}
            className="w-48"
            disabled={ctx.readOnly}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => ctx.set(path, e.target.value)}
          >
            {spec.options.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Help spec={spec} error={error} id={id} />
        </div>
      );
    case 'group':
      return (
        <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">{spec.label}</legend>
          {spec.fields.map((f) => (
            <Field key={f.key} spec={f} path={[...path, f.key]} ctx={ctx} />
          ))}
          <Help spec={spec} error={error} id={id} />
        </fieldset>
      );
    case 'strings':
    case 'objects':
      return <ListField spec={spec} path={path} ctx={ctx} />;
  }
}

function ListField({ spec, path, ctx }: { spec: StringsSpec | ObjectsSpec; path: Path; ctx: Ctx }) {
  const raw = getAt(ctx.deck, path);
  const list = Array.isArray(raw) ? raw : [];
  const id = idFor(path);
  const error = ctx.problems.get(path.join('.'));
  const full = list.length >= (spec.exact ?? spec.max);
  const move = (i: number, d: -1 | 1) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    ctx.set(path, next);
  };
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border p-3" aria-labelledby={`${id}-legend`}>
      <legend id={`${id}-legend`} className="px-1 text-sm font-medium">
        {spec.label} <span className="font-normal text-muted-foreground">({list.length})</span>
      </legend>
      <Help spec={spec} error={error} id={id} />
      <ol className="flex flex-col gap-2">
        {list.map((item, i) => {
          const name = `${spec.itemLabel} ${i + 1}`;
          return (
            <li key={i} className="flex gap-2 rounded-md bg-muted/40 p-2">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {spec.kind === 'strings' ? (
                  <>
                    <Input
                      aria-label={name}
                      value={typeof item === 'string' ? item : ''}
                      readOnly={ctx.readOnly}
                      maxLength={spec.itemMax}
                      aria-invalid={!!ctx.problems.get([...path, i].join('.'))}
                      onChange={(e) => ctx.set([...path, i], e.target.value)}
                    />
                    {ctx.problems.get([...path, i].join('.')) && (
                      <p className="text-xs text-destructive">{ctx.problems.get([...path, i].join('.'))}</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium text-muted-foreground">{name}</p>
                    {spec.fields.map((f) => (
                      <Field key={f.key} spec={f} path={[...path, i, f.key]} ctx={ctx} />
                    ))}
                  </>
                )}
              </div>
              {!ctx.readOnly && (
                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${name} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${name} down`}
                    disabled={i === list.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${name}`}
                    onClick={() =>
                      ctx.set(
                        path,
                        list.filter((_, k) => k !== i),
                      )
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!ctx.readOnly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={full}
          onClick={() => ctx.set(path, [...list, emptyItem(spec)])}
        >
          <PlusIcon />
          Add {spec.itemLabel.toLowerCase()}
        </Button>
      )}
    </fieldset>
  );
}

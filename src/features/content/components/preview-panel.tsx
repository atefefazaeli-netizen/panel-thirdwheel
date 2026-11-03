import { ClockIcon, MapPinIcon, TimerIcon } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { categoryLabel, playsField, WHERE_LABEL } from '../lib/labels';
import { firstDeckEntry } from '../lib/preview';
import type { CardForm, EditorValues, StepForm } from '../schemas/editor';

function CardPreview({ card }: { card: CardForm }) {
  return (
    <div className="flex flex-col gap-3">
      {card.intro && <p className="text-[11px] text-[#626B7F]">{card.intro}</p>}
      <p className="text-[17px] leading-snug font-bold">{card.text || 'Card text'}</p>
      {card.pick.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {card.pick.map((o) => (
            <span key={o} className="rounded-xl bg-[#EAEFF6] px-3 py-2 text-[12px] font-semibold">
              {o}
            </span>
          ))}
        </div>
      )}
      {card.scale && (
        <div className="flex justify-between text-[11px] text-[#626B7F]">
          <span>{card.scale.low || card.scale.min}</span>
          <span>{card.scale.high || card.scale.max}</span>
        </div>
      )}
      {card.secondary && (
        <p className="text-[11px] text-[#626B7F]">
          {card.secondary === 'Sensitive' ? 'Pass · Not now' : 'Not applicable · Prefer not to answer'}
        </p>
      )}
    </div>
  );
}

function StepPreview({ step, index, total }: { step: StepForm; index: number; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-[#626B7F]">
        Step {index + 1} of {total}
      </p>
      <p className="text-[17px] leading-snug font-bold">{step.title || 'Step title'}</p>
      <p className="text-[13px] leading-relaxed text-[#4E5A73]">{step.body || 'Instruction'}</p>
      {step.minutes && (
        <span className="flex items-center gap-1.5 self-start rounded-full bg-[#EC0137] px-3 py-1 text-[12px] font-semibold text-white">
          <TimerIcon className="size-3.5" />
          {step.minutes}:00
        </span>
      )}
    </div>
  );
}

/** A rough phone render of the item: the Explore card and the first card or step, live as you type. */
export function PreviewPanel({ kind }: { kind: string }) {
  const { control } = useFormContext<EditorValues>();
  const catalog = useWatch({ control, name: 'catalog' });
  const body = useWatch({ control, name: 'body' });
  const plays = playsField(kind);
  const deck = plays === 'deck' ? firstDeckEntry(body.deckText) : null;

  return (
    <section aria-label="Phone preview" className="flex flex-col items-center gap-2">
      <p className="self-start text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
      <div className="w-full max-w-[300px] rounded-[2.2rem] border-[7px] border-[#1A2B4C] bg-[#EAEFF6] p-3 font-sans text-[#1A2B4C] shadow-lg dark:border-[#0b1222]">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-[#1A2B4C]/20" aria-hidden />
        <p className="mb-2 text-[11px] font-semibold text-[#626B7F]">
          Explore · {categoryLabel(catalog.category) || 'Category'}
        </p>
        <div className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm">
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#EAEFF6] text-2xl"
            aria-hidden
          >
            {catalog.emoji || '✨'}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-[14px] font-bold">{catalog.title || 'Untitled'}</p>
            <p className="truncate text-[11px] text-[#626B7F]">
              {catalog.meta || `${catalog.duration || `${catalog.minutes} min`}`}
            </p>
            <div className="flex flex-wrap gap-1">
              {catalog.only && (
                <span className="rounded-full bg-[#FFC9DA] px-1.5 text-[10px] font-semibold text-[#8A2F5A]">
                  {catalog.only === 'spicy' ? 'Spicy' : catalog.only}
                </span>
              )}
              {catalog.price != null && catalog.price > 0 && (
                <span className="rounded-full bg-[#C9EAD6] px-1.5 text-[10px] font-semibold text-[#2B6A47]">
                  ${catalog.price}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-[#4E5A73]">
          {catalog.where.map((w) => (
            <span key={w} className="flex items-center gap-0.5 rounded-full bg-white/70 px-1.5 py-0.5">
              <MapPinIcon className="size-2.5" />
              {WHERE_LABEL[w]}
            </span>
          ))}
          <span className="flex items-center gap-0.5 rounded-full bg-white/70 px-1.5 py-0.5">
            <ClockIcon className="size-2.5" />
            {catalog.duration || `${catalog.minutes} min`}
          </span>
        </div>

        <div className="mt-4 min-h-48 rounded-2xl bg-white p-4 shadow-sm">
          {plays === 'cards' &&
            (body.cards[0] ? (
              <CardPreview card={body.cards[0]} />
            ) : (
              <p className="text-[12px] text-[#626B7F]">No cards yet.</p>
            ))}
          {plays === 'steps' && (
            <div className="flex flex-col gap-3">
              {body.intro && <p className="text-[12px] text-[#4E5A73]">{body.intro}</p>}
              {body.steps[0] ? (
                <StepPreview step={body.steps[0]} index={0} total={body.steps.length} />
              ) : (
                <p className="text-[12px] text-[#626B7F]">No steps yet.</p>
              )}
            </div>
          )}
          {plays === 'deck' &&
            (deck ? (
              <div className="flex flex-col gap-3">
                <p className="text-[17px] leading-snug font-bold">{deck.title}</p>
                {deck.line && <p className="text-[13px] text-[#4E5A73]">{deck.line}</p>}
                {deck.options?.map((o) => (
                  <span key={o} className="rounded-xl bg-[#EAEFF6] px-3 py-2 text-[12px] font-semibold">
                    {o}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[#626B7F]">The deck has no rounds yet.</p>
            ))}
          {plays === 'how' && (
            <p className="text-[13px] leading-relaxed">{body.how || body.howItPlays || 'How it plays.'}</p>
          )}
        </div>
        <div className={cn('mt-3 rounded-full bg-[#EC0137] py-2.5 text-center text-[13px] font-bold text-white')}>
          {plays === 'steps' ? 'Start now' : 'Play'}
        </div>
        {body.followUp && (
          <div className="mt-2 flex justify-center">
            <Badge
              variant="outline"
              className="max-w-full truncate border-[#1A2B4C]/20 bg-white text-[10px] text-[#1A2B4C]"
            >
              {body.followUp}
            </Badge>
          </div>
        )}
      </div>
    </section>
  );
}

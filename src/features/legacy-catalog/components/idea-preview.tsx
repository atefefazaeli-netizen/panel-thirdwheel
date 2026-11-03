import { ClockIcon, MapPinIcon } from 'lucide-react';
import { SVG_PATH } from '../schemas/legacy';

/** The round 1 idea card as the app drew it: icon tile, title, meta, price and why it fits. */
export function IdeaPreview({
  title,
  meta,
  reason,
  usd,
  per,
  d,
  kind,
  where,
  provider,
}: {
  title: string;
  meta: string;
  reason: string;
  usd: number | null;
  per: string;
  d: string;
  kind: string;
  where: string;
  provider: string;
}) {
  const icon = d && SVG_PATH.test(d) ? d : '';
  return (
    <section aria-label="Card preview" className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
      <div className="rounded-2xl bg-[#EAEFF6] p-3 text-[#1A2B4C]">
        <div className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#1A2B4C] text-white">
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {icon && <path d={icon} />}
            </svg>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-[15px] font-bold">{title || 'Untitled idea'}</p>
            <p className="flex items-center gap-1 truncate text-[12px] text-[#626B7F]">
              <ClockIcon className="size-3 shrink-0" aria-hidden />
              {meta || 'Meta line'}
            </p>
            <p className="text-[12px] font-semibold">
              {usd ? `$${usd}${per}` : 'Free'}
              {provider && <span className="font-normal text-[#626B7F]"> · {provider}</span>}
            </p>
          </div>
        </div>
        <p className="mt-2 px-1 text-[12px] leading-snug text-[#4E5A73]">{reason || 'Why it fits them.'}</p>
        <div className="mt-2 flex gap-1 px-1 text-[10px] text-[#4E5A73]">
          <span className="flex items-center gap-0.5 rounded-full bg-white/70 px-1.5 py-0.5">
            <MapPinIcon className="size-2.5" aria-hidden />
            {where === 'home' ? 'At home' : 'Out'}
          </span>
          <span className="rounded-full bg-white/70 px-1.5 py-0.5 capitalize">{kind}</span>
        </div>
      </div>
    </section>
  );
}

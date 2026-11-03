import { useFormContext } from 'react-hook-form';
import {
  FormFieldMultiSelect,
  FormFieldNumber,
  FormFieldSelect,
  FormFieldSwitch,
  FormFieldTags,
  FormFieldText,
  FormFieldTextarea,
} from '@/components/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ONLY_VALUES, WHERES } from '../api/types';
import { categoryLabel, ONLY_LABEL, WHERE_LABEL } from '../lib/labels';
import { HOW_YOU_PLAY, LIMITS, PLAY_VALUES, VIBES, type EditorValues } from '../schemas/editor';

export function CatalogTab({ categories, kind }: { categories: string[]; kind: string }) {
  const { control } = useFormContext<EditorValues>();
  const isGame = kind.startsWith('play') || kind === 'type-play';
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Explore row</CardTitle>
          <CardDescription>What Explore shows and filters on.</CardDescription>
        </CardHeader>
        <CardContent className="grid items-start gap-4 md:grid-cols-6">
          <FormFieldText
            control={control}
            name="catalog.title"
            label="Title"
            maxLength={LIMITS.title}
            className="md:col-span-4"
          />
          <FormFieldText
            control={control}
            name="catalog.emoji"
            label="Emoji"
            className="md:col-span-2"
            placeholder="Optional"
          />
          <FormFieldText
            control={control}
            name="catalog.meta"
            label="Meta line"
            maxLength={200}
            placeholder="Under 5 min · Two phones"
            className="md:col-span-6"
          />
          <FormFieldMultiSelect
            control={control}
            name="catalog.where"
            label="Where"
            options={WHERES.map((w) => ({ value: w, label: WHERE_LABEL[w]! }))}
            className="md:col-span-6"
          />
          <FormFieldSelect
            control={control}
            name="catalog.category"
            label="Category"
            options={categories.map((c) => ({ value: c, label: categoryLabel(c) }))}
            className="md:col-span-3"
          />
          <FormFieldText
            control={control}
            name="catalog.sub"
            label="Sub-category"
            placeholder="The Basics"
            className="md:col-span-3"
          />
          <FormFieldNumber
            control={control}
            name="catalog.minutes"
            label="Minutes"
            min={1}
            max={LIMITS.minutes}
            suffix="min"
            className="md:col-span-2"
          />
          <FormFieldText
            control={control}
            name="catalog.duration"
            label="Duration label"
            placeholder="5–15 min"
            className="md:col-span-2"
          />
          <FormFieldNumber
            control={control}
            name="catalog.price"
            label="Price for two"
            min={0}
            step={0.01}
            suffix="USD"
            description="Empty = free."
            className="md:col-span-2"
          />
          <FormFieldMultiSelect
            control={control}
            name="catalog.vibes"
            label="Vibes"
            options={VIBES.map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))}
            className="md:col-span-6"
          />
          <FormFieldSelect
            control={control}
            name="catalog.play"
            label={isGame ? 'Play (phones)' : 'Play'}
            noneLabel="Not set"
            options={PLAY_VALUES.map((v) => ({ value: v, label: v === 'one-phone' ? 'One phone' : 'Two phones' }))}
            className="md:col-span-3"
          />
          <FormFieldSelect
            control={control}
            name="catalog.only"
            label="Shows only when"
            noneLabel="Everyone"
            options={ONLY_VALUES.map((o) => ({ value: o, label: ONLY_LABEL[o]! }))}
            className="md:col-span-3"
          />
          <FormFieldSwitch
            control={control}
            name="catalog.sensitive"
            label="Sensitive"
            description="Sensitive quizzes become a Private match: answers stay sealed until both have answered."
            className="md:col-span-6"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Card screen text</CardTitle>
          <CardDescription>Lines the card screens show around the cards and steps.</CardDescription>
        </CardHeader>
        <CardContent className="grid items-start gap-4 md:grid-cols-2">
          <FormFieldTextarea
            control={control}
            name="body.intro"
            label="Intro"
            description="Do cards: the blurb under the title."
            rows={2}
            maxLength={LIMITS.text}
            className="md:col-span-2"
          />
          <FormFieldTextarea
            control={control}
            name="body.followUp"
            label="Follow-up chip"
            description="Opens Third Ear from the result."
            rows={2}
            maxLength={LIMITS.text}
          />
          <FormFieldSelect
            control={control}
            name="body.howYouPlay"
            label="How you play"
            noneLabel="Not set"
            options={HOW_YOU_PLAY.map((v) => ({ value: v, label: v }))}
          />
          <FormFieldTags
            control={control}
            name="body.need"
            label="What you need"
            max={LIMITS.list}
            className="md:col-span-2"
          />
          <FormFieldTextarea
            control={control}
            name="body.howItPlays"
            label="How it plays"
            rows={2}
            maxLength={LIMITS.text}
          />
          <FormFieldTextarea
            control={control}
            name="body.how"
            label="How (live and shelf games)"
            rows={2}
            maxLength={LIMITS.text}
          />
          <FormFieldTextarea
            control={control}
            name="body.safety"
            label="Safety line"
            rows={2}
            maxLength={LIMITS.text}
            className="md:col-span-2"
          />
        </CardContent>
      </Card>
    </div>
  );
}

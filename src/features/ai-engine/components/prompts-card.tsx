import { LockIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AiSettingsView } from '../api/types';
import { MODE_LABEL } from '../lib/labels';
import { PromptField } from './prompt-field';

function Locked({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed bg-muted/40 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <LockIcon className="size-3.5" aria-hidden />
        {title} <span className="font-normal text-muted-foreground">(locked)</span>
      </p>
      <p className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{text}</p>
    </div>
  );
}

export function PromptsCard({ view, readOnly }: { view: AiSettingsView; readOnly: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompts</CardTitle>
        <CardDescription>
          Only the task line per Third Ear mode and the quiz result style can change. Who Third Ear is, the safety rules
          and the JSON output contracts are locked and always follow your text.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="third-ear">
          <TabsList>
            <TabsTrigger value="third-ear">Third Ear modes</TabsTrigger>
            <TabsTrigger value="quiz">Quiz results</TabsTrigger>
          </TabsList>
          <TabsContent value="third-ear" className="mt-3 flex flex-col gap-3">
            {view.modes.map((m) => (
              <PromptField
                key={m}
                name={`prompts.modes.${m}`}
                label={MODE_LABEL[m] ?? m}
                defaultText={view.defaults.prompts.modes[m] ?? ''}
                readOnly={readOnly}
              />
            ))}
            <Locked title="Safety and tone rules" text={view.locked.chatRules} />
            <Locked title="Output contract" text={view.locked.chatOutput} />
          </TabsContent>
          <TabsContent value="quiz" className="mt-3 flex flex-col gap-3">
            <PromptField
              name="prompts.quizStyle"
              label="Quiz result style"
              defaultText={view.defaults.prompts.quizStyle}
              readOnly={readOnly}
            />
            <Locked title="Quiz privacy rules and output" text={view.locked.quizRules} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

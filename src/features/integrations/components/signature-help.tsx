import { ShieldCheckIcon } from 'lucide-react';
import { CopyButton } from '@/components/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { N8N_SNIPPET, NODE_SNIPPET, WEBHOOK_HEADERS } from '../lib/signature';

function Code({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative">
      <CopyButton
        value={code}
        iconOnly
        variant="secondary"
        label={`Copy the ${label} snippet`}
        className="absolute top-2 right-2"
      />
      <pre
        className="max-h-[420px] overflow-auto rounded-md bg-muted p-3 pr-12 font-mono text-xs leading-relaxed"
        tabIndex={0}
        aria-label={`${label} snippet`}
      >
        {code}
      </pre>
    </div>
  );
}

/** How to verify signatures: the headers and a copyable check for n8n and for Node.js. */
export function SignatureHelp() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-4" aria-hidden />
          How to verify signatures
        </CardTitle>
        <CardDescription>
          Every delivery is signed with the webhook's secret: <span className="font-mono">v1=</span> + hex HMAC-SHA256
          over <span className="font-mono">"&lt;timestamp&gt;.&lt;raw body&gt;"</span>. Check it over the raw body
          before parsing, reject timestamps more than 5 minutes off, and dedupe on the delivery id.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <table className="w-full text-sm" aria-label="Webhook headers">
          <tbody>
            {WEBHOOK_HEADERS.map(([h, v]) => (
              <tr key={h} className="border-b last:border-0">
                <th scope="row" className="py-1.5 pr-3 text-left font-mono text-xs font-medium whitespace-nowrap">
                  {h}
                </th>
                <td className="py-1.5 text-muted-foreground">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Tabs defaultValue="n8n">
          <TabsList>
            <TabsTrigger value="n8n">n8n Code node</TabsTrigger>
            <TabsTrigger value="node">Node.js</TabsTrigger>
          </TabsList>
          <TabsContent value="n8n" className="mt-2">
            <Code code={N8N_SNIPPET} label="n8n" />
            <p className="mt-2 text-xs text-muted-foreground">
              Turn on Raw Body in the Webhook node. Store the secret as THIRDWHEEL_WEBHOOK_SECRET.
            </p>
          </TabsContent>
          <TabsContent value="node" className="mt-2">
            <Code code={NODE_SNIPPET} label="Node.js" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

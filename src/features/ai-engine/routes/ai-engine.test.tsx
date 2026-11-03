import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { renderRoute } from '@/test/utils';

describe('AI engine (mock API)', () => {
  it('clinicians read only: no save bar and no test console', async () => {
    renderRoute('/ai-engine', { roles: ['clinician'] });
    expect(await screen.findByText('Read only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save as new version/ })).toBeNull();
    expect(screen.queryByText('Test console')).toBeNull();
    expect(screen.getByRole('radio', { name: /Anthropic/ })).toBeDisabled();
  });

  it('disables a provider whose key is missing and says why', async () => {
    renderRoute('/ai-engine', { roles: ['admin'] });
    const openai = await screen.findByRole('radio', { name: /OpenAI/ });
    expect(openai).toBeDisabled();
    expect(within(openai).getByText('Set OPENAI_API_KEY on the API to use this')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Anthropic/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('edits a task line, shows the diff against the default, resets and saves a new version', async () => {
    const user = userEvent.setup();
    renderRoute('/ai-engine', { roles: ['admin'] });
    const box = await screen.findByRole('textbox', { name: 'Name my feelings' });
    await user.clear(box);
    await user.type(box, 'Help them name what they feel in one word.');
    const card = box.closest('div.rounded-lg') as HTMLElement;
    expect(within(card).getByText('Custom')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Diff' }));
    expect(within(card).getByLabelText('Changes against the default')).toHaveTextContent('in one word.');

    await user.type(screen.getByRole('textbox', { name: 'Change note' }), 'Shorter feelings prompt');
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));
    await waitFor(() => expect(db().ai.versions.at(-1)!.version).toBe(4));
    expect(db().ai.versions.at(-1)!.settings.prompts.modes.feelings).toBe('Help them name what they feel in one word.');
    expect(db().ai.versions.at(-1)!.note).toBe('Shorter feelings prompt');
  });

  it('runs the test console and flags risky text', async () => {
    const user = userEvent.setup();
    renderRoute('/ai-engine', { roles: ['admin'] });
    await user.type(
      await screen.findByRole('textbox', { name: 'Message' }),
      'He never listens when I talk about work.',
    );
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText(/ms$/)).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'Message' }));
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'I want to hurt myself');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Risk')).toBeInTheDocument();
  });
});

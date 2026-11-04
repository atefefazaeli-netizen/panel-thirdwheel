import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { renderRoute } from '@/test/utils';

// Typing-heavy: allow for a busy CI machine (the 5 s default timed out under load on a clean checkout too).
describe('AI engine (mock API)', { timeout: 20_000 }, () => {
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
    expect(screen.getByText('Real model reply')).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'Message' }));
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'I want to hurt myself');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Safety reply (risk check)')).toBeInTheDocument();
  });

  it('labels built-in copy as fallback, never as a model reply', async () => {
    const user = userEvent.setup();
    renderRoute('/ai-engine', { roles: ['admin'] });
    await user.click(await screen.findByRole('switch', { name: /Fallback only/ }));
    await user.click(screen.getByRole('switch', { name: 'Use unsaved changes' }));
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'We argued about dishes.');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Fallback copy, not the model')).toBeInTheDocument();
    expect(screen.getByText(/No model reply was used/)).toBeInTheDocument();
  });

  it('sends the version it edited; a save that lost to another admin is refused and explained', async () => {
    const user = userEvent.setup();
    renderRoute('/ai-engine', { roles: ['admin'] });
    const box = await screen.findByRole('textbox', { name: 'Name my feelings' });
    // Another admin saves while this page is open.
    const v = db().ai.versions.at(-1)!;
    db().ai.versions.push({ ...structuredClone(v), version: v.version + 1, note: 'Someone else' });
    await user.clear(box);
    await user.type(box, 'My edit.');
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));
    expect(await screen.findByText('Someone else saved the AI settings')).toBeInTheDocument();
    expect(db().ai.versions.at(-1)!.note).toBe('Someone else');
    expect(box).toHaveValue('My edit.');
    await user.click(screen.getByRole('button', { name: 'Reload the newest version' }));
    await waitFor(() => expect(screen.queryByText('Someone else saved the AI settings')).toBeNull());
  });
});

// Google Keep Plugin for Synapse
// Saves notes and reminders to Google Keep

synapse.register('save_note', async (ctx) => {
    synapse.log('Google Keep: save_note triggered');

    // Check authentication
    const isAuth = await synapse.auth.isAuthenticated('google');
    if (!isAuth) {
        synapse.log('Google Keep: Requesting authentication');
        try {
            await synapse.auth.authenticate('google');
        } catch (e) {
            return synapse.fail({
                reason: 'auth_required',
                message: 'Please sign in with Google to save to Keep',
                retryable: true
            });
        }
    }

    // Extract note content from context
    const title = ctx.llm.entities.title || '';
    const body = ctx.llm.entities.body || ctx.input.text || '';
    const labels = ctx.llm.entities.labels || [];

    if (!body) {
        return synapse.fail({
            reason: 'validation',
            message: 'Note content is required'
        });
    }

    // Build the note request
    // Google Keep API: POST https://keep.googleapis.com/v1/notes
    const noteBody = {
        title: title,
        body: {
            text: {
                text: body
            }
        }
    };

    synapse.log('Google Keep: Creating note - ' + title);

    try {
        const res = await synapse.fetch('https://keep.googleapis.com/v1/notes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(noteBody)
        });

        if (res.ok) {
            const data = await res.json();
            synapse.log('Google Keep: Note created - ' + data.name);

            await synapse.ui.toast('Saved to Google Keep!');

            return synapse.success({
                noteId: data.name,
                title: title || '(Untitled)',
                message: 'Note saved to Google Keep',
                link: `https://keep.google.com`
            });
        } else {
            const error = await res.text();
            synapse.log('Google Keep: Error - ' + error);
            return synapse.fail({
                reason: 'api_error',
                message: 'Failed to save note: ' + res.statusText
            });
        }
    } catch (e) {
        return synapse.fail({
            reason: 'network_error',
            message: e.message,
            retryable: true
        });
    }
});

// Alias for different trigger phrases
synapse.register('create_reminder', async (ctx) => {
    // For now, treat reminders as notes
    // Full reminder support would require additional API calls
    return synapse._dispatch('save_note', ctx);
});

synapse.register('add_to_keep', async (ctx) => {
    return synapse._dispatch('save_note', ctx);
});

// Quick capture - saves current input directly
synapse.register('quick_save_keep', async (ctx) => {
    // Override entities with raw input
    ctx.llm.entities.body = ctx.input.text;
    ctx.llm.entities.title = '';
    return synapse._dispatch('save_note', ctx);
});

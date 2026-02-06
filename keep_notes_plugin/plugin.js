// Google Keep (Native) - Synapse Plugin
// 
// This plugin uses native OS capabilities to create notes in Google Keep.
// - Android: Sends an Intent to com.google.android.keep
// - iOS: Runs the "Create Keep Note" Shortcut

synapse.register('create_note', async (ctx) => {
    synapse.log('Google Keep Native: create_note triggered');

    // 1. Parse Input
    // We prioritize the body, but fallback to title if that's all we have
    let text = ctx.llm.entities.body || ctx.input.body || '';
    const title = ctx.llm.entities.title || ctx.input.title;

    if (title && text) {
        text = `${title}\n\n${text}`;
    } else if (title && !text) {
        text = title;
    }

    if (!text) {
        return synapse.fail({
            reason: 'validation',
            message: 'Note content is empty. Please provide text for the note.'
        });
    }

    try {
        synapse.log(`Attempting to create note with text length: ${text.length}`);

        // 2. Try Android Intent
        // We attempt this blindly; if we are on iOS it might fail or be ignored by the host.
        // Ideally the host exposes platform info, but we'll try both "fire and forget" style 
        // or rely on the host to handle the unsupported one gracefully.

        // Android Intent: ACTION_SEND to com.google.android.keep
        try {
            await synapse.system.sendIntent({
                action: 'android.intent.action.SEND',
                type: 'text/plain',
                package: 'com.google.android.keep',
                extras: {
                    'android.intent.extra.TEXT': text
                }
            });
            synapse.log('Sent Android Intent to Google Keep');
        } catch (e) {
            synapse.log(`Android Intent failed (expected on iOS): ${e.message}`);
        }

        // 3. Try iOS Shortcut
        // Name: "Create Keep Note" (User must have this shortcut)
        try {
            await synapse.system.runShortcut('Create Keep Note', text);
            synapse.log('Triggered iOS Shortcut: Create Keep Note');
        } catch (e) {
            synapse.log(`iOS Shortcut failed (expected on Android): ${e.message}`);
        }

        return synapse.success({
            message: 'Note creation triggered on device.',
            data: { text }
        });

    } catch (e) {
        return synapse.fail({
            reason: 'system_error',
            message: e.message || 'Failed to trigger native action'
        });
    }
});

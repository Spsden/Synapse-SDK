// Google Keep - Synapse Plugin
// 
// This plugin creates notes in Google Keep using the Enterprise API.

synapse.register('create_note', async (ctx) => {
  synapse.log('Google Keep: create_note triggered');

  // 1. Check Authentication
  if (!await synapse.auth.isAuthenticated('google')) {
    synapse.log('User not authenticated, triggering login...');
    try {
      await synapse.auth.authenticate('google');
    } catch (e) {
      return synapse.fail({
        reason: 'auth_failed',
        message: 'Authentication failed or cancelled.'
      });
    }
  }

  // 2. Parse Input
  // Entities might come from LLM or direct input
  const title = ctx.llm.entities.title || ctx.input.title || 'Untitled Note';
  const bodyText = ctx.llm.entities.body || ctx.input.body || '';

  if (!bodyText && title === 'Untitled Note') {
    return synapse.fail({
      reason: 'validation',
      message: 'Note must have a title or body.'
    });
  }

  // 3. Call Google Keep API
  const noteData = {
    title: title,
    body: {
      text: {
        text: bodyText
      }
    }
  };

  try {
    const res = await synapse.fetch('https://keep.googleapis.com/v1/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(noteData)
    });

    if (!res.ok) {
      let errorMsg = res.statusText;
      try {
        const errBody = await res.json();
        errorMsg = errBody.error?.message || errorMsg;
      } catch (e) { /* ignore json parse error */ }

      return synapse.fail({
        reason: 'api_error',
        message: `Google Keep API Error: ${errorMsg}`
      });
    }

    const newNote = await res.json();

    return synapse.success({
      message: `Note created: ${title}`,
      noteId: newNote.name, // Keep API returns resource name
      link: `https://keep.google.com/` // Deep linking to specific note might differ, fallback to main app
    });

  } catch (e) {
    return synapse.fail({
      reason: 'network_error',
      message: e.message || 'Failed to connect to Google Keep'
    });
  }
});

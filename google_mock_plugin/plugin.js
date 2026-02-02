// Google Mock Plugin - Synapse
// 
// Mocks a Google Keep like experience with OAuth

synapse.register('list_notes', async (ctx) => {
    synapse.log('google_mock: list_notes triggered');

    // 1. Check Authentication using the standard API
    const isAuth = await synapse.auth.isAuthenticated('google');

    if (!isAuth) {
        synapse.log('google_mock: Not authenticated, requesting login...');
        try {
            // 2. Request Authentication
            await synapse.auth.authenticate('google');
            synapse.log('google_mock: Authentication successful');
        } catch (e) {
            return synapse.fail({
                reason: 'auth_failed',
                message: 'User declined login'
            });
        }
    }

    // 3. Return Mock Data
    synapse.log('google_mock: Fetching notes...');

    // Simulate network delay
    await new Promise(r => setTimeout(r, 500));

    return synapse.success({
        notes: [
            { id: '1', title: 'Groceries', body: 'Milk, Eggs, Bread' },
            { id: '2', title: 'Ideas', body: 'Build a robot that answers emails' },
            { id: '3', title: 'To Do', body: 'Finish Synapse SDK' }
        ]
    });
});

synapse.register('add_note', async (ctx) => {
    const isAuth = await synapse.auth.isAuthenticated('google');
    if (!isAuth) {
        try {
            await synapse.auth.authenticate('google');
        } catch (e) {
            return synapse.fail({ reason: 'auth_failed', message: 'Login required to add note' });
        }
    }

    const text = ctx.llm.entities.body || ctx.input.text || 'New Note';
    const title = ctx.llm.entities.title || 'Untitled';

    // Mock saving
    await new Promise(r => setTimeout(r, 800));

    return synapse.success({
        action: 'created',
        note: {
            id: Math.floor(Math.random() * 1000).toString(),
            title: title,
            body: text
        }
    });
});

synapse.register('logout', async (ctx) => {
    await synapse.auth.logout('google');
    return synapse.success({ message: 'Logged out of Mock Google' });
});

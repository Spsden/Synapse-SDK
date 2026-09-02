// This would be loaded AFTER the SDK
// synapse is available globally

synapse.register('create_event', async (ctx) => {
    console.log('[Plugin] Received create_event:', ctx);
    const params = ctx.llm?.entities || {};

    // Validate params
    if (!params.title || !params.time) {
        throw new Error('Missing title or time');
    }

    // Perform mock network request
    console.log('[Plugin] Requesting network...');
    const response = await synapse.fetch('https://api.google.com/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
            summary: params.title,
            time: params.time
        }
    });

    console.log('[Plugin] Network response:', response);

    if (response.ok) {
        return synapse.success({
            message: 'Event created!',
            link: 'https://calendar.google.com/event/123'
        });
    } else {
        throw new Error('Network failed');
    }
});

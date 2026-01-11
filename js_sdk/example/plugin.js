// This would be loaded AFTER the SDK
// synapse is available globally

synapse.register('create_event', async (params) => {
    console.log('[Plugin] Received create_event:', params);

    // Validate params
    if (!params.title || !params.time) {
        throw new Error('Missing title or time');
    }

    // Perform mock network request
    console.log('[Plugin] Requesting network...');
    const response = await synapse.net.post('https://api.google.com/calendar', {
        summary: params.title,
        time: params.time
    });

    console.log('[Plugin] Network response:', response);

    if (response.status === 200) {
        return synapse.success({
            message: 'Event created!',
            link: 'https://calendar.google.com/event/123'
        });
    } else {
        throw new Error('Network failed');
    }
});

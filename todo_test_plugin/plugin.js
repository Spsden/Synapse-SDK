// Add to Todo - Test Plugin
// 
// This plugin fetches a todo from jsonplaceholder and logs it.

synapse.register('add_todo', async (ctx) => {
  synapse.log('Test Plugin: add_todo triggered');

  try {
    synapse.log('Fetching todo from jsonplaceholder...');
    const res = await synapse.fetch('https://jsonplaceholder.typicode.com/todos/1');

    if (!res.ok) {
      synapse.log(`Error: ${res.statusText}`);
      return synapse.fail({
        reason: 'api_error',
        message: `Failed to fetch todo: ${res.statusText}`
      });
    }

    const todo = await res.json();
    synapse.log(`Fetched todo: ${JSON.stringify(todo)}`);

    return synapse.success({
      message: `Successfully fetched todo: ${todo.title}`,
      data: todo
    });

  } catch (e) {
    synapse.log(`Exception: ${e.message}`);
    return synapse.fail({
      reason: 'network_error',
      message: e.message || 'Unknown network error'
    });
  }
});

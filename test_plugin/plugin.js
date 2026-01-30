// test_plugin - Synapse Plugin
// 
// This plugin is triggered by: my_action
// 
// The context (ctx) object contains:
//   ctx.input.text     - Raw input text
//   ctx.llm.entities   - Entities extracted by the LLM
//   ctx.plugin.id      - This plugin's ID

synapse.register('my_action', async (ctx) => {
  synapse.log('test_plugin: my_action triggered');
  
  // Get input from context
  const text = ctx.llm.entities.text || ctx.input.text;
  
  if (!text) {
    return synapse.fail({
      reason: 'validation',
      message: 'Text is required'
    });
  }
  
  // Example: Make an API request
  // const res = await synapse.fetch('https://api.example.com/endpoint', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ text })
  // });
  // 
  // if (res.ok) {
  //   const data = await res.json();
  //   return synapse.success({ data });
  // }
  
  // Return success
  return synapse.success({
    message: 'Action completed!',
    input: text
  });
});

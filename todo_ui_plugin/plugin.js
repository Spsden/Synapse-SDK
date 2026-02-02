// Todo UI - Test Plugin
// 
// This plugin displays a form to the user using synapse.ui.show

synapse.register('open_todo_form', async (ctx) => {
  synapse.log('Todo UI: open_todo_form triggered');

  // Define the HTML for the form
  const html = `
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
      .form-group { margin-bottom: 15px; }
      label { display: block; margin-bottom: 5px; font-weight: bold; }
      input, textarea { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
      button { background-color: #007bff; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; width: 100%; font-size: 16px; }
      button:hover { background-color: #0056b3; }
    </style>
    <div>
      <div class="form-group">
        <label for="title">Todo Title</label>
        <input type="text" id="title" placeholder="Enter task title..." required />
      </div>
      <div class="form-group">
        <label for="desc">Description</label>
        <textarea id="desc" rows="3" placeholder="Enter details..."></textarea>
      </div>
      <button onclick="submitForm()">Add Todo</button>
    </div>
    <script>
      function submitForm() {
        const title = document.getElementById('title').value;
        const desc = document.getElementById('desc').value;
        
        if (!title) {
          // You could show a toast here in a real app
          return;
        }

        // Send data back to the plugin
        SynapseBridge.postMessage({
          action: 'submit',
          data: { title, description: desc }
        });
      }
    </script>
  `;

  // Show the UI
  try {
    const result = await synapse.ui.show(html, {
      title: 'Add New Todo',
      width: 400,
      height: 400
    });

    // Check if we got data back
    if (result && result.action === 'submit') {
      const { title, description } = result.data;
      synapse.log(`User submitted: ${title} - ${description}`);

      return synapse.success({
        message: `Created Todo: ${title}`,
        data: { title, description }
      });
    } else {
      synapse.log('UI closed without submission');
      return synapse.fail({
        reason: 'cancelled',
        message: 'User cancelled the operation'
      });
    }

  } catch (e) {
    return synapse.fail({
      reason: 'ui_error',
      message: e.message || 'Failed to show UI'
    });
  }
});

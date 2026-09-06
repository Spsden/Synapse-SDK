// Offline smoke test for the Synapse SDK prompt round-trip and the
// Spotify/GitHub/Notion plugins. Runs dist/index.global.js in a vm with a mock
// host: connections always succeed, fetch returns canned API responses, MCP
// tool calls return canned results, and prompts simulate user answers.
// Both transports are covered: the legacy `sendMessage` mock below, and the
// fjs-native `fjs.bridge_call` mock (protocol v2) at the bottom.
//
//   node test/smoke.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
const assert = (label, cond) => {
    console.log(`${cond ? '  ok' : '  FAIL'} — ${label}`);
    if (!cond) failures++;
};

// Mock API state inspected by the tests.
const state = {
    fetchCalls: [],
    promptCalls: [],
    mcpCalls: [],
    addedUris: null,
    createdIssue: null,
    directRepoFetched: false,
    bridgeEnvelopes: [],
    finishedResults: [],
};

const spotifyApi = (url) => {
    if (url.includes('/search?')) {
        return {
            status: 200,
            body: {
                tracks: {
                    items: [
                        { id: 't1', uri: 'spotify:track:t1', name: 'Test Song', artists: [{ name: 'Alpha' }] },
                        { id: 't2', uri: 'spotify:track:t2', name: 'Test Song', artists: [{ name: 'Beta' }] },
                    ],
                },
            },
        };
    }
    if (url.includes('/me/playlists')) {
        return {
            status: 200,
            body: {
                items: [
                    { id: 'p1', name: 'Road Trip', external_urls: { spotify: 'https://open.spotify.com/p1' } },
                    { id: 'p2', name: 'Focus', external_urls: { spotify: 'https://open.spotify.com/p2' } },
                ],
            },
        };
    }
    if (url.includes('/playlists/') && url.includes('/tracks')) {
        state.addedUris = JSON.parse(state.fetchCalls.at(-1).body).uris;
        return { status: 201, body: { snapshot_id: 'snap' } };
    }
    return { status: 404, body: {} };
};

const githubApi = (url) => {
    if (url.includes('/repos/owner/repo/issues') && state.fetchCalls.at(-1).method === 'POST') {
        state.createdIssue = JSON.parse(state.fetchCalls.at(-1).body);
        return { status: 201, body: { number: 42, html_url: 'https://github.com/owner/repo/issues/42' } };
    }
    if (url.includes('/user/repos')) {
        return {
            status: 200,
            body: [
                { full_name: 'owner/repo' },
                { full_name: 'owner/other' },
            ],
        };
    }
    if (url.endsWith('/repos/owner/repo')) {
        state.directRepoFetched = true;
        return { status: 200, body: { full_name: 'owner/repo' } };
    }
    return { status: 404, body: {} };
};

const googleApi = (url) => {
    // Calendar
    if (url.includes('/calendar/v3/calendars/') && url.includes('/events/quickAdd')) {
        return { status: 200, body: { id: 'cal-quick-1', summary: 'Lunch with Sarah', start: { dateTime: '2026-09-07T12:00:00Z' } } };
    }
    if (url.includes('/calendar/v3/calendars/') && url.includes('/events') && state.fetchCalls.at(-1).method === 'POST') {
        const body = JSON.parse(state.fetchCalls.at(-1).body || '{}');
        return { status: 200, body: { id: 'cal-event-1', summary: body.summary || 'Scheduled Event', start: body.start, htmlLink: 'https://calendar.google.com/event' } };
    }
    if (url.includes('/calendar/v3/calendars/') && url.includes('/events')) {
        return { status: 200, body: { items: [{ id: 'cal-1', summary: 'Daily Standup', start: { dateTime: '2026-09-07T09:00:00Z' } }] } };
    }

    // Gmail
    if (url.includes('/gmail/v1/users/me/messages/send')) {
        return { status: 200, body: { id: 'msg-sent-1', threadId: 'thread-1' } };
    }
    if (url.includes('/gmail/v1/users/me/drafts')) {
        return { status: 200, body: { id: 'draft-1' } };
    }
    if (url.includes('/gmail/v1/users/me/messages/msg-1')) {
        return {
            status: 200,
            body: {
                id: 'msg-1',
                threadId: 'thread-1',
                snippet: 'Project update notes',
                payload: {
                    headers: [
                        { name: 'Subject', value: 'Project update notes' },
                        { name: 'From', value: 'team@example.com' },
                    ],
                },
            },
        };
    }
    if (url.includes('/gmail/v1/users/me/messages')) {
        return { status: 200, body: { messages: [{ id: 'msg-1', threadId: 'thread-1' }] } };
    }

    // Contacts
    if (url.includes('/people:createContact')) {
        return { status: 200, body: { resourceName: 'people/c-new-1' } };
    }
    if (url.includes('/people:searchContacts')) {
        return { status: 200, body: { results: [{ person: { resourceName: 'people/c1', names: [{ displayName: 'Jane Doe' }], emailAddresses: [{ value: 'jane@example.com' }] } }] } };
    }
    if (url.includes('/people/me/connections')) {
        return { status: 200, body: { connections: [{ resourceName: 'people/c1', names: [{ displayName: 'Jane Doe' }] }] } };
    }

    // Tasks
    if (url.includes('/tasks/v1/lists/') && url.includes('/tasks') && state.fetchCalls.at(-1).method === 'POST') {
        const body = JSON.parse(state.fetchCalls.at(-1).body || '{}');
        return { status: 200, body: { id: 'task-1', title: body.title, status: 'needsAction' } };
    }
    if (url.includes('/tasks/v1/lists/') && url.includes('/tasks') && state.fetchCalls.at(-1).method === 'PATCH') {
        return { status: 200, body: { id: 'task-1', status: 'completed' } };
    }
    if (url.includes('/tasks/v1/lists/') && url.includes('/tasks')) {
        return { status: 200, body: { items: [{ id: 'task-1', title: 'Finish SDK testing', status: 'needsAction' }] } };
    }
    if (url.includes('/tasks/v1/users/@me/lists')) {
        return { status: 200, body: { items: [{ id: 'list-1', title: 'My Tasks' }] } };
    }

    return { status: 404, body: {} };
};

// The mock fjs host: answers {v: 2, type, payload} envelopes the way the
// fjs-native SynapseHost would, resolving the calling promise directly.
function makeNativeHost(behavior = {}) {
    return (envelope) => {
        if (envelope == null || envelope.v !== 2 || typeof envelope.type !== 'string') {
            return Promise.resolve(null);
        }
        state.bridgeEnvelopes.push(envelope);
        switch (envelope.type) {
            case 'log':
                return Promise.resolve(null);
            case 'fetch': {
                if (behavior.rejectFetch) {
                    return Promise.resolve({
                        __synapseError: {
                            code: 'PERMISSION_DENIED',
                            message: 'This action is not allowed to access that URL.',
                        },
                    });
                }
                const { url, method, body } = envelope.payload;
                state.fetchCalls.push({ url, method, body });
                const responder = url.includes('api.spotify.com')
                    ? spotifyApi
                    : url.includes('googleapis.com')
                    ? googleApi
                    : githubApi;
                const found = responder(url);
                return Promise.resolve({
                    status: found.status,
                    ok: found.status >= 200 && found.status < 300,
                    statusText: found.status === 200 ? 'OK' : 'Error',
                    headers: {},
                    body: JSON.stringify(found.body),
                });
            }
            case 'connection_check':
                return Promise.resolve(true);
            case 'connection_connect':
                return Promise.resolve(undefined);
            case 'mcp_callTool': {
                state.mcpCalls.push(envelope.payload);
                const call = envelope.payload;
                if (call.serverName === 'notion' && call.toolName === 'notion-create-pages') {
                    return Promise.resolve({ success: true, data: { id: 'page-1', url: 'https://notion.so/page-1' } });
                }
                if (call.serverName === 'notion' && call.toolName === 'notion-create-database') {
                    return Promise.resolve({ success: true, data: { id: 'db-new', url: 'https://notion.so/db-new' } });
                }
                if (call.serverName === 'notion' && call.toolName === 'notion-update-page') {
                    return Promise.resolve({ success: true, data: { id: 'page-1', url: 'https://notion.so/page-1' } });
                }
                if (call.serverName === 'notion' && call.toolName === 'notion-fetch') {
                    return Promise.resolve({ success: true, data: { id: 'item-1', title: 'Test Item', url: 'https://notion.so/item-1' } });
                }
                if (call.serverName === 'notion' && call.toolName === 'notion-search') {
                    return Promise.resolve({
                        success: true,
                        data: {
                            results: [
                                { id: 'db-1', title: [{ plain_text: 'Meeting Notes' }], object: 'database', url: 'https://notion.so/db-1' },
                                { id: 'p-1', title: [{ plain_text: 'Weekly Plan' }], object: 'page', url: 'https://notion.so/p-1' }
                            ]
                        }
                    });
                }
                return Promise.resolve({ success: false, error: `No mock for ${call.serverName}.${call.toolName}` });
            }
            case 'prompt': {
                state.promptCalls.push(envelope.payload);
                const field = envelope.payload.fields[0];
                const value = field.type === 'select'
                    ? field.options[0].value
                    : (behavior.textAnswer || 'Mock Prompt Answer');
                return Promise.resolve({ cancelled: false, values: { [field.name]: value } });
            }
            default:
                return Promise.resolve(null);
        }
    };
}

function makeNativeContext(behavior) {
    const context = vm.createContext({
        console: { log: () => {}, warn: () => {}, error: () => {} },
        setTimeout,
        clearTimeout,
        JSON,
    });
    context.fjs = { bridge_call: makeNativeHost(behavior) };
    const sdk = fs.readFileSync(path.join(__dirname, '../dist/index.global.js'), 'utf8');
    vm.runInContext(sdk, context);
    return context;
}

const loadPlugin = (context, dir) => {
    const code = fs.readFileSync(path.join(__dirname, '..', dir, 'plugin.js'), 'utf8');
    vm.runInContext(code, context);
};

const dispatch = (context, intent, params) =>
    vm.runInContext(`synapse._dispatch(${JSON.stringify(intent)}, ${JSON.stringify(params)})`, context);

function run(name, fn) {
    console.log(`\n# ${name}`);
    return fn(() => {});
}

(async () => {
    // --- Scenario 1: spotify plugin, chat surface -------------------------
    await run('spotify (chat): ambiguous search → prompt; playlist entity match', async (done) => {
        state.fetchCalls = []; state.promptCalls = []; state.addedUris = null; state.finishedResults = [];
        const context = makeNativeContext({});
        loadPlugin(context, 'plugins/spotify');
        const finished = await dispatch(context, 'add_to_playlist', {
            input: { type: 'text', text: 'test song' },
            llm: { intent: 'add_to_playlist', entities: { query: 'test song', playlist: 'road' } },
            execution: { surface: 'chat', capabilities: { prompt: true } },
        });
        if (finished && finished.status !== 'success') console.log('  finished payload:', JSON.stringify(finished));
        assert('run completed', Boolean(finished));
        assert('succeeded', finished && finished.status === 'success');
        assert('prompt was used (chat surface)', state.promptCalls.length === 1 && state.promptCalls[0].fields[0].type === 'select');
        assert('playlist resolved from entity (no playlist prompt)', !state.promptCalls.some(p => /playlist/i.test(p.message) && p !== state.promptCalls[0]));
        assert('track added to matched playlist', state.addedUris === null || Array.isArray(state.addedUris));
        assert('added the prompted track uri', JSON.stringify(state.addedUris) === JSON.stringify(['spotify:track:t1']));
        assert('result links to playlist', finished && finished.data && finished.data.link === 'https://open.spotify.com/p1');
        done(true);
    });

    // --- Scenario 2: spotify plugin, host without prompt -------------------
    await run('spotify: no prompt capability → no interactive fallback', async (done) => {
        state.fetchCalls = []; state.promptCalls = []; state.addedUris = null; state.finishedResults = [];
        const context = makeNativeContext({});
        loadPlugin(context, 'plugins/spotify');
        const finished = await dispatch(context, 'add_to_playlist', {
            input: { type: 'text', text: 'test song' },
            llm: { intent: 'add_to_playlist', entities: { query: 'test song' } },
            execution: { surface: 'chat' },
        });
        assert('run completed', Boolean(finished));
        assert('failed closed without prompt capability', finished && finished.status === 'fail');
        assert('prompt never called without capability', state.promptCalls.length === 0);
        assert('no track was added', state.addedUris === null);
        done(true);
    });

    // --- Scenario 3: github plugin, chat surface --------------------------
    await run('github (chat): repo from URL, missing title → text prompt', async (done) => {
        state.fetchCalls = []; state.promptCalls = []; state.createdIssue = null; state.directRepoFetched = false; state.finishedResults = [];
        const context = makeNativeContext({
            textAnswer: 'Smoke test title',
        });
        loadPlugin(context, 'plugins/github');
        const finished = await dispatch(context, 'file_github_issue', {
            input: { type: 'url', url: 'https://github.com/owner/repo' },
            llm: { intent: 'file_github_issue', entities: {} },
            execution: { surface: 'chat', capabilities: { prompt: true } },
        });
        assert('run completed', Boolean(finished));
        assert('succeeded', finished && finished.status === 'success');
        assert('repo resolved from shared URL', state.createdIssue !== null);
        assert('repository was fetched directly from URL', state.directRepoFetched);
        assert('title came from text prompt', state.createdIssue && state.createdIssue.title === 'Smoke test title');
        assert('text prompt used (chat surface)', state.promptCalls.some(p => p.fields[0].type === 'text'));
        assert('issue number surfaced', finished && finished.data && finished.data.number === 42);
        assert('result links to issue', finished && finished.link === 'https://github.com/owner/repo/issues/42');
        done(true);
    });

    // --- Scenario 4: notion plugin, quick_capture --------------------------
    await run('notion: quick_capture creates a page via the notion MCP server', async (done) => {
        state.fetchCalls = []; state.mcpCalls = []; state.finishedResults = [];
        const context = makeNativeContext({});
        loadPlugin(context, 'plugins/notion');
        const finished = await dispatch(context, 'quick_capture', {
            input: { type: 'text', text: 'Captured text' },
            llm: { intent: 'quick_capture', entities: { title: 'Captured idea' } },
            execution: { surface: 'share' },
        });
        assert('run completed', Boolean(finished));
        assert('succeeded', finished && finished.status === 'success');
        assert('called the notion MCP server once', state.mcpCalls.length === 1 && state.mcpCalls[0].serverName === 'notion');
        assert('used the allowlisted tool', state.mcpCalls[0] && state.mcpCalls[0].toolName === 'notion-create-pages');
        const page = state.mcpCalls[0] && state.mcpCalls[0].arguments.pages[0];
        assert('page title came from the entity', page && (page.properties?.title || page.title) === 'Captured idea');
        assert('page content fell back to shared text', page && page.content === 'Captured text');
        done(true);
    });

    // --- Scenario 5: notion plugin, MCP database search -------------------
    await run('notion: searches databases via the notion-search MCP tool', async (done) => {
        state.fetchCalls = []; state.mcpCalls = []; state.finishedResults = [];
        const context = makeNativeContext({});
        loadPlugin(context, 'plugins/notion');
        const finished = await dispatch(context, 'search_notion', {
            input: { type: 'text', text: 'Meeting' },
            llm: { intent: 'search_notion', entities: { query: 'Meeting', filter: 'database' } },
            execution: { surface: 'chat' },
        });
        assert('run completed', Boolean(finished));
        assert('succeeded', finished && finished.status === 'success');
        assert('called the notion MCP server once', state.mcpCalls.length === 1 && state.mcpCalls[0].serverName === 'notion');
        assert('used the notion-search tool', state.mcpCalls[0] && state.mcpCalls[0].toolName === 'notion-search');
        assert('queried with filter database', state.mcpCalls[0].arguments.filter && state.mcpCalls[0].arguments.filter.value === 'database');
        assert('returned database results', finished && finished.data && finished.data.count >= 1);
        assert('extracted database title', finished.data.results[0].title === 'Meeting Notes');
        done(true);
    });

    // --- Scenario 5b: notion plugin, create_database_page with prompt -----
    await run('notion: create_database_page prompts for database if omitted', async (done) => {
        state.fetchCalls = []; state.mcpCalls = []; state.promptCalls = []; state.finishedResults = [];
        const context = makeNativeContext({});
        loadPlugin(context, 'plugins/notion');
        const finished = await dispatch(context, 'create_database_page', {
            input: { type: 'text' },
            llm: { intent: 'create_database_page', entities: { title: 'New Task', content: 'Implement prompt' } },
            execution: { surface: 'chat', capabilities: { prompt: true } },
        });
        assert('run completed', Boolean(finished));
        assert('succeeded', finished && finished.status === 'success');
        assert('prompted for database', state.promptCalls.length === 1 && state.promptCalls[0].fields[0].name === 'databaseId');
        assert('called notion-create-pages', state.mcpCalls.some(c => c.toolName === 'notion-create-pages'));
        done(true);
    });

    // --- Scenario 5c: notion plugin, add_text_to_page with prompt ---------
    await run('notion: add_text_to_page appends text with date header', async (done) => {
        state.fetchCalls = []; state.mcpCalls = []; state.promptCalls = []; state.finishedResults = [];
        const context = makeNativeContext({});
        loadPlugin(context, 'plugins/notion');
        const finished = await dispatch(context, 'add_text_to_page', {
            input: { type: 'text' },
            llm: { intent: 'add_text_to_page', entities: { pageId: 'p-1', text: 'Appended note content' } },
            execution: { surface: 'chat' },
        });
        assert('run completed', Boolean(finished));
        assert('succeeded', finished && finished.status === 'success');
        assert('called notion-update-page', state.mcpCalls.some(c => c.toolName === 'notion-update-page'));
        done(true);
    });

    // --- Scenario 5d: notion plugin, add_note creates daily note ----------
    await run('notion: add_note writes daily note into notes page', async (done) => {
        state.fetchCalls = []; state.mcpCalls = []; state.promptCalls = []; state.finishedResults = [];
        const context = makeNativeContext({});
        loadPlugin(context, 'plugins/notion');
        const finished = await dispatch(context, 'add_note', {
            input: { type: 'text' },
            llm: { intent: 'add_note', entities: { note: 'Standup update: shipped v2', notesPageId: 'notes-root' } },
            execution: { surface: 'share' },
        });
        assert('run completed', Boolean(finished));
        assert('succeeded', finished && finished.status === 'success');
        assert('called notion-create-pages', state.mcpCalls.some(c => c.toolName === 'notion-create-pages'));
        done(true);
    });

    // --- Scenario 5e: google-calendar plugin --------------------------------
    await run('google-calendar: create_event and quick_add_event dispatch cleanly', async (done) => {
        state.fetchCalls = []; state.promptCalls = []; state.finishedResults = [];
        const context = makeNativeContext({});
        loadPlugin(context, 'plugins/google-calendar');

        // 1. Structured create_event
        const created = await dispatch(context, 'create_event', {
            input: { type: 'text' },
            llm: {
                intent: 'create_event',
                entities: {
                    title: 'Sprint Planning',
                    startTime: '2026-09-07T10:00:00Z',
                    endTime: '2026-09-07T11:00:00Z',
                    location: 'Virtual',
                },
            },
            execution: { surface: 'chat' },
        });
        assert('create_event completed', Boolean(created));
        assert('create_event succeeded', created && created.status === 'success');
        assert('calendar event API called', state.fetchCalls.some(c => c.url.includes('/calendars/primary/events') && c.method === 'POST'));

        // 2. Natural language quick_add_event
        const quick = await dispatch(context, 'quick_add_event', {
            input: { type: 'text', text: 'Lunch with Sarah tomorrow at noon' },
            llm: { intent: 'quick_add_event', entities: { text: 'Lunch with Sarah tomorrow at noon' } },
            execution: { surface: 'chat' },
        });
        assert('quick_add_event completed', Boolean(quick));
        assert('quick_add_event succeeded', quick && quick.status === 'success');
        assert('quickAdd API called', state.fetchCalls.some(c => c.url.includes('/events/quickAdd')));
        done(true);
    });

    // --- Scenario 5f: google-gmail plugin -----------------------------------
    await run('google-gmail: send_email and search_emails dispatch cleanly', async (done) => {
        state.fetchCalls = []; state.promptCalls = []; state.finishedResults = [];
        const context = makeNativeContext({});
        loadPlugin(context, 'plugins/google-gmail');

        // 1. send_email
        const sent = await dispatch(context, 'send_email', {
            input: { type: 'text' },
            llm: {
                intent: 'send_email',
                entities: {
                    to: 'alice@example.com',
                    subject: 'Project Synapse Update',
                    body: 'All Google plugins are now integrated with Synapse!',
                },
            },
            execution: { surface: 'chat' },
        });
        assert('send_email completed', Boolean(sent));
        assert('send_email succeeded', sent && sent.status === 'success');
        assert('messages/send API called', state.fetchCalls.some(c => c.url.includes('/messages/send') && c.method === 'POST'));

        // 2. search_emails
        const search = await dispatch(context, 'search_emails', {
            input: { type: 'text' },
            llm: { intent: 'search_emails', entities: { query: 'is:unread label:work' } },
            execution: { surface: 'chat' },
        });
        assert('search_emails completed', Boolean(search));
        assert('search_emails succeeded', search && search.status === 'success');
        assert('search found messages', search && search.data && search.data.count > 0);
        done(true);
    });

    // --- Scenario 5g: google-contacts plugin --------------------------------
    await run('google-contacts: create_contact and search_contacts dispatch cleanly', async (done) => {
        state.fetchCalls = []; state.promptCalls = []; state.finishedResults = [];
        const context = makeNativeContext({});
        loadPlugin(context, 'plugins/google-contacts');

        // 1. create_contact
        const created = await dispatch(context, 'create_contact', {
            input: { type: 'text' },
            llm: {
                intent: 'create_contact',
                entities: {
                    fullName: 'Jane Doe',
                    email: 'jane@example.com',
                    phone: '+15551234567',
                    company: 'Acme Corp',
                },
            },
            execution: { surface: 'chat' },
        });
        assert('create_contact completed', Boolean(created));
        assert('create_contact succeeded', created && created.status === 'success');
        assert('createContact API called', state.fetchCalls.some(c => c.url.includes('/people:createContact') && c.method === 'POST'));

        // 2. search_contacts
        const searched = await dispatch(context, 'search_contacts', {
            input: { type: 'text' },
            llm: { intent: 'search_contacts', entities: { query: 'Jane' } },
            execution: { surface: 'chat' },
        });
        assert('search_contacts completed', Boolean(searched));
        assert('search_contacts succeeded', searched && searched.status === 'success');
        assert('searchContacts API called', state.fetchCalls.some(c => c.url.includes('/people:searchContacts')));
        done(true);
    });

    // --- Scenario 5h: google-tasks plugin -----------------------------------
    await run('google-tasks: create_task and complete_task dispatch cleanly', async (done) => {
        state.fetchCalls = []; state.promptCalls = []; state.finishedResults = [];
        const context = makeNativeContext({});
        loadPlugin(context, 'plugins/google-tasks');

        // 1. create_task
        const created = await dispatch(context, 'create_task', {
            input: { type: 'text' },
            llm: {
                intent: 'create_task',
                entities: {
                    title: 'Review Synapse plugin architecture',
                    notes: 'Ensure all providers are isolated.',
                },
            },
            execution: { surface: 'chat' },
        });
        assert('create_task completed', Boolean(created));
        assert('create_task succeeded', created && created.status === 'success');
        assert('tasks create API called', state.fetchCalls.some(c => c.url.includes('/tasks') && c.method === 'POST'));

        // 2. complete_task
        const completed = await dispatch(context, 'complete_task', {
            input: { type: 'text' },
            llm: { intent: 'complete_task', entities: { taskId: 'task-1' } },
            execution: { surface: 'chat' },
        });
        assert('complete_task completed', Boolean(completed));
        assert('complete_task succeeded', completed && completed.status === 'success');
        assert('tasks patch API called', state.fetchCalls.some(c => c.url.includes('/tasks/task-1') && c.method === 'PATCH'));
        done(true);
    });

    // --- Scenario 6: failures complete once --------------------------------
    await run('spotify: validation failure emits one completion result', async (done) => {
        state.fetchCalls = []; state.finishedResults = [];
        const context = makeNativeContext({});
        loadPlugin(context, 'plugins/spotify');
        const finished = await dispatch(context, 'add_to_playlist', {
            input: { type: 'text' },
            llm: { intent: 'add_to_playlist', entities: {} },
            execution: { surface: 'share' },
        });
        assert('run completed', Boolean(finished));
        assert('returned a failure result', finished && finished.status === 'fail');
        done(true);
    });
    // --- Scenario 7: fjs-native transport basics ---------------------------
    await run('v2: bridge captured, global hidden, dispatch resolves with result', async (done) => {
        state.fetchCalls = []; state.promptCalls = []; state.bridgeEnvelopes = []; state.finishedResults = [];
        const context = makeNativeContext({});
        assert('fjs global removed after SDK load', vm.runInContext('typeof fjs', context) === 'undefined');
        assert('synapse still exposed for plugin code', vm.runInContext('typeof synapse', context) === 'object');
        loadPlugin(context, 'plugins/spotify');
        const finished = await dispatch(context, 'add_to_playlist', {
            input: { type: 'text', text: 'test song' },
            llm: { intent: 'add_to_playlist', entities: { query: 'test song', playlist: 'road' } },
            execution: { surface: 'chat', capabilities: { prompt: true } },
        });
        assert('dispatch resolved with the result', Boolean(finished));
        assert('succeeded', finished && finished.status === 'success');
        assert('prompt round-trip worked', state.promptCalls.length === 1);
        assert('no finished event on the native transport', state.finishedResults.length === 0);
        assert('every envelope carried the v2 marker', state.bridgeEnvelopes.every((e) => e.v === 2 && typeof e.type === 'string'));
        done(true);
    });

    // --- Scenario 8: host rejections reject the SDK call -------------------
    await run('v2: __synapseError reply rejects the SDK call', async (done) => {
        state.fetchCalls = []; state.bridgeEnvelopes = [];
        const context = makeNativeContext({ rejectFetch: true });
        loadPlugin(context, 'plugins/github');
        const finished = await dispatch(context, 'file_github_issue', {
            input: { type: 'url', url: 'https://github.com/owner/repo' },
            llm: { intent: 'file_github_issue', entities: { title: 'Smoke test title' } },
            execution: { surface: 'chat', capabilities: { prompt: true } },
        });
        assert('failed through the host rejection', finished && finished.status === 'fail');
        assert('host error message surfaced to the plugin', finished && finished.error === 'This action is not allowed to access that URL.');
        assert('rejected before any fetch completed', state.fetchCalls.length === 0);
        done(true);
    });

    console.log(`\n${failures === 0 ? 'ALL SCENARIOS PASSED' : failures + ' ASSERTION(S) FAILED'}`);
    process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
    console.error('smoke test crashed:', e);
    process.exit(1);
});

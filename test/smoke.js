// Offline smoke test for the Synapse SDK prompt round-trip and the
// Spotify/GitHub/Notion plugins. Runs dist/index.global.js in a vm with a mock
// host: auth always succeeds, fetch returns canned API responses, and
// prompt/ui_show simulate user answers.
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
    uiShowCalls: [],
    addedUris: null,
    createdIssue: null,
    directRepoFetched: false,
    notionPage: null,
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

const notionApi = (url) => {
    if (url.endsWith('/search')) {
        return {
            status: 200,
            body: {
                results: [{
                    id: 'database-1',
                    title: [{ plain_text: 'Ideas' }],
                    properties: { Task: { type: 'title' } },
                }],
            },
        };
    }
    if (url.endsWith('/pages')) {
        state.notionPage = JSON.parse(state.fetchCalls.at(-1).body);
        return { status: 200, body: { id: 'page-1', url: 'https://notion.so/page-1' } };
    }
    return { status: 404, body: {} };
};

// The mock host: answers bridge messages the way SynapseHost would.
function makeHost(context, behavior) {
    return (channel, msgStr) => {
        const msg = JSON.parse(msgStr);
        if (channel !== 'synapse') return;
        const reply = (data) =>
            vm.runInContext(
                `synapse._bridge.resolve('${msg.id}', ${JSON.stringify(data)}, null)`,
                context
            );

        switch (msg.type) {
            case 'log':
                return;
            case 'auth_check':
                return reply(true);
            case 'fetch': {
                const { url, method, body } = msg.payload;
                state.fetchCalls.push({ url, method, body });
                const responder = url.includes('api.spotify.com')
                    ? spotifyApi
                    : url.includes('api.notion.com')
                        ? notionApi
                        : githubApi;
                const found = responder(url);
                reply({
                    status: found.status,
                    ok: found.status >= 200 && found.status < 300,
                    statusText: found.status === 200 ? 'OK' : 'Error',
                    headers: {},
                    body: JSON.stringify(found.body),
                });
                return;
            }
            case 'prompt': {
                state.promptCalls.push(msg.payload);
                const field = msg.payload.fields[0];
                if (field.type === 'select') {
                    reply({ cancelled: false, values: { [field.name]: field.options[0].value } });
                } else {
                    reply({ cancelled: false, values: { [field.name]: behavior.textAnswer } });
                }
                return;
            }
            case 'ui_show': {
                state.uiShowCalls.push(msg.payload);
                const html = String(msg.payload.html || '');
                const answer = /playlist/i.test(html)
                    ? { action: 'selected', id: 'p2' }
                    : (behavior.uiAnswer || { action: 'selected', id: 'spotify:track:t2' });
                reply(answer);
                return;
            }
            case 'finished':
                state.finishedResults.push(msg.payload);
                behavior.onFinished(msg.payload);
                return;
            default:
                reply(null);
        }
    };
}

function makeContext(behavior) {
    const context = vm.createContext({
        console: { log: () => {}, warn: () => {}, error: () => {} },
        setTimeout,
        clearTimeout,
        JSON,
    });
    context.sendMessage = makeHost(context, behavior);
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

const waitFor = (getResult) => new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
        const r = getResult();
        if (r !== undefined) return resolve(r);
        if (Date.now() - start > 4000) return resolve(undefined);
        setTimeout(tick, 10);
    };
    tick();
});

(async () => {
    // --- Scenario 1: spotify plugin, chat surface -------------------------
    await run('spotify (chat): ambiguous search → prompt; playlist entity match', async (done) => {
        state.fetchCalls = []; state.promptCalls = []; state.uiShowCalls = []; state.addedUris = null; state.finishedResults = [];
        let finished;
        const context = makeContext({ onFinished: (r) => (finished = r) });
        loadPlugin(context, 'spotify_plugin');
        dispatch(context, 'add_to_playlist', {
            input: { type: 'text', text: 'test song' },
            llm: { intent: 'add_to_playlist', entities: { query: 'test song', playlist: 'road' } },
            execution: { surface: 'chat', capabilities: { prompt: true } },
        });
        if (finished && finished.status !== 'success') console.log('  finished payload:', JSON.stringify(finished));
        finished = await waitFor(() => finished);
        assert('run completed', Boolean(finished));
        assert('succeeded', finished && finished.status === 'success');
        assert('prompt was used (chat surface)', state.promptCalls.length === 1 && state.promptCalls[0].fields[0].type === 'select');
        assert('no HTML UI on chat surface', state.uiShowCalls.length === 0);
        assert('playlist resolved from entity (no playlist prompt)', !state.promptCalls.some(p => /playlist/i.test(p.message) && p !== state.promptCalls[0]));
        assert('track added to matched playlist', state.addedUris === null || Array.isArray(state.addedUris));
        assert('added the prompted track uri', JSON.stringify(state.addedUris) === JSON.stringify(['spotify:track:t1']));
        assert('result links to playlist', finished && finished.data && finished.data.link === 'https://open.spotify.com/p1');
        done(true);
    });

    // --- Scenario 2: spotify plugin, chat host without prompt --------------
    await run('spotify (chat): no prompt capability → HTML UI', async (done) => {
        state.fetchCalls = []; state.promptCalls = []; state.uiShowCalls = []; state.addedUris = null; state.finishedResults = [];
        let finished;
        const context = makeContext({
            uiAnswer: { action: 'selected', id: 'spotify:track:t2' },
            onFinished: (r) => (finished = r),
        });
        loadPlugin(context, 'spotify_plugin');
        dispatch(context, 'add_to_playlist', {
            input: { type: 'text', text: 'test song' },
            llm: { intent: 'add_to_playlist', entities: { query: 'test song' } },
            execution: { surface: 'chat' },
        });
        finished = await waitFor(() => finished);
        if (!finished || finished.status !== 'success') console.log('  finished payload:', JSON.stringify(finished), 'uiShow:', state.uiShowCalls.length, 'fetches:', state.fetchCalls.map(c => c.method + ' ' + c.url).join(' | '));
        assert('run completed', Boolean(finished));
        assert('HTML UI used for both questions', state.uiShowCalls.length === 2);
        assert('prompt never called without capability', state.promptCalls.length === 0);
        assert('added the UI-selected track uri', JSON.stringify(state.addedUris) === JSON.stringify(['spotify:track:t2']));
        done(true);
    });

    // --- Scenario 3: github plugin, chat surface --------------------------
    await run('github (chat): repo from URL, missing title → text prompt', async (done) => {
        state.fetchCalls = []; state.promptCalls = []; state.uiShowCalls = []; state.createdIssue = null; state.directRepoFetched = false; state.finishedResults = [];
        let finished;
        const context = makeContext({
            textAnswer: 'Smoke test title',
            onFinished: (r) => (finished = r),
        });
        loadPlugin(context, 'github_plugin');
        dispatch(context, 'file_github_issue', {
            input: { type: 'url', url: 'https://github.com/owner/repo' },
            llm: { intent: 'file_github_issue', entities: {} },
            execution: { surface: 'chat', capabilities: { prompt: true } },
        });
        finished = await waitFor(() => finished);
        assert('run completed', Boolean(finished));
        assert('succeeded', finished && finished.status === 'success');
        assert('repo resolved from shared URL', state.createdIssue !== null);
        assert('repository was fetched directly from URL', state.directRepoFetched);
        assert('title came from text prompt', state.createdIssue && state.createdIssue.title === 'Smoke test title');
        assert('text prompt used (chat surface)', state.promptCalls.some(p => p.fields[0].type === 'text'));
        assert('no HTML UI on chat surface', state.uiShowCalls.length === 0);
        assert('issue number surfaced', finished && finished.data && finished.data.number === 42);
        assert('result links to issue', finished && finished.link === 'https://github.com/owner/repo/issues/42');
        done(true);
    });

    // --- Scenario 4: notion plugin, custom database title property --------
    await run('notion: creates a page with the database title property', async (done) => {
        state.fetchCalls = []; state.notionPage = null; state.finishedResults = [];
        let finished;
        const context = makeContext({ onFinished: (r) => (finished = r) });
        loadPlugin(context, 'notion_plugin');
        dispatch(context, 'add_to_notion', {
            input: { type: 'text', text: 'Captured text' },
            llm: { intent: 'add_to_notion', entities: { title: 'Captured idea' } },
            execution: { surface: 'share' },
        });
        finished = await waitFor(() => finished);
        assert('run completed', Boolean(finished));
        assert('succeeded', finished && finished.status === 'success');
        assert('uses the database title property', state.notionPage && state.notionPage.properties.Task.title[0].text.content === 'Captured idea');
        done(true);
    });

    // --- Scenario 5: failures complete once --------------------------------
    await run('spotify: validation failure emits one completion result', async (done) => {
        state.fetchCalls = []; state.finishedResults = [];
        let finished;
        const context = makeContext({ onFinished: (r) => (finished = r) });
        loadPlugin(context, 'spotify_plugin');
        dispatch(context, 'add_to_playlist', {
            input: { type: 'text' },
            llm: { intent: 'add_to_playlist', entities: {} },
            execution: { surface: 'share' },
        });
        finished = await waitFor(() => finished);
        assert('run completed', Boolean(finished));
        assert('returned a failure result', finished && finished.status === 'fail');
        assert('emitted exactly one completion result', state.finishedResults.length === 1);
        done(true);
    });

    console.log(`\n${failures === 0 ? 'ALL SCENARIOS PASSED' : failures + ' ASSERTION(S) FAILED'}`);
    process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
    console.error('smoke test crashed:', e);
    process.exit(1);
});

// @ts-check
/// <reference path="../../types/synapse-global.d.ts" />

// Spotify Add to Playlist - Synapse Plugin

const SPOTIFY_API = 'https://api.spotify.com/v1';

async function addToPlaylist(ctx) {
  synapse.log('Spotify: add_to_playlist triggered');

  try {
    // 1. Connect (manifest v2 named connection)
    try {
      await ensureSpotifyConnection();
    } catch (e) {
      return synapse.fail({
        reason: 'auth_failed',
        message: 'Spotify login was declined or failed.'
      });
    }

    // 2. Resolve the track (direct link, single search hit, or ask)
    const track = await resolveTrack(ctx);
    if (!track) {
      return synapse.fail({
        reason: 'track_not_found',
        message: "Couldn't find that track on Spotify."
      });
    }

    // 3. Resolve the playlist (entity match, single playlist, or ask)
    const playlists = await fetchPlaylists();
    if (!playlists.length) {
      return synapse.fail({
        reason: 'no_playlists',
        message: 'No playlists found in your Spotify account.'
      });
    }
    const playlist = await resolvePlaylist(ctx, playlists);
    if (!playlist) {
      return synapse.fail({
        reason: 'cancelled',
        message: 'No playlist selected.'
      });
    }

    // 4. Add the track
    synapse.log(`Spotify: adding "${track.name}" to "${playlist.name}"`);
    const res = await synapse.fetch(`${SPOTIFY_API}/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [track.uri] }),
      connection: 'spotify'
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: errorData.error?.message || `Spotify API error: ${res.statusText}`
      });
    }

    return synapse.success({
      message: `Added "${track.name}" by ${track.artists} to "${playlist.name}".`,
      track: track.name,
      artists: track.artists,
      playlist: playlist.name,
      link: playlist.url
    });

  } catch (e) {
    synapse.log(`Spotify Error: ${e.message}`);
    return synapse.fail({
      reason: 'error',
      message: e.message || 'An unexpected error occurred.'
    });
  }
}

synapse.register('add_to_playlist', addToPlaylist);
synapse.register('add_to_spotify', addToPlaylist);
synapse.register('save_track_to_playlist', addToPlaylist);

async function ensureSpotifyConnection() {
  if (await synapse.connections.isConnected('spotify')) return;
  synapse.log('Spotify: requesting login');
  await synapse.connections.connect('spotify');
  if (!(await synapse.connections.isConnected('spotify'))) {
    throw new Error('Spotify connection was not completed.');
  }
}

// =============================================================================
// Track resolution
// =============================================================================

async function resolveTrack(ctx) {
  const entities = ctx.llm.entities;

  // Direct track link: https://open.spotify.com/track/<id>
  const url = ctx.input.url || (typeof entities.url === 'string' ? entities.url : '');
  const trackMatch = url.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
  if (trackMatch) {
    return await fetchTrack(trackMatch[1]);
  }

  const query = (typeof entities.query === 'string' && entities.query.trim())
    || [entities.title, entities.artist].filter(Boolean).join(' ')
    || ctx.input.text;
  if (!query || !query.trim()) {
    return null;
  }

  const tracks = await searchTracks(query.trim(), 6);
  if (!tracks.length) {
    return null;
  }
  if (tracks.length === 1) {
    return tracks[0];
  }

  const chosen = await chooseOption(
    ctx,
    `Which track did you mean? (searched: "${query.trim()}")`,
    tracks.map(t => ({ value: t.uri, label: `${t.name} — ${t.artists}` }))
  );
  return chosen ? tracks.find(t => t.uri === chosen) : null;
}

async function fetchTrack(id) {
  const res = await synapse.fetch(`${SPOTIFY_API}/tracks/${id}`, {
    connection: 'spotify'
  });
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  return mapTrack(data);
}

async function searchTracks(query, limit) {
  const res = await synapse.fetch(
    `${SPOTIFY_API}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
    { connection: 'spotify' }
  );
  if (!res.ok) {
    throw new Error(`Spotify search failed: ${res.statusText}`);
  }
  const data = await res.json();
  return (data.tracks?.items || []).map(mapTrack).filter(Boolean);
}

function mapTrack(item) {
  if (!item || !item.uri) {
    return null;
  }
  return {
    id: item.id,
    uri: item.uri,
    name: item.name,
    artists: (item.artists || []).map(a => a.name).join(', ')
  };
}

// =============================================================================
// Playlist resolution
// =============================================================================

async function fetchPlaylists() {
  const res = await synapse.fetch(`${SPOTIFY_API}/me/playlists?limit=50`, {
    connection: 'spotify'
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch playlists: ${res.statusText}`);
  }
  const data = await res.json();
  return (data.items || [])
    .filter(p => p && p.id)
    .map(p => ({
      id: p.id,
      name: p.name,
      url: p.external_urls?.spotify || 'https://open.spotify.com/'
    }));
}

async function resolvePlaylist(ctx, playlists) {
  const wanted = ctx.llm.entities.playlist;
  if (typeof wanted === 'string' && wanted.trim()) {
    const needle = wanted.trim().toLowerCase();
    const matches = playlists.filter(p => p.name.toLowerCase().includes(needle));
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      const chosen = await chooseOption(
        ctx,
        `Which playlist? (matched "${wanted.trim()}")`,
        matches.map(p => ({ value: p.id, label: p.name }))
      );
      return chosen ? matches.find(p => p.id === chosen) : null;
    }
    // No textual match — fall through to the full list.
  }

  if (playlists.length === 1) {
    return playlists[0];
  }

  const chosen = await chooseOption(
    ctx,
    'Which playlist should the track go in?',
    playlists.map(p => ({ value: p.id, label: p.name }))
  );
  return chosen ? playlists.find(p => p.id === chosen) : null;
}

// =============================================================================
// Dual-mode user interaction
// =============================================================================

function canPrompt(ctx) {
  return Boolean(ctx.execution?.capabilities?.prompt);
}

/**
 * Ask the user to pick one option using the host's native prompt surface.
 * Returns the chosen value, or null if the user cancelled.
 */
async function chooseOption(ctx, message, options) {
  if (!canPrompt(ctx)) return null;
  const result = await synapse.prompt({
    message,
    fields: [{
      name: 'choice',
      type: 'select',
      label: 'Choose',
      required: true,
      options
    }]
  });
  if (result.cancelled || !result.values || !result.values.choice) return null;
  return result.values.choice;
}

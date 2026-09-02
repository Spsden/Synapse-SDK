# Add to Spotify Playlist

A Synapse plugin that finds a track on Spotify and adds it to one of your
playlists.

## Triggers

- `add_to_playlist`
- `add_to_spotify`
- `save_track_to_playlist`

## How it works

1. Authenticates with Spotify (OAuth handled by the host).
2. Resolves the track from a shared Spotify link, LLM entities
   (`query` / `title` + `artist`), or the shared text. Ambiguous matches
   ask the user.
3. Resolves the playlist from the `playlist` entity when it uniquely
   matches one of the user's playlists; otherwise asks.
4. Adds the track and returns a link to the playlist.

## Dual-mode interaction

- **Chat runs** (`ctx.execution.surface === 'chat'`): questions are asked
  inside the conversation via `synapse.prompt()`.
- **Share runs**: an HTML picker is shown via `synapse.ui.show()`.

## Setup

Requires a Spotify OAuth provider named `spotify` configured in the host,
with the scopes declared in `manifest.json`.

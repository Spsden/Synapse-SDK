# Add to Spotify Playlist

A Synapse plugin that finds a track on Spotify and adds it to one of your
playlists.

## Triggers

- `add_to_playlist`
- `add_to_spotify`
- `save_track_to_playlist`

## How it works

1. Connects to Spotify through the `spotify` named connection (OAuth
   handled by the host).
2. Resolves the track from a shared Spotify link, LLM entities
   (`query` / `title` + `artist`), or the shared text. Ambiguous matches
   ask the user.
3. Resolves the playlist from the `playlist` entity when it uniquely
   matches one of the user's playlists; otherwise asks.
4. Adds the track and returns a link to the playlist.

## Dual-mode interaction

- **Chat runs** (`ctx.execution.surface === 'chat'`): questions are asked
  inside the conversation via `synapse.prompt()`.
- **Share runs**: Synapse renders the same prompt as a native form.

## Setup

Requires a `spotify` connection (alias `spotify`, OAuth provider
`spotify`, playlist read/modify scopes) declared in `manifest.json`. The
host manages the token and injects it into `synapse.fetch()` calls made
with `connection: 'spotify'`.

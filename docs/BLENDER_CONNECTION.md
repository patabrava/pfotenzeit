# Blender MCP connection

Configured on this Mac on 2026-10-09. Blender 5.2.2 LTS is installed at `/Applications/Blender.app`. This is a machine-level integration; the game has no runtime dependency on Blender or MCP.

## What is installed

- Official Blender Lab MCP extension 1.0.3, downloaded from [Blender's official release](https://projects.blender.org/lab/blender_mcp/releases/download/v1.0.3/mcp-1.0.3.zip).
- Official `blender-mcp` Python package 1.0.2, installed from source commit `dbbf836ad4b1025f14a2b3b504c43903f39e0b04` in an isolated virtual environment.
- Saved Blender preferences: extension enabled, Auto Start enabled, host `127.0.0.1`, port `9876`. Blender's Allow Online Access setting is enabled because the official extension requires it for its local socket.
- Global Codex MCP server named `blender`, registered in `~/.codex/config.toml`.
- A small local launcher that opens Blender on demand before interactive tool requests if the socket is unavailable. It also retries opening after Blender has been quit. It does not launch Blender at macOS login or continuously prevent the user from quitting it.

Official documentation: [Blender MCP](https://www.blender.org/lab/mcp-server/) and [source/setup](https://projects.blender.org/lab/blender_mcp/wiki/Setup).

## Use in Codex

Restart Codex after initial setup so it loads the new MCP server. Then ask naturally, for example: “Use Blender to refine Nala's model and export a GLB into the Ines project.” The global registration applies across projects on this Mac. Actual Blender edits still follow the task's authorization and project instructions.

Interactive tools operate on the open Blender scene. Inspect the scene and current file before editing; preserve unrelated objects and unsaved work. Save editable `.blend` sources and export game GLBs using the existing project contracts. MCP availability does not establish asset quality or validation.

## Configuration for Fable / another MCP client

Codex registration does not configure a separate Claude or other client. Add this stdio server to that client's MCP configuration on this same Mac:

```json
{
  "mcpServers": {
    "blender": {
      "command": "/Users/patabrava/.codex/integrations/blender/venv/bin/python",
      "args": ["/Users/patabrava/.codex/integrations/blender/launch.py"]
    }
  }
}
```

The launcher fixes the local bridge address and the Blender CLI path. Python tool code should assign a JSON-serializable dictionary to `result` to return data. Available tools include `execute_blender_code`, object/scene summaries, screenshots, API documentation lookup and background Blender execution. Avoid concurrent edits by different agents to the same open scene.

## Verification and maintenance

Observed successful MCP initialization, discovery of **26 tools**, and a real `execute_blender_code` query returning Blender **5.2.2 LTS**, scene `Scene`, and `Cube`, `Light`, `Camera`. The socket was observed listening only at `127.0.0.1:9876`. Saved preferences were checked in a separate background Blender process. The launcher recovery path is implemented; automatic reopening after quitting the live app was not exercised because the open scene was preserved.

Installation and evidence live in `/Users/patabrava/.codex/integrations/blender/`:

- `launch.py`: local on-demand launch adapter; vendor source is unchanged.
- `verify.py`: reproducible MCP initialization, tool discovery and live scene query.
- `verification.json`: observed protocol results.
- `addon-setup.json`: observed extension installation and settings.
- `source/`, `venv/`, `mcp-1.0.3.zip`: installed source, runtime and extension archive.

Recheck the live connection:

```sh
/Users/patabrava/.codex/integrations/blender/venv/bin/python /Users/patabrava/.codex/integrations/blender/verify.py
```

If tools are missing, restart the client and check its MCP settings. If the bridge is unavailable after Blender opens, check Preferences → Add-ons → MCP: enabled, Auto Start enabled, host `127.0.0.1`, port `9876`, and Allow Online Access enabled. A major Blender upgrade may require installing/enabling the extension in that version's preferences.

To unregister from Codex, use `codex mcp remove blender`; to disable the Blender listener, disable Auto Start/the MCP extension in Blender preferences. Unregistering alone does not alter Blender preferences.

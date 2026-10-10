"""Run a saved Python asset operation through the registered official Blender MCP."""
import asyncio, json, sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    source = Path(sys.argv[1])
    code = "exec(compile(" + repr(source.read_text()) + ", " + repr(str(source)) + ", 'exec'))"
    background = len(sys.argv) > 2
    params = (StdioServerParameters(command='/Users/patabrava/.codex/integrations/blender/venv/bin/blender-mcp', env={'BLENDER_PATH':'/Applications/Blender.app/Contents/MacOS/Blender','BLENDER_MCP_PORT':'9875'}) if background else StdioServerParameters(command='/Users/patabrava/.codex/integrations/blender/venv/bin/python',args=['/Users/patabrava/.codex/integrations/blender/launch.py']))
    async with stdio_client(params) as (read,write):
        async with ClientSession(read,write) as session:
            await session.initialize()
            response = await session.call_tool('execute_blender_code_for_cli' if background else 'execute_blender_code', {'blend_file':sys.argv[2], 'code':code} if background else {'code':code})
            structured = response.structuredContent
            print(json.dumps(structured or response.model_dump(mode='json'), indent=2))
            if response.isError or (structured and structured.get('status') == 'error'):
                raise SystemExit(1)
asyncio.run(main())

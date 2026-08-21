// ABOUTME: RFC 9728 protected-resource metadata, pointing MCP clients at our AuthKit domain.
// ABOUTME: withMcpAuth's 401 challenge names this exact path, so it must exist and stay here.
import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { loadConfig } from "../../../src/config";

const config = loadConfig();

export const GET = protectedResourceHandler({ authServerUrls: [config.workos.authkitDomain] });
export const OPTIONS = metadataCorsOptionsRequestHandler();

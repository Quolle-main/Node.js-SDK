import type { Quolle } from "./client";
import type { ApiKey, CreateApiKeyParams, CreatedApiKey } from "./types";

/**
 * API keys, exposed as `client.apiKeys`. Needs a full-access key: a
 * sending-only key gets 403 `restricted_api_key`.
 */
export class ApiKeysResource {
  constructor(private readonly client: Quolle) {}

  /** Active keys (the keys themselves are never returned, only a preview). */
  async list(): Promise<ApiKey[]> {
    return this.client.request<{ keys: ApiKey[] }>("GET", "/v1/keys").then((r) => r.keys);
  }

  /** Create a key. The returned `key` is shown once; store it now. */
  async create(params: CreateApiKeyParams): Promise<CreatedApiKey> {
    return this.client.request("POST", "/v1/keys", params);
  }

  /** Revoke a key. Requests made with it fail from now on. */
  async remove(id: string): Promise<{ message: string }> {
    return this.client.request("DELETE", `/v1/keys/${encodeURIComponent(id)}`);
  }
}

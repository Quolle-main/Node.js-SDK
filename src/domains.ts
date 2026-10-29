import type { Quolle } from "./client";
import type { Domain, CreateDomainResult } from "./types";

const enc = encodeURIComponent;

/** Sending domains, exposed as `client.domains`. Needs a full-access API key. */
export class DomainsResource {
  constructor(private readonly client: Quolle) {}

  /** Every sending domain on the account, with verification and warm-up state. */
  async list(): Promise<Domain[]> {
    return this.client.request<{ domains: Domain[] }>("GET", "/v1/domains").then((r) => r.domains);
  }

  /** Add a sending domain (e.g. `mail.example.com`). Returns the DNS records to publish. */
  async create(domain: string): Promise<CreateDomainResult> {
    return this.client.request("POST", "/v1/domains", { domain });
  }

  /** One domain by id. */
  async get(id: string): Promise<Domain> {
    return this.client.request<{ domain: Domain }>("GET", `/v1/domains/${enc(id)}`).then((r) => r.domain);
  }

  /** The DNS records to publish for a domain, and which of them are found. */
  async records(id: string): Promise<Record<string, unknown>> {
    return this.client.request("GET", `/v1/domains/${enc(id)}/records`);
  }

  /** Check DNS again now, instead of waiting for the next automatic check. */
  async verify(id: string): Promise<Record<string, unknown>> {
    return this.client.request("POST", `/v1/domains/${enc(id)}/recheck`);
  }

  /** Remove a domain. Mail can no longer be sent from it. */
  async remove(id: string): Promise<{ message: string }> {
    return this.client.request("DELETE", `/v1/domains/${enc(id)}`);
  }
}

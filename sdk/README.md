# Kavacha SDK

The Kavacha SDK is the **only** sanctioned surface a plugin has on the browser.
Plugins never touch Gecko internals, DOM, or Kavacha's engines directly — they
receive a small capability object and call it. Every capability is gated by a
permission the **user** granted, and only four capabilities exist at all.

See [`kavacha-plugin.schema.json`](./kavacha-plugin.schema.json) for the
manifest format and [ADR 0011](../documentation/decisions/0011-kavacha-sdk-plugins.md)
for the design rationale.

## Where plugins live

Plugins are **sideloaded** into the profile:

```
<profile>/kavacha-plugins/
  <plugin-id>/
    kavacha-plugin.json     # manifest (see the schema)
    <entry>.mjs             # ES module exporting activate(sdk) [, deactivate()]
  grants.json               # per-plugin granted permissions (managed by Kavacha)
  state.json                # per-plugin enabled flag (managed by Kavacha)
```

Manage them at **about:plugins**: enable/disable, grant/revoke permissions,
uninstall. Installing plugins from the **Marketplace** is a later integration;
for now, only sideload plugins you trust.

## Manifest

```json
{
  "id": "zotero-bridge",
  "name": "Zotero Bridge",
  "version": "1.0.0",
  "entry": "index.mjs",
  "permissions": ["workspaces", "tabs", "commands"]
}
```

`id` is kebab-case and must match the directory name. `permissions` lists what
the plugin *requests*; nothing takes effect until the user grants it.

## Entry module

```js
export async function activate(sdk) {
  // sdk is limited to the permissions the user granted this plugin.
  sdk.commands.register({
    label: "Open my research space",
    run: async ctx => {
      await sdk.workspaces.createFromTemplate("student");
    },
  });
}

export async function deactivate() {
  // Optional. Called on disable/uninstall. Commands the plugin registered are
  // removed automatically (by registry source), so cleanup here is for the
  // plugin's own timers/listeners.
}
```

## The permission model

`activate(sdk)` receives a facade from `KavachaSDK.forPlugin(id)`. Each method
throws unless the plugin holds the matching permission:

| Permission   | What it grants                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `workspaces` | `sdk.workspaces.list()`, `.current()`, `.createFromTemplate(kind)`. Read + safe create; no delete.|
| `tabs`       | `sdk.tabs.list()`, `.open(url)`, `.close(tabId)` on the active window. `url` must be http/https/about — never `file://` or `chrome://`. |
| `notes`      | `sdk.notes.read()`, `.write(text)` for the current workspace's note.                              |
| `commands`   | `sdk.commands.register({ label, run })` — adds a Cmd+K command; removed when the plugin is disabled.|

### What is structurally excluded

There is **no** permission for passwords, saved credentials, autofill, browsing
history, or chrome internals — and no SDK method that could reach them. This is
not a policy toggle that could be relaxed: the grantable enum is
`workspaces | tabs | notes | commands`, and the permission model rejects any
request outside it. A plugin cannot ask for private data, so the user can never
grant it.

## Security posture (today)

Granted plugins currently run in the parent module scope — they are
**trusted-on-grant sideloads**, and the SDK is the only *sanctioned* surface. A
real JS isolation boundary (a separate compartment/sandbox per plugin) is a
hardening follow-up (ADR 0011), and remote/marketplace install must land behind
it. Until then: only sideload plugins you trust.
